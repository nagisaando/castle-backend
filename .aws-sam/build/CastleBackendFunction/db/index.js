const isLambda = !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV);

let db;

if (isLambda) {
  // AWS Lambda environment - use RDS Data API
  const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');

  const rdsClient = new RDSDataClient({
    region: process.env.AWS_REGION || 'us-west-2'
  });

  // Helper function to convert RDS Data API response to pg-promise format
  function formatRdsResponse(response) {
    if (!response.records || response.records.length === 0) {
      return [];
    }

    const columnMetadata = response.columnMetadata || [];

    return response.records.map(record => {
      const row = {};
      record.forEach((field, index) => {
        const columnName = columnMetadata[index]?.name || `column_${index}`;

        // Extract value based on field type
        if (field.stringValue !== undefined) {
          row[columnName] = field.stringValue;
        } else if (field.longValue !== undefined) {
          row[columnName] = field.longValue;
        } else if (field.doubleValue !== undefined) {
          row[columnName] = field.doubleValue;
        } else if (field.booleanValue !== undefined) {
          row[columnName] = field.booleanValue;
        } else if (field.isNull) {
          row[columnName] = null;
        } else {
          row[columnName] = field.stringValue || null;
        }
      });
      return row;
    });
  }

  // Helper function to convert parameters to RDS Data API format
  function formatParameters(params = []) {
    return params.map((value, index) => {
      const param = {
        name: `p${index + 1}`
      };

      if (value === null || value === undefined) {
        param.value = { isNull: true };
      } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          param.value = { longValue: value };
        } else {
          param.value = { doubleValue: value };
        }
      } else if (typeof value === 'boolean') {
        param.value = { booleanValue: value };
      } else {
        param.value = { stringValue: String(value) };
      }

      return param;
    });
  }

  // Helper function to replace $1, $2, etc. with :p1, :p2, etc.
  function convertSqlParameters(sql) {
    return sql.replace(/\$(\d+)/g, ':p$1');
  }

  db = {
    async any(sql, params = []) {
      try {
        const convertedSql = convertSqlParameters(sql);
        const formattedParams = formatParameters(params);

        const command = new ExecuteStatementCommand({
          resourceArn: process.env.DB_CLUSTER_ARN,
          secretArn: process.env.DB_SECRET_ARN,
          database: process.env.DB_NAME,
          sql: convertedSql,
          parameters: formattedParams,
          includeResultMetadata: true
        });

        const response = await rdsClient.send(command);
        return formatRdsResponse(response);
      } catch (error) {
        console.error('RDS Data API error:', error);
        throw error;
      }
    },

    async one(sql, params = []) {
      const results = await this.any(sql, params);
      if (results.length === 0) {
        throw new Error('No data returned from the query.');
      }
      return results[0];
    },

    async none(sql, params = []) {
      await this.any(sql, params);
      return null;
    }
  };

} else {
  // Local development environment - use pg-promise
  const pgp = require('pg-promise')();
  db = pgp(process.env.DATABASE_URL);
}

module.exports = db;

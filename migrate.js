// Load environment variables first
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigrations() {
    try {
        console.log('🚀 Starting database migrations...');
        
        const migrationsDir = path.join(__dirname, 'migrations');
        
        // Check if migrations directory exists
        if (!fs.existsSync(migrationsDir)) {
            console.log('❌ No migrations directory found');
            return;
        }
        
        // Get all SQL files from migrations directory
        const migrationFiles = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort(); // Run migrations in order (001, 002, etc.)
        
        if (migrationFiles.length === 0) {
            console.log('ℹ️  No migration files found');
            return;
        }
        
        console.log(`📁 Found ${migrationFiles.length} migration file(s)`);
        
        // Run each migration
        for (const file of migrationFiles) {
            console.log(`⚡ Running migration: ${file}`);
            
            const filePath = path.join(migrationsDir, file);
            const sql = fs.readFileSync(filePath, 'utf8');
            
            // Execute the SQL
            await db.none(sql);
            
            console.log(`✅ Completed migration: ${file}`);
        }
        
        console.log('🎉 All migrations completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

// Run migrations and exit
runMigrations()
    .then(() => {
        console.log('👋 Migration process finished');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Unexpected error:', error);
        process.exit(1);
    });
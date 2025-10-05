require('dotenv').config();

const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const app = express()
app.use(express.json())

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)




const cors = require('cors');
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}))

// API Key middleware
app.use('/api', (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const expectedApiKey = process.env.API_KEY;

    if (!apiKey || apiKey !== expectedApiKey) {
        return res.status(401).json({ error: 'Invalid or missing API key' });
    }

    next();
});


app.get('/api/leaderboard', async (req, res) => {
    try {
        const { data: topScores, error } = await supabase
            .from('scores')
            .select('username, score, created_at')
            .order('score', { ascending: false })
            .limit(10);

        if (error) throw error;
        res.json(topScores);
    } catch (error) {
        res.status(500).json({
            error: error.message
        })
    }
})

app.post('/api/score', async (req, res) => {
    try {
        const { username, score } = req.body;

        // Validate required fields
        if (!username || score === undefined) {
            return res.status(400).json({
                error: 'Username and score are required'
            })
        }

        // Validate username: any characters, 1-10 chars
        if (typeof username !== 'string' || username.length < 1 || username.length > 10) {
            return res.status(400).json({
                error: 'Username must be 1-10 characters'
            })
        }

        // Validate score: must be number between 0-1000
        if (typeof score !== 'number' || score < 0 || score > 1000) {
            return res.status(400).json({
                error: 'Score must be a number between 0 and 1000'
            })
        }

        const { data: newScore, error: scoreError } = await supabase
            .from('scores')
            .insert({ username, score })
            .select()
            .single();

        if (scoreError) throw scoreError;

        res.json(newScore)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

module.exports = app;

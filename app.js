const express = require('express')

const app = express()
app.use(express.json())

const pgp = require('pg-promise')(/* options */)
const db = pgp(process.env.DATABASE_URL) // creating connection with database

const cors = require('cors');
const allowedOrigins = process.env.CORS_ORIGIN

app.use(cors({
    origin: allowedOrigins
}))

app.get('/api/leaderboard', async (req, res) => {
    try {
        const topScores = await db.any('SELECT username, score, created_at FROM scores ORDER BY score DESC LIMIT 10')
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

        if (!username || score === undefined) {
            return res.status(400).json({
                error: 'Username and score are required'
            })
        }

        const newScore = await db.one(
            'INSERT INTO scores(username, score) VALUES($1, $2) RETURNING *',
            [username, score]
        )
        res.json(newScore)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

module.exports = app;

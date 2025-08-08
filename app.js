const express = require('express')
const crypto = require('crypto')

const app = express()
app.use(express.json())

const db = require('./db');

// Session management now uses database table

// Cleanup expired sessions every 10 minutes
setInterval(async () => {
    try {
        await db.none('DELETE FROM sessions WHERE expires_at <= NOW()');
        console.log('Expired sessions cleaned up');
    } catch (error) {
        console.error('Session cleanup error:', error.message);
    }
}, 10 * 60 * 1000); // 10 minutes

// Cookie parsing utility
function parseCookies(cookieHeader) {
    const cookies = {};
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            const [name, value] = cookie.trim().split('=');
            cookies[name] = value;
        });
    }
    return cookies;
}

const cors = require('cors');
const allowedOrigins = process.env.CORS_ORIGIN

app.use(cors({
    origin: allowedOrigins
}))

// Game start endpoint - creates session
app.post('/api/game/start', async (req, res) => {
    try {
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
        
        // Insert session into database
        await db.one(
            'INSERT INTO sessions(session_id, expires_at) VALUES($1, $2) RETURNING session_id',
            [sessionId, expiresAt]
        );
        
        res.cookie('gameSession', sessionId, {
            maxAge: 60 * 60 * 1000, // 1 hour
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
        
        res.json({ success: true, sessionId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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

        // Parse cookies and validate session
        const cookies = parseCookies(req.headers.cookie);
        const sessionId = cookies.gameSession;

        if (!sessionId) {
            return res.status(401).json({
                error: 'No session found. Start a new game first.'
            });
        }

        // Check if session exists and is not expired
        const session = await db.oneOrNone(
            'SELECT session_id FROM sessions WHERE session_id = $1 AND expires_at > NOW()',
            [sessionId]
        );

        if (!session) {
            return res.status(401).json({
                error: 'Invalid or expired session. Start a new game first.'
            });
        }

        const newScore = await db.one(
            'INSERT INTO scores(username, score) VALUES($1, $2) RETURNING *',
            [username, score]
        )

        // Expire the session after successful score submission
        await db.none('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
        res.clearCookie('gameSession');

        res.json(newScore)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

module.exports = app;

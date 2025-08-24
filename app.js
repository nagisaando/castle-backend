require('dotenv').config();

const express = require('express')
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')
const app = express()
app.use(express.json())

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)



// Session management now uses database table

// Cleanup expired sessions every 10 minutes
setInterval(async () => {
    try {
        const { error } = await supabase
            .from('sessions')
            .delete()
            .lt('expires_at', new Date().toISOString());

        if (error) throw error;
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
    origin: allowedOrigins,
    credentials: true
}))

// Game start endpoint - creates session
app.post('/api/game/start', async (req, res) => {
    try {
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

        // Insert session into database
        const { data, error } = await supabase
            .from('sessions')
            .insert({ session_id: sessionId, expires_at: expiresAt.toISOString() })
            .select('session_id')
            .single();

        if (error) throw error;

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

        // Parse cookies and validate session
        const cookies = parseCookies(req.headers.cookie);
        const sessionId = cookies.gameSession;

        if (!sessionId) {
            return res.status(401).json({
                error: 'No session found. Start a new game first.'
            });
        }

        // Check if session exists and is not expired
        const { data: session, error: sessionError } = await supabase
            .from('sessions')
            .select('session_id')
            .eq('session_id', sessionId)
            .gt('expires_at', new Date().toISOString())
            .single();

        if (sessionError && sessionError.code !== 'PGRST116') throw sessionError; // PGRST116 = no rows found

        if (!session) {
            return res.status(401).json({
                error: 'Invalid or expired session. Start a new game first.'
            });
        }

        const { data: newScore, error: scoreError } = await supabase
            .from('scores')
            .insert({ username, score })
            .select()
            .single();

        if (scoreError) throw scoreError;

        // Expire the session after successful score submission
        const { error: deleteError } = await supabase
            .from('sessions')
            .delete()
            .eq('session_id', sessionId);

        if (deleteError) throw deleteError;
        res.clearCookie('gameSession');

        res.json(newScore)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

module.exports = app;

-- Migration: Create sessions table for game session management
-- Version: 001
-- Created: 2025-08-23

CREATE TABLE IF NOT EXISTS sessions (
    session_id UUID PRIMARY KEY,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster cleanup queries on expired sessions
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
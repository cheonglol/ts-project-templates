-- Migration: 002_create_users_table.sql
-- Description: Create users table with all required fields for the application
-- Applied: Auto-applied by migration system

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMP NULL
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

-- Composite index for soft delete queries
CREATE INDEX IF NOT EXISTS idx_users_active ON users(id) WHERE deleted_at IS NULL;

-- Composite index for status filtering on active users
CREATE INDEX IF NOT EXISTS idx_users_status_active ON users(status, created_at) WHERE deleted_at IS NULL;

-- Add constraints
ALTER TABLE users ADD CONSTRAINT chk_users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
ALTER TABLE users ADD CONSTRAINT chk_users_name_length CHECK (char_length(name) >= 2 AND char_length(name) <= 255);
ALTER TABLE users ADD CONSTRAINT chk_users_status_valid CHECK (status IN ('active', 'inactive', 'suspended', 'pending'));

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on any update
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample data for development/testing
INSERT INTO users (email, name, status) VALUES 
  ('admin@example.com', 'System Administrator', 'active'),
  ('user@example.com', 'Test User', 'active'),
  ('inactive@example.com', 'Inactive User', 'inactive')
ON CONFLICT (email) DO NOTHING;

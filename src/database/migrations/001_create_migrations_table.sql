-- Migration: 001_create_migrations_table.sql
-- Description: Create table to track applied migrations
-- Applied: Auto-applied by migration system

CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP DEFAULT NOW(),
  checksum VARCHAR(64) NOT NULL
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_migrations_filename ON migrations(filename);
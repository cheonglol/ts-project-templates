-- Base Schema Documentation
-- This file documents the complete database schema after all migrations
-- DO NOT execute this file directly - use the migration system instead

-- =============================================================================
-- MIGRATIONS TABLE
-- =============================================================================
-- Tracks applied database migrations
-- Created by: 001_create_migrations_table.sql

CREATE TABLE migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP DEFAULT NOW(),
  checksum VARCHAR(64) NOT NULL
);

CREATE INDEX idx_migrations_filename ON migrations(filename);

-- =============================================================================
-- USERS TABLE
-- =============================================================================
-- Main users table with profile information
-- Created by: 002_create_users_table.sql
-- Extended by: 003_add_user_profile_fields.sql

CREATE TABLE users (
  -- Core fields
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMP NULL, -- For soft delete
  
  -- Extended profile fields
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  avatar_url TEXT,
  bio TEXT,
  timezone VARCHAR(50) DEFAULT 'UTC',
  locale VARCHAR(10) DEFAULT 'en-US',
  last_login_at TIMESTAMP,
  email_verified_at TIMESTAMP,
  is_admin BOOLEAN DEFAULT FALSE NOT NULL
);

-- Core indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_name ON users(name);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

-- Composite indexes for performance
CREATE INDEX idx_users_active ON users(id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status_active ON users(status, created_at) WHERE deleted_at IS NULL;

-- Profile field indexes
CREATE INDEX idx_users_first_name ON users(first_name);
CREATE INDEX idx_users_last_name ON users(last_name);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_is_admin ON users(is_admin);
CREATE INDEX idx_users_last_login_at ON users(last_login_at);
CREATE INDEX idx_users_email_verified_at ON users(email_verified_at);

-- Constraints
ALTER TABLE users ADD CONSTRAINT chk_users_email_format 
  CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

ALTER TABLE users ADD CONSTRAINT chk_users_name_length 
  CHECK (char_length(name) >= 2 AND char_length(name) <= 255);

ALTER TABLE users ADD CONSTRAINT chk_users_status_valid 
  CHECK (status IN ('active', 'inactive', 'suspended', 'pending'));

ALTER TABLE users ADD CONSTRAINT chk_users_phone_format 
  CHECK (phone IS NULL OR phone ~* '^\+?[1-9]\d{1,14}$');

ALTER TABLE users ADD CONSTRAINT chk_users_timezone_length 
  CHECK (char_length(timezone) <= 50);

ALTER TABLE users ADD CONSTRAINT chk_users_locale_format 
  CHECK (locale ~* '^[a-z]{2}-[A-Z]{2}$');

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Auto-update name from first_name + last_name
CREATE OR REPLACE FUNCTION update_full_name()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL THEN
        NEW.name = TRIM(CONCAT(COALESCE(NEW.first_name, ''), ' ', COALESCE(NEW.last_name, '')));
        IF NEW.name = '' OR NEW.name IS NULL THEN
            NEW.name = COALESCE(NEW.first_name, NEW.last_name, 'Unknown User');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_users_update_full_name
    BEFORE INSERT OR UPDATE OF first_name, last_name ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_full_name();

-- =============================================================================
-- SAMPLE DATA
-- =============================================================================

INSERT INTO users (email, name, status) VALUES 
  ('admin@example.com', 'System Administrator', 'active'),
  ('user@example.com', 'Test User', 'active'),
  ('inactive@example.com', 'Inactive User', 'inactive')
ON CONFLICT (email) DO NOTHING;

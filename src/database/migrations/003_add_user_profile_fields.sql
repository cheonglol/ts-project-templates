-- Migration: 003_add_user_profile_fields.sql
-- Description: Add additional profile fields to users table
-- Applied: Auto-applied by migration system

-- Add profile-related columns
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'en-US',
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE NOT NULL;

-- Update existing name column to be computed from first_name + last_name if they exist
-- But keep it as a fallback for users who only have a single name field

-- Add indexes for the new fields
CREATE INDEX IF NOT EXISTS idx_users_first_name ON users(first_name);
CREATE INDEX IF NOT EXISTS idx_users_last_name ON users(last_name);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);
CREATE INDEX IF NOT EXISTS idx_users_email_verified_at ON users(email_verified_at);

-- Add constraints for new fields
ALTER TABLE users ADD CONSTRAINT chk_users_phone_format 
  CHECK (phone IS NULL OR phone ~* '^\+?[1-9]\d{1,14}$');

ALTER TABLE users ADD CONSTRAINT chk_users_timezone_length 
  CHECK (char_length(timezone) <= 50);

ALTER TABLE users ADD CONSTRAINT chk_users_locale_format 
  CHECK (locale ~* '^[a-z]{2}-[A-Z]{2}$');

-- Function to automatically update the name field from first_name and last_name
CREATE OR REPLACE FUNCTION update_full_name()
RETURNS TRIGGER AS $$
BEGIN
    -- If first_name or last_name is provided, update the name field
    IF NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL THEN
        NEW.name = TRIM(CONCAT(COALESCE(NEW.first_name, ''), ' ', COALESCE(NEW.last_name, '')));
        -- Ensure name is not empty
        IF NEW.name = '' OR NEW.name IS NULL THEN
            NEW.name = COALESCE(NEW.first_name, NEW.last_name, 'Unknown User');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update name field when first_name or last_name changes
CREATE TRIGGER trigger_users_update_full_name
    BEFORE INSERT OR UPDATE OF first_name, last_name ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_full_name();

-- Update existing users to split name into first_name/last_name where possible
UPDATE users 
SET 
  first_name = CASE 
    WHEN position(' ' in name) > 0 THEN split_part(name, ' ', 1)
    ELSE name
  END,
  last_name = CASE 
    WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1)
    ELSE NULL
  END,
  timezone = 'UTC',
  locale = 'en-US'
WHERE first_name IS NULL AND last_name IS NULL;
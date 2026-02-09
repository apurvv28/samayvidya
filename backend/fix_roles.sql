-- Drop existing check constraint if it exists (name might vary, so we try standardized names)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_role_check') THEN
        ALTER TABLE user_profiles DROP CONSTRAINT user_profiles_role_check;
    END IF;
END $$;

-- Add updated check constraint including ADMIN and HOD
ALTER TABLE user_profiles
ADD CONSTRAINT user_profiles_role_check 
CHECK (role IN ('STUDENT', 'FACULTY', 'ADMIN', 'HOD'));

-- Update the user to ADMIN (Updates all FACULTY to ADMIN for now, or specific user if ID known)
-- Since we just seeded them as FACULTY, we can update them.
-- CAUTION: This updates ALL users with role FACULTY to ADMIN. 
-- For a dev environment with 3 users, this is likely fine or the user can manually update specific rows.
UPDATE user_profiles
SET role = 'ADMIN'
WHERE role = 'FACULTY';

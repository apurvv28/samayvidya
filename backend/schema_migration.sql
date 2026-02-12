-- Migration script for Faculty Management features

-- 1. Add columns to 'faculty' table
ALTER TABLE faculty 
ADD COLUMN IF NOT EXISTS designation TEXT,
ADD COLUMN IF NOT EXISTS target_theory_load INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS target_lab_load INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS target_tutorial_load INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS target_other_load INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT;

-- 2. Add columns to 'faculty_subjects' table
ALTER TABLE faculty_subjects
ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES divisions(division_id),
ADD COLUMN IF NOT EXISTS is_theory BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_lab BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_tutorial BOOLEAN DEFAULT FALSE;

-- 3. Ensure 'user_profiles' has required columns
-- Note: 'id' should already exist as PK
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS role TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 4. Create 'students' table
CREATE TABLE IF NOT EXISTS students (
    student_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_name TEXT NOT NULL,
    prn_number TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    division_id UUID REFERENCES divisions(division_id),
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Reload Schema Cache (Notify Supabase to refresh)
NOTIFY pgrst, 'reload config';

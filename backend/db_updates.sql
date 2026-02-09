-- Create academic_years table if it doesn't exist
CREATE TABLE IF NOT EXISTS academic_years (
    year_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update subjects table (Idempotent)
ALTER TABLE subjects 
ADD COLUMN IF NOT EXISTS theory_hours INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS lab_hours INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tutorial_hours INT DEFAULT 0;

-- Create faculty_subjects table with correct potential FK type (TEXT instead of UUID)
CREATE TABLE IF NOT EXISTS faculty_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id UUID REFERENCES faculty(faculty_id) ON DELETE CASCADE,
    subject_id TEXT REFERENCES subjects(subject_id) ON DELETE CASCADE,
    year_id UUID REFERENCES academic_years(year_id) ON DELETE SET NULL,
    UNIQUE(faculty_id, subject_id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

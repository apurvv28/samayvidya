-- Fix timetables that are COORDINATOR_VERIFIED but not frozen
-- This script will freeze all verified timetables that should be visible to faculty

-- First, check which timetables need fixing
SELECT 
    version_id,
    version_name,
    approval_status,
    is_frozen,
    is_active,
    created_at
FROM timetable_versions
WHERE approval_status IN ('COORDINATOR_VERIFIED', 'HOD_APPROVED')
  AND is_frozen = false
ORDER BY created_at DESC;

-- Fix them by setting is_frozen = true
UPDATE timetable_versions
SET is_frozen = true
WHERE approval_status IN ('COORDINATOR_VERIFIED', 'HOD_APPROVED')
  AND is_frozen = false;

-- Verify the fix
SELECT 
    version_id,
    version_name,
    approval_status,
    is_frozen,
    is_active,
    created_at
FROM timetable_versions
WHERE approval_status IN ('COORDINATOR_VERIFIED', 'HOD_APPROVED')
ORDER BY created_at DESC;

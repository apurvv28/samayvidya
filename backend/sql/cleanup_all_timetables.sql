-- ============================================
-- CLEANUP ALL TIMETABLE DATA
-- ============================================
-- This script deletes ALL timetable entries and versions
-- Use with caution - this is irreversible!
-- ============================================

-- Step 1: Delete all timetable entries (must be done first due to foreign key constraints)
DELETE FROM timetable_entries;

-- Step 2: Delete all timetable versions
DELETE FROM timetable_versions;

-- Step 3: Verify deletion
SELECT 
    'timetable_entries' as table_name, 
    COUNT(*) as remaining_rows 
FROM timetable_entries
UNION ALL
SELECT 
    'timetable_versions' as table_name, 
    COUNT(*) as remaining_rows 
FROM timetable_versions;

-- Expected result: Both tables should show 0 rows

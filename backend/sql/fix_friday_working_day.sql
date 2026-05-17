-- ============================================
-- FIX FRIDAY AS WORKING DAY AND DAY_ID SCHEMA
-- ============================================
-- This script ensures Friday is marked as a working day
-- and that the day_id schema matches the application
-- ============================================

-- Step 1: Check current status of all days
SELECT 
    day_id,
    day_name,
    is_working_day,
    CASE 
        WHEN is_working_day THEN '✓ Working'
        ELSE '✗ Non-working'
    END as status
FROM days
ORDER BY day_id;

-- Step 2: Update Friday to be a working day (if it's not already)
UPDATE days
SET is_working_day = true
WHERE LOWER(day_name) = 'friday';

-- Step 3: Ensure proper working day configuration
-- Monday to Friday should be working days
-- Saturday and Sunday should be non-working days
UPDATE days
SET is_working_day = CASE
    WHEN LOWER(day_name) IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday') THEN true
    WHEN LOWER(day_name) IN ('saturday', 'sunday') THEN false
    ELSE is_working_day
END;

-- Step 4: Verify the changes
SELECT 
    day_id,
    day_name,
    is_working_day,
    CASE 
        WHEN is_working_day THEN '✓ Working'
        ELSE '✗ Non-working'
    END as status
FROM days
ORDER BY day_id;

-- Expected result (matching application schema):
-- day_id 1: Monday (working)
-- day_id 2: Tuesday (working)
-- day_id 3: Wednesday (working)
-- day_id 4: Thursday (working)
-- day_id 5: Friday (working)
-- day_id 6: Saturday (non-working)
-- day_id 7: Sunday (non-working)

-- Note: If your database has a different day_id schema (e.g., Sunday=1, Monday=2),
-- you may need to update the timetable_entries to use the correct day_id values.
-- Check with: SELECT DISTINCT day_id, COUNT(*) FROM timetable_entries GROUP BY day_id ORDER BY day_id;


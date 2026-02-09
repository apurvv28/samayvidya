# Supabase RLS Setup Guide

Guide to setting up Row Level Security (RLS) policies for the Timetable Scheduler backend.

## Overview

Row Level Security (RLS) is the primary security mechanism for this backend:

- **Backend**: Validates JWT token
- **Database**: Applies RLS policies to filter data

The backend does NOT check permissions - Supabase does automatically.

## Enable RLS

In Supabase console, for each table:

```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
```

This denies all access by default. You must create policies to allow access.

## Common Patterns

### Pattern 1: Users see only their department data

**Schema:**
- `departments` - Department information
- `user_profiles` - User to department mapping

**Policy:**
```sql
-- Allow users to see departments they belong to
CREATE POLICY "users_view_own_dept" ON departments
  FOR SELECT
  USING (
    department_id IN (
      SELECT department_id FROM user_profiles 
      WHERE user_id = auth.uid()
    )
  );

-- Allow HOD to update their department
CREATE POLICY "hod_update_dept" ON departments
  FOR UPDATE
  USING (
    department_id IN (
      SELECT department_id FROM user_profiles 
      WHERE user_id = auth.uid() AND role = 'HOD'
    )
  );
```

### Pattern 2: Faculty see only their faculty record

**Policy:**
```sql
-- Faculty can see their own record
CREATE POLICY "faculty_view_self" ON faculty
  FOR SELECT
  USING (faculty_id IN (
    SELECT faculty_id FROM user_profiles 
    WHERE user_id = auth.uid()
  ));

-- Faculty can update their own record
CREATE POLICY "faculty_update_self" ON faculty
  FOR UPDATE
  USING (faculty_id IN (
    SELECT faculty_id FROM user_profiles 
    WHERE user_id = auth.uid()
  ));
```

### Pattern 3: Students see only their division's timetable

**Policy:**
```sql
-- Students see timetable for their division
CREATE POLICY "student_view_timetable" ON timetable_entries
  FOR SELECT
  USING (
    division_id IN (
      SELECT division_id FROM user_profiles 
      WHERE user_id = auth.uid() AND role = 'STUDENT'
    )
  );
```

### Pattern 4: HOD sees all data for their department

**Policy:**
```sql
-- HOD sees all divisions in their department
CREATE POLICY "hod_view_divisions" ON divisions
  FOR SELECT
  USING (
    department_id IN (
      SELECT department_id FROM user_profiles 
      WHERE user_id = auth.uid() AND role = 'HOD'
    )
  );

-- HOD sees all faculty in their department
CREATE POLICY "hod_view_faculty" ON faculty
  FOR SELECT
  USING (
    department_id IN (
      SELECT department_id FROM user_profiles 
      WHERE user_id = auth.uid() AND role = 'HOD'
    )
  );
```

## Setup Step-by-Step

### 1. Create user_profiles Table

This maps Supabase auth users to roles and departments:

```sql
CREATE TABLE user_profiles (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('STUDENT', 'FACULTY', 'HOD', 'ADMIN')),
  faculty_id UUID REFERENCES faculty(faculty_id),
  division_id UUID REFERENCES divisions(division_id),
  created_at TIMESTAMP DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only see their own profile
CREATE POLICY "users_view_own_profile" ON user_profiles
  FOR SELECT
  USING (user_id = auth.uid());
```

### 2. Enable RLS on All Tables

```sql
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE faculty ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE days ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE faculty_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE campus_events ENABLE ROW LEVEL SECURITY;
```

### 3. Create Policies

#### For Reference Data (everyone can read):

```sql
-- All authenticated users see days
CREATE POLICY "public_view_days" ON days
  FOR SELECT
  USING (true);

-- All authenticated users see time slots
CREATE POLICY "public_view_time_slots" ON time_slots
  FOR SELECT
  USING (true);
```

#### For Department Data:

```sql
-- Users see their department
CREATE POLICY "user_see_dept" ON departments
  FOR SELECT
  USING (
    department_id IN (
      SELECT department_id FROM user_profiles 
      WHERE user_id = auth.uid()
    )
  );

-- HOD can insert departments
CREATE POLICY "hod_insert_dept" ON departments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_id = auth.uid() AND role = 'HOD'
    )
  );
```

#### For Faculty Data:

```sql
-- Faculty see colleagues in their department
CREATE POLICY "faculty_view_dept_faculty" ON faculty
  FOR SELECT
  USING (
    department_id IN (
      SELECT department_id FROM user_profiles 
      WHERE user_id = auth.uid()
    )
  );

-- Faculty can update themselves
CREATE POLICY "faculty_update_self" ON faculty
  FOR UPDATE
  USING (
    faculty_id IN (
      SELECT faculty_id FROM user_profiles 
      WHERE user_id = auth.uid()
    )
  );
```

#### For Timetable Data:

```sql
-- Students see their division's timetable
CREATE POLICY "student_view_timetable" ON timetable_entries
  FOR SELECT
  USING (
    division_id IN (
      SELECT division_id FROM user_profiles 
      WHERE user_id = auth.uid() AND role = 'STUDENT'
    )
  );

-- Faculty see their own assignments
CREATE POLICY "faculty_view_their_timetable" ON timetable_entries
  FOR SELECT
  USING (
    faculty_id IN (
      SELECT faculty_id FROM user_profiles 
      WHERE user_id = auth.uid()
    )
  );

-- HOD can see all timetable for their department
CREATE POLICY "hod_view_all_timetable" ON timetable_entries
  FOR SELECT
  USING (
    division_id IN (
      SELECT division_id FROM divisions d
      WHERE d.department_id IN (
        SELECT department_id FROM user_profiles 
        WHERE user_id = auth.uid() AND role = 'HOD'
      )
    )
  );
```

### 4. Test Policies

In Supabase console, use SQL editor:

```sql
-- Test as authenticated user (use test JWT)
-- This query will be filtered by RLS policies
SELECT * FROM departments;

-- You should only see departments for user's department
```

## Important: Service Role Key Usage

The **Service Role Key** bypasses RLS. Use ONLY for:
- System agents (scheduling)
- Admin operations
- Data migrations

Never use in user-facing API routes.

```python
# Backend code
from app.supabase_client import get_service_supabase

# ONLY for internal operations
supabase_service = get_service_supabase()
response = supabase_service.table("timetable_entries").select("*").execute()
```

## Policy Examples by Role

### STUDENT

Can see:
- ✅ Their division
- ✅ Their division's timetable
- ✅ Their division's faculty
- ✅ Subjects for their division
- ❌ Other divisions' data
- ❌ Faculty leaves
- ❌ Timetable versions

### FACULTY

Can see:
- ✅ Their department
- ✅ Their assignments (timetable entries where faculty_id = them)
- ✅ Their subject assignments
- ✅ Their availability
- ❌ Other faculty's assignments
- ❌ Admin settings

### HOD

Can see:
- ✅ All divisions in their department
- ✅ All faculty in their department
- ✅ All timetables for their department
- ✅ Faculty leaves requests
- ✅ Can approve/modify timetables
- ❌ Other departments

### ADMIN

Can see:
- ✅ Everything (bypass RLS with service role)

## Common Issues

### "Permission denied" error

```
error: new row violates row-level security policy
```

**Solution:** User doesn't have permission. Check:
1. Is `user_profiles` row created for user?
2. Is user_id in correct `department_id`?
3. Are RLS policies applied correctly?

### All data visible to everyone

**Solution:** RLS is not enabled or policies are too permissive.

```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE tablename = 'departments';

-- Result should show: rowsecurity = true
```

### "No rows returned"

**Solution:** User doesn't match any RLS policy.

Test with correct user context:
1. Login as user
2. Get their JWT
3. Run query with that JWT
4. Check `user_profiles` for that user

## JWT Claims

Supabase Auth JWT includes:
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "aud": "authenticated",
  "exp": 1234567890
}
```

Use `auth.uid()` to get `sub` value in SQL policies.

## Debugging Policies

### Check active policies:

```sql
SELECT policyname, tablename, permissive, roles, qual 
FROM pg_policies 
WHERE tablename = 'departments';
```

### Test policy (as service role):

```sql
-- Connect as service role and test
SET auth.uid TO 'test-user-uuid';

SELECT * FROM departments;
-- This will apply RLS for that user
```

### View RLS audit logs:

Supabase logs denied access attempts. Check in:
- **Supabase Console** → Database → Logs

## Best Practices

1. ✅ **Default deny** - Create explicit allow policies, not deny
2. ✅ **Least privilege** - Users only see what they need
3. ✅ **Use auth.uid()** - Reference authenticated user
4. ✅ **Test policies** - Verify before deploying
5. ✅ **Document policies** - Comment on complex logic
6. ✅ **Audit regularly** - Check logs for denied requests
7. ❌ **Don't use service role in frontend** - Only backend system
8. ❌ **Don't hardcode user IDs** - Use auth.uid()
9. ❌ **Don't rely on frontend validation** - RLS enforces server-side

## Example: Complete RLS Setup

```sql
-- 1. Ensure auth.users table exists (Supabase creates this)

-- 2. Create user_profiles
CREATE TABLE user_profiles (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('STUDENT', 'FACULTY', 'HOD')),
  department_id UUID REFERENCES departments(department_id),
  faculty_id UUID REFERENCES faculty(faculty_id),
  division_id UUID REFERENCES divisions(division_id),
  created_at TIMESTAMP DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own" ON user_profiles
  FOR SELECT USING (user_id = auth.uid());

-- 3. Enable RLS on all tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE faculty ENABLE ROW LEVEL SECURITY;

-- 4. Create policies
CREATE POLICY "user_see_dept" ON departments
  FOR SELECT
  USING (
    department_id IN (
      SELECT department_id FROM user_profiles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "user_see_divisions" ON divisions
  FOR SELECT
  USING (
    department_id IN (
      SELECT department_id FROM user_profiles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "user_see_faculty" ON faculty
  FOR SELECT
  USING (
    department_id IN (
      SELECT department_id FROM user_profiles 
      WHERE user_id = auth.uid()
    )
  );

-- 5. Test
SELECT * FROM departments;
-- Should only return current user's departments
```

---

**For more info:** [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)

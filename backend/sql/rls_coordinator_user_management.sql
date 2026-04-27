-- Suggested Supabase RLS policies for coordinator-managed user provisioning.
-- Apply after verifying your exact schema/ownership in production.

-- 1) Enable RLS
ALTER TABLE IF EXISTS public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 2) Basic self-read profile policy
DROP POLICY IF EXISTS "user_profiles_select_own" ON public.user_profiles;
CREATE POLICY "user_profiles_select_own"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR id = auth.uid()
);

-- 3) Coordinator/Admin can read profile rows in scope
DROP POLICY IF EXISTS "user_profiles_select_coordinator_scope" ON public.user_profiles;
CREATE POLICY "user_profiles_select_coordinator_scope"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE (up.user_id = auth.uid() OR up.id = auth.uid())
      AND (
        up.role = 'ADMIN'
        OR (
          up.role = 'COORDINATOR'
          AND (up.department_id IS NULL OR up.department_id = user_profiles.department_id)
        )
      )
  )
);

-- 4) Coordinator/Admin can insert only allowed rows
DROP POLICY IF EXISTS "user_profiles_insert_coordinator_scope" ON public.user_profiles;
CREATE POLICY "user_profiles_insert_coordinator_scope"
ON public.user_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE (up.user_id = auth.uid() OR up.id = auth.uid())
      AND (
        up.role = 'ADMIN'
        OR (
          up.role = 'COORDINATOR'
          AND up.department_id = user_profiles.department_id
          AND user_profiles.role IN ('STUDENT', 'FACULTY', 'HOD')
        )
      )
  )
);

-- 5) Optional: restrict updates to coordinator/admin scope
DROP POLICY IF EXISTS "user_profiles_update_coordinator_scope" ON public.user_profiles;
CREATE POLICY "user_profiles_update_coordinator_scope"
ON public.user_profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE (up.user_id = auth.uid() OR up.id = auth.uid())
      AND (
        up.role = 'ADMIN'
        OR (up.role = 'COORDINATOR' AND up.department_id = user_profiles.department_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE (up.user_id = auth.uid() OR up.id = auth.uid())
      AND (
        up.role = 'ADMIN'
        OR (up.role = 'COORDINATOR' AND up.department_id = user_profiles.department_id)
      )
  )
);

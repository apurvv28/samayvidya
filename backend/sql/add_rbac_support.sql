-- Add Role-Based Access Control support to user_profiles table

-- Add department_id column to link user to a department
ALTER TABLE IF EXISTS public.user_profiles 
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(department_id) ON DELETE SET NULL;

-- Ensure required identity columns exist for role-based login and student personalization
ALTER TABLE IF EXISTS public.user_profiles
ADD COLUMN IF NOT EXISTS id UUID;

ALTER TABLE IF EXISTS public.user_profiles
ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE IF EXISTS public.user_profiles
ADD COLUMN IF NOT EXISTS prn TEXT;

ALTER TABLE IF EXISTS public.user_profiles
ADD COLUMN IF NOT EXISTS division TEXT;

-- Keep role values constrained to core RBAC roles
ALTER TABLE IF EXISTS public.user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE IF EXISTS public.user_profiles
ADD CONSTRAINT user_profiles_role_check
CHECK (role IN ('STUDENT', 'FACULTY', 'HOD', 'COORDINATOR'));

-- Add is_hod column to identify if user is HOD of a department
ALTER TABLE IF EXISTS public.user_profiles 
ADD COLUMN IF NOT EXISTS is_hod BOOLEAN DEFAULT FALSE;

-- Add is_coordinator column to identify if user is coordinator
ALTER TABLE IF EXISTS public.user_profiles 
ADD COLUMN IF NOT EXISTS is_coordinator BOOLEAN DEFAULT FALSE;

-- Create an index for faster role-based queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_department_id ON public.user_profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_hod ON public.user_profiles(is_hod) WHERE is_hod = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_coordinator ON public.user_profiles(is_coordinator) WHERE is_coordinator = TRUE;

-- Create a role hierarchy table for future extensibility
CREATE TABLE IF NOT EXISTS public.user_roles (
  role_id SERIAL PRIMARY KEY,
  role_name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default roles
INSERT INTO public.user_roles (role_name, description) VALUES
  ('STUDENT', 'Student user'),
  ('FACULTY', 'Faculty member'),
  ('COORDINATOR', 'Timetable Coordinator'),
  ('HOD', 'Head of Department'),
  ('ADMIN', 'System Administrator')
ON CONFLICT (role_name) DO NOTHING;

-- Create permissions table for granular access control
CREATE TABLE IF NOT EXISTS public.permissions (
  permission_id SERIAL PRIMARY KEY,
  permission_name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default permissions
INSERT INTO public.permissions (permission_name, description) VALUES
  ('view_timetable', 'View timetable'),
  ('create_timetable', 'Create new timetable'),
  ('edit_timetable', 'Edit timetable'),
  ('delete_timetable', 'Delete timetable'),
  ('manage_faculty', 'Manage faculty'),
  ('manage_rooms', 'Manage rooms'),
  ('manage_divisions', 'Manage divisions'),
  ('manage_resources', 'Manage resources'),
  ('view_analytics', 'View analytics'),
  ('approve_timetable', 'Approve timetable')
ON CONFLICT (permission_name) DO NOTHING;

-- Create role_permissions mapping table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_permission_id SERIAL PRIMARY KEY,
  role_id INTEGER NOT NULL REFERENCES public.user_roles(role_id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES public.permissions(permission_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);

-- Assign permissions to roles
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT ur.role_id, p.permission_id FROM public.user_roles ur, public.permissions p
WHERE ur.role_name = 'STUDENT' AND p.permission_name IN ('view_timetable')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT ur.role_id, p.permission_id FROM public.user_roles ur, public.permissions p
WHERE ur.role_name = 'FACULTY' AND p.permission_name IN ('view_timetable')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT ur.role_id, p.permission_id FROM public.user_roles ur, public.permissions p
WHERE ur.role_name = 'COORDINATOR' AND p.permission_name IN (
  'view_timetable', 'create_timetable', 'edit_timetable', 'delete_timetable',
  'manage_faculty', 'manage_rooms', 'manage_divisions', 'manage_resources', 'view_analytics'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT ur.role_id, p.permission_id FROM public.user_roles ur, public.permissions p
WHERE ur.role_name = 'HOD' AND p.permission_name IN (
  'view_timetable', 'view_analytics', 'approve_timetable'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT ur.role_id, p.permission_id FROM public.user_roles ur, public.permissions p
WHERE ur.role_name = 'ADMIN'
ON CONFLICT DO NOTHING;

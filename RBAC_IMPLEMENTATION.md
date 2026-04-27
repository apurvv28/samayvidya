# Role-Based Access Control (RBAC) Implementation Guide

## Overview

A comprehensive role-based access control system has been integrated into the SamayVidya timetable management platform. This system supports multiple roles (Student, Faculty, Coordinator, HOD, Admin) with department-specific access management.

## Roles and Permissions

### 1. **Student**
- **Permissions**: View timetables
- **Access Level**: Read-only access to their own schedule and department timetables
- **Dashboard**: View personal schedule and class information

### 2. **Faculty**
- **Permissions**: View timetables
- **Access Level**: View their assigned classes and timetables
- **Dashboard**: View assigned courses and schedules

### 3. **Coordinator (Time Table Coordinator)**
- **Permissions**: 
  - View, Create, Edit, Delete Timetables
  - Manage Faculty
  - Manage Rooms
  - Manage Divisions
  - Manage Resources
  - View Analytics
- **Access Level**: Full control over department timetables and resources
- **Department**: Assigned to specific department
- **Dashboard**: Comprehensive timetable management interface

### 4. **HOD (Head of Department)**
- **Permissions**:
  - View Timetables
  - Approve Timetables
  - View Department Analytics
- **Access Level**: Oversight and approval of timetables for their department
- **Department**: Linked to their department
- **Dashboard**: Overview, Timetable Viewer, Approvals, Analytics

### 5. **Admin**
- **Permissions**: Full access to all resources
- **Access Level**: System-wide administration

## Database Schema Changes

### New Tables

#### `user_roles`
Stores available roles in the system:
```sql
CREATE TABLE public.user_roles (
  role_id SERIAL PRIMARY KEY,
  role_name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `permissions`
Stores available permissions:
```sql
CREATE TABLE public.permissions (
  permission_id SERIAL PRIMARY KEY,
  permission_name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `role_permissions`
Maps roles to permissions:
```sql
CREATE TABLE public.role_permissions (
  role_permission_id SERIAL PRIMARY KEY,
  role_id INTEGER NOT NULL REFERENCES public.user_roles(role_id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES public.permissions(permission_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);
```

### Updated `user_profiles` Table

New columns added:
- `department_id UUID`: Links user to a department
- `is_hod BOOLEAN`: Indicates if user is a Head of Department
- `is_coordinator BOOLEAN`: Indicates if user is a Timetable Coordinator

Indexes added for performance:
- `idx_user_profiles_department_id`
- `idx_user_profiles_role`
- `idx_user_profiles_is_hod`
- `idx_user_profiles_is_coordinator`

## Backend Implementation

### Authentication Dependencies (auth.py)

#### `CurrentUser` Model
Enhanced with role and department information:
```python
class CurrentUser(BaseModel):
    uid: str
    email: str | None = None
    aud: str = "authenticated"
    role: str | None = None
    department_id: str | None = None
    is_hod: bool = False
    is_coordinator: bool = False
```

#### Role-Based Dependencies

**`get_current_user_with_profile()`**
- Fetches complete user profile including role and department
- Use in endpoints that need role information

**`require_role(*allowed_roles)`**
- Factory function for role checking
- Usage: `@router.get("/endpoint", dependencies=[Depends(require_role("ADMIN", "COORDINATOR"))])`

**`require_hod()`**
- Ensures user is a Head of Department
- Usage: `@router.get("/endpoint", dependencies=[Depends(require_hod())])`

**`require_coordinator()`**
- Ensures user is a Timetable Coordinator
- Usage: `@router.get("/endpoint", dependencies=[Depends(require_coordinator())])`

**`require_department(*dept_ids)`**
- Ensures user belongs to specified department(s)
- Usage: `@router.get("/endpoint", dependencies=[Depends(require_department(dept_id))])`

### Auth Routes (auth.py Router)

#### `POST /auth/signup`
Enhanced signup with role-based assignment:
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe",
  "phone": "+91-9876543210",
  "department_id": "uuid-of-department",
  "role": "Time Table Coordinator" | "Head of Dept" | "Student"
}
```

**Response**:
```json
{
  "data": {
    "user_id": "uuid",
    "role": "COORDINATOR",
    "department_id": "uuid"
  },
  "message": "User registered successfully as COORDINATOR"
}
```

#### `GET /auth/me`
Get current user's complete profile:
```json
{
  "data": {
    "user_id": "uuid",
    "email": "user@example.com",
    "role": "COORDINATOR",
    "department_id": "uuid",
    "is_hod": false,
    "is_coordinator": true
  },
  "message": "User profile retrieved successfully"
}
```

#### `GET /auth/departments`
Get available departments for signup:
```json
{
  "data": [
    {
      "department_id": "uuid",
      "department_name": "Computer Science & Engineering"
    }
  ],
  "message": "Departments retrieved successfully"
}
```

#### `GET /auth/users-by-role`
Get users filtered by role and department (coordinator/admin only):
```
GET /auth/users-by-role?role=FACULTY&department_id=uuid
```

## Frontend Implementation

### Updated Components

#### SignupForm.js
- Fetches departments from API
- Shows department selector for Coordinator/HOD roles
- Validates department assignment based on role
- Sends `department_id` to backend

#### LoginForm.js
- Routes based on email keywords (temporary)
- Future: Will use actual role from backend after authentication

#### DashboardNavbar.js
- Updated to support HOD role
- Different menu items for each role:
  - **Coordinator**: Semester, Agent, Timetables, Manage Faculty, Manage Divisions, Manage Resources
  - **HOD**: Overview, Timetables, Approvals, Analytics
  - **Student/Faculty**: Dashboard, Timetable, Profile

### New HOD Dashboard (hod/page.js)
- Overview with statistics
- Timetable viewer
- Approvals section
- Department analytics
- Quick action buttons

## Using the Role-Based Access Control

### In Backend Routes

```python
from fastapi import APIRouter, Depends
from app.dependencies.auth import (
    get_current_user_with_profile,
    require_role,
    require_hod,
    require_coordinator,
    CurrentUser
)

router = APIRouter()

# Require specific role
@router.get("/timetable-management")
async def manage_timetable(
    current_user: CurrentUser = Depends(require_role("COORDINATOR", "ADMIN"))
):
    # Only coordinators and admins can access
    pass

# Require HOD
@router.post("/approve-timetable")
async def approve_timetable(
    current_user: CurrentUser = Depends(require_hod())
):
    # Only HODs can approve
    pass

# Require department access
@router.get("/department/{dept_id}/faculty")
async def get_department_faculty(
    dept_id: str,
    current_user: CurrentUser = Depends(require_department())
):
    # Check if user belongs to dept_id
    pass
```

### Environment Setup

1. **Run Database Migration**:
   ```bash
   # Execute SQL in backend/sql/add_rbac_support.sql
   # In Supabase: Go to SQL Editor and run the migration
   ```

2. **Restart Backend**:
   ```bash
   cd backend
   python run_dev.ps1  # Windows
   # or
   ./run_dev.sh  # Linux/Mac
   ```

3. **Test Signup**:
   - Navigate to `/auth`
   - Try signing up as different roles
   - Verify departments are fetched
   - Confirm role-based routing after login

## Signup Flow by Role

### Time Table Coordinator
1. Select "Coordinator" role
2. Select department from dropdown
3. Complete signup
4. Routed to `/dashboard/coordinator`
5. Full timetable management access

### Head of Department
1. Select "HOD" role
2. Select department from dropdown
3. Complete signup
4. Routed to `/dashboard/hod`
5. Approval and analytics access for department

### Student/Faculty
1. Select role (Student or Faculty)
2. Department selection optional
3. Complete signup
4. Routed to appropriate dashboard
5. Read-only access to timetables

## Future Enhancements

1. **Granular Permissions**: Implement fine-grained permission system
2. **Supabase Auth Integration**: Full authentication flow with Supabase
3. **JWT Token Enrichment**: Include role in JWT for faster checks
4. **Approval Workflow**: Complete HOD approval workflow
5. **Audit Logging**: Track role-based access and changes
6. **Multi-Department Support**: Allow users to manage multiple departments
7. **Admin Panel**: UI for managing roles and permissions

## Security Considerations

1. **RLS Policies**: Enable Supabase RLS for row-level security
2. **Token Validation**: Always validate JWT tokens
3. **Department Isolation**: Ensure users can only access their department data
4. **Audit Trail**: Log all administrative actions
5. **Rate Limiting**: Implement rate limiting on auth endpoints

## Troubleshooting

### User Profile Not Loading
- Verify `user_profiles` table has data for user
- Check `department_id` exists in `departments` table
- Ensure JWT token is valid

### Department Dropdown Empty
- Verify `/auth/departments` endpoint returns data
- Check `departments` table has entries
- Ensure Supabase credentials are correct

### Role-Based Access Denied
- Verify user's role in `user_profiles` table
- Check role matches `require_role()` parameters
- Ensure user's department is set if using `require_department()`

### HOD Dashboard Not Showing
- Verify `is_hod=true` in user_profiles
- Check user's `department_id` is set
- Navigate directly to `/dashboard/hod`

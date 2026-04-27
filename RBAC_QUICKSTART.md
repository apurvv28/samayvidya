# Quick Start: Role-Based Access Control

## What Was Implemented

A complete role-based access control (RBAC) system with:
- ✅ 5 roles: Student, Faculty, Coordinator, HOD, Admin
- ✅ Department-specific access control
- ✅ Role-based permissions system
- ✅ HOD dashboard with approval workflow
- ✅ Enhanced signup with role assignment
- ✅ Automatic dashboard routing

## Setup Instructions

### 1. Apply Database Migration

Run the SQL migration to add RBAC tables:

```sql
-- Execute this SQL in Supabase SQL Editor
-- File: backend/sql/add_rbac_support.sql
```

This creates:
- `user_roles` table
- `permissions` table  
- `role_permissions` mapping table
- New columns in `user_profiles` table

### 2. Test the System

#### Create Coordinator Account
1. Go to `/auth` page
2. Click "Sign Up"
3. Fill form:
   - Name: "John Coordinator"
   - Email: "coord@example.com" or include "coordinator"
   - Phone: Any valid number
   - Role: **"Coordinator"**
   - Department: Select from dropdown
   - Password: Any valid password

4. You'll be routed to `/dashboard/coordinator`

#### Create HOD Account
1. Go to `/auth` page
2. Click "Sign Up"
3. Fill form:
   - Name: "Dr. HOD"
   - Email: "hod@example.com" or include "hod"
   - Phone: Any valid number
   - Role: **"HOD"**
   - Department: Select from dropdown
   - Password: Any valid password

4. You'll be routed to `/dashboard/hod`

## Key Features

### For Coordinators
- Full timetable management (create, edit, delete)
- Faculty management
- Resource management
- Division management
- Analytics dashboard

### For HODs
- View timetables for their department
- Approve pending timetables
- View department analytics
- Oversee scheduling for their department

### For Students/Faculty
- View timetables
- Read-only access to schedules

## File Changes Summary

### Backend Files Modified
- `app/dependencies/auth.py` - Added role checking utilities
- `app/routers/auth.py` - Enhanced signup with RBAC
- `backend/sql/add_rbac_support.sql` - Database migrations

### Frontend Files Modified
- `ui/app/components/Auth/SignupForm.js` - Department selector
- `ui/app/components/Auth/LoginForm.js` - Role-based routing
- `ui/app/components/Dashboard/DashboardNavbar.js` - HOD menu items
- `ui/app/dashboard/hod/page.js` - New HOD dashboard

## API Endpoints

### Authentication
```
POST /auth/signup              - Register new user with role
GET /auth/me                   - Get current user profile
GET /auth/departments          - Get available departments
GET /auth/users-by-role        - Get users by role (coordinator/admin only)
POST /auth/logout              - Logout user
```

## Role-Based Dependencies (Backend)

Use these in your route handlers:

```python
# Require specific roles
@router.post("/admin-endpoint")
async def admin_endpoint(
    current_user: CurrentUser = Depends(require_role("ADMIN"))
):
    pass

# Require HOD
@router.post("/approve-timetable")
async def approve(
    current_user: CurrentUser = Depends(require_hod())
):
    pass

# Require Coordinator
@router.get("/manage-resources")
async def manage(
    current_user: CurrentUser = Depends(require_coordinator())
):
    pass

# Require department access
@router.get("/dept/{dept_id}/data")
async def get_dept_data(
    dept_id: str,
    current_user: CurrentUser = Depends(require_department(dept_id))
):
    pass
```

## How Roles Work

1. **Signup**: User selects role and department
2. **Profile Creation**: User profile created with role flags
3. **Authentication**: Role loaded from user_profiles
4. **Authorization**: Role checked before accessing endpoints
5. **Dashboard**: User routed to role-specific dashboard

## Testing Credentials

For testing, create users with these patterns:

| Role | Email Pattern | Department |
|------|--------------|-----------|
| Coordinator | `*coordinator*` | Any |
| HOD | `*hod*` | Any |
| Student | `*student*` | Optional |
| Faculty | `*faculty*` | Optional |

## Next Steps

1. **Apply Database Migration** (see step 1 above)
2. **Test Signup** with different roles
3. **Create Role-Protected Routes** using the dependencies provided
4. **Customize HOD Dashboard** with specific approval workflows
5. **Add Audit Logging** for compliance tracking

## Troubleshooting

### Department Dropdown Empty
- Check `/auth/departments` returns data
- Verify `departments` table has entries in Supabase

### Can't Access HOD Dashboard
- Use email containing "hod" for routing
- Verify `is_hod=true` in user_profiles table
- Check `department_id` is set for HOD user

### Role Not Recognized
- Verify role mapping in signup endpoint
- Check user_profiles has correct role value
- Ensure auth dependencies are imported correctly

## Full Documentation

See `RBAC_IMPLEMENTATION.md` for detailed documentation including:
- All roles and permissions
- Database schema details
- Backend implementation guide
- Frontend component details
- Security considerations
- Future enhancements

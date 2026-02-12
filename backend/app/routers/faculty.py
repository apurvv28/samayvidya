"""Faculty management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase, get_service_supabase
from app.schemas.common import SuccessResponse, FacultyRoleEnum
from app.services.email_service import send_faculty_credentials
import secrets
import string

router = APIRouter(prefix="/faculty", tags=["faculty"])


class FacultyCreate(BaseModel):
    """Create faculty request."""

    faculty_code: str
    faculty_name: str
    role: FacultyRoleEnum
    priority_level: int
    preferred_start_time: str
    preferred_end_time: str
    min_working_days: int
    max_working_days: int
    max_load_per_week: int
    department_id: str
    is_active: bool = True
    designation: str | None = None
    email: str | None = None
    phone: str | None = None
    target_theory_load: int = 0
    target_lab_load: int = 0
    target_tutorial_load: int = 0
    target_other_load: int = 0


class FacultyUpdate(BaseModel):
    """Update faculty request."""

    faculty_code: str | None = None
    faculty_name: str | None = None
    role: FacultyRoleEnum | None = None
    priority_level: int | None = None
    preferred_start_time: str | None = None
    preferred_end_time: str | None = None
    min_working_days: int | None = None
    max_working_days: int | None = None
    max_load_per_week: int | None = None
    is_active: bool | None = None
    designation: str | None = None
    target_theory_load: int | None = None
    target_lab_load: int | None = None
    target_tutorial_load: int | None = None
    target_other_load: int | None = None


@router.get("", response_model=SuccessResponse)
async def list_faculty(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all faculty members (Service Role - Bypasses RLS)."""
    try:
        supabase = get_service_supabase()
        response = supabase.table("faculty").select("*").execute()
        return {"data": response.data, "message": "Faculty retrieved successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch faculty: {str(e)}",
        )


@router.get("/{faculty_id}", response_model=SuccessResponse)
async def get_faculty(
    faculty_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get a specific faculty member by ID."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("faculty")
            .select("*")
            .eq("faculty_id", faculty_id)
            .single()
            .execute()
        )
        return {
            "data": response.data,
            "message": "Faculty retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Faculty not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_faculty(
    faculty: FacultyCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new faculty member with Auth user and Email notification."""
    try:
        supabase = get_service_supabase() # Use service role for Auth Admin and RLS bypass
        
        # 0. Check if Faculty Code already exists
        existing_faculty = supabase.table("faculty").select("faculty_id").eq("faculty_code", faculty.faculty_code).execute()
        if existing_faculty.data:
            raise HTTPException(status_code=400, detail=f"Faculty code '{faculty.faculty_code}' already exists.")

        # 1. Validate Email
        if not faculty.email:
            raise HTTPException(status_code=400, detail="Email is required for new faculty")

        # 2. Generate Password (Firstname + Last 4 digits of phone)
        first_name = faculty.faculty_name.split()[0]
        # Clean phone number to get last 4 digits
        phone_digits = ''.join(filter(str.isdigit, faculty.phone or ""))
        phone_suffix = phone_digits[-4:] if len(phone_digits) >= 4 else "1234"
        password = f"{first_name}{phone_suffix}"

        # 3. Create Supabase Auth User
        try:
            user_attributes = {
                "email": faculty.email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": faculty.faculty_name,
                    "role": "FACULTY",
                    "designation": faculty.designation or ""
                }
            }
            auth_response = supabase.auth.admin.create_user(user_attributes)
            user_id = auth_response.user.id
        except Exception as auth_error:
            # Handle case where user might validly exist or other auth errors
            # If user exists, we might still want to proceed with creating faculty record.
            print(f"Auth creation failed (user might exist): {auth_error}")
            raise HTTPException(status_code=400, detail=f"Failed to create user account: {str(auth_error)}")

        # 4. Create/Update Link in User Profiles (if using a profiles table)
        try:
            profile_data = {
                "id": user_id,
                "email": faculty.email,
                "full_name": faculty.faculty_name,
                "role": "FACULTY",
                "is_active": True
            }
            # Attempt upsert to ensure profile exists
            supabase.table("user_profiles").upsert(profile_data).execute()
        except Exception as profile_error:
            print(f"Profile creation warning: {profile_error}")
            # Create might fail if table doesn't exist or permissions, but we proceed to Faculty table.

        # 5. Insert into Faculty Table
        faculty_data = faculty.model_dump()
        response = supabase.table("faculty").insert(faculty_data).execute()

        # 6. Send Email Credentials
        email_sent = send_faculty_credentials(
            to_email=faculty.email, 
            name=faculty.faculty_name, 
            password=password, 
            faculty_id=faculty.faculty_code
        )
        
        msg = "Faculty created successfully"
        if not email_sent:
            msg += ", but failed to send email."
        else:
            msg += " and email sent."

        return {
            "data": response.data,
            "message": msg,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create faculty: {str(e)}",
        )


@router.put("/{faculty_id}", response_model=SuccessResponse)
async def update_faculty(
    faculty_id: str,
    faculty: FacultyUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Update a faculty member."""
    try:
        supabase = get_user_supabase()
        update_data = faculty.model_dump(exclude_unset=True)
        response = (
            supabase.table("faculty")
            .update(update_data)
            .eq("faculty_id", faculty_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Faculty updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update faculty: {str(e)}",
        )


@router.delete("/{faculty_id}", response_model=SuccessResponse)
async def delete_faculty(
    faculty_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete a faculty member."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("faculty")
            .delete()
            .eq("faculty_id", faculty_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Faculty deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete faculty: {str(e)}",
        )


class FacultySubjectAssign(BaseModel):
    subject_id: str
    year_id: str | None = None
    division_id: str | None = None
    is_theory: bool = False
    is_lab: bool = False
    is_tutorial: bool = False


@router.get("/{faculty_id}/subjects", response_model=SuccessResponse)
async def get_faculty_subjects(
    faculty_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get subjects assigned to a faculty member."""
    try:
        supabase = get_user_supabase()
        # Join with subjects table
        response = (
            supabase.table("faculty_subjects")
            .select("*, subjects(*), academic_years(*)")
            .eq("faculty_id", faculty_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Faculty subjects retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch faculty subjects: {str(e)}",
        )


@router.post("/{faculty_id}/subjects", response_model=SuccessResponse)
async def assign_subject_to_faculty(
    faculty_id: str,
    assignment: FacultySubjectAssign,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Assign a subject to a faculty member."""
    try:
        supabase = get_user_supabase()
        data = {
            "faculty_id": faculty_id,
            "subject_id": assignment.subject_id,
            "year_id": assignment.year_id,
            "division_id": assignment.division_id,
            "is_theory": assignment.is_theory,
            "is_lab": assignment.is_lab,
            "is_tutorial": assignment.is_tutorial
        }
        response = (
            supabase.table("faculty_subjects")
            .insert(data)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Subject assigned to faculty successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to assign subject: {str(e)}",
        )

@router.delete("/{faculty_id}/subjects/{subject_id}", response_model=SuccessResponse)
async def unassign_subject_from_faculty(
    faculty_id: str,
    subject_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Unassign a subject from a faculty member."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("faculty_subjects")
            .delete()
            .eq("faculty_id", faculty_id)
            .eq("subject_id", subject_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Subject unassigned from faculty successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to unassign subject: {str(e)}",
        )

"""Faculty management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse, FacultyRoleEnum

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


@router.get("", response_model=SuccessResponse)
async def list_faculty(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all faculty members (RLS enforced)."""
    try:
        supabase = get_user_supabase()
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
    """Create a new faculty member."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("faculty").insert(faculty.model_dump()).execute()
        )
        return {
            "data": response.data,
            "message": "Faculty created successfully",
        }
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
            "year_id": assignment.year_id
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

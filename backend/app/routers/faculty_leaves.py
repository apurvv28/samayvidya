"""Faculty leaves management routes with RBAC."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, get_current_user_with_profile, CurrentUser, require_role
from app.supabase_client import get_user_supabase, get_service_supabase
from app.schemas.common import SuccessResponse, LeaveStatusEnum

router = APIRouter(prefix="/faculty-leaves", tags=["faculty-leaves"])


class FacultyLeaveCreate(BaseModel):
    """Create faculty leave request."""

    faculty_id: str
    start_date: str
    end_date: str
    reason: str


class FacultyLeaveUpdate(BaseModel):
    """Update faculty leave request (approve/reject by HOD)."""

    status: LeaveStatusEnum


def _get_faculty_for_user_email(current_user: CurrentUser) -> dict | None:
    """Resolve faculty row for the logged-in user using email."""
    if not current_user.email:
        return None
    supabase = get_service_supabase()
    response = (
        supabase.table("faculty")
        .select("faculty_id, email")
        .ilike("email", current_user.email)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


@router.get("", response_model=SuccessResponse)
async def list_faculty_leaves(
    current_user: CurrentUser = Depends(require_role("HOD")),
) -> dict:
    """List all faculty leaves — HOD only."""
    try:
        supabase = get_service_supabase()
        response = supabase.table("faculty_leaves").select("*, faculty:faculty_id(faculty_name, email)").order("created_at", desc=True).execute()
        return {
            "data": response.data,
            "message": "Faculty leaves retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch faculty leaves: {str(e)}",
        )


@router.get("/my", response_model=SuccessResponse)
async def list_my_leaves(
    faculty_id: str,
    current_user: CurrentUser = Depends(require_role("FACULTY")),
) -> dict:
    """List leaves for a specific faculty member — FACULTY only (own leaves)."""
    try:
        own_faculty = _get_faculty_for_user_email(current_user)
        if not own_faculty:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No faculty profile mapped to this account.",
            )
        if str(own_faculty.get("faculty_id")) != str(faculty_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own leave requests.",
            )

        supabase = get_service_supabase()
        response = (
            supabase.table("faculty_leaves")
            .select("*")
            .eq("faculty_id", faculty_id)
            .order("created_at", desc=True)
            .execute()
        )
        return {
            "data": response.data,
            "message": "My leaves retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch leaves: {str(e)}",
        )


@router.get("/{leave_id}", response_model=SuccessResponse)
async def get_faculty_leave(
    leave_id: str,
    current_user: CurrentUser = Depends(require_role("FACULTY", "HOD")),
) -> dict:
    """Get a specific faculty leave by ID."""
    try:
        supabase = get_service_supabase()
        response = (
            supabase.table("faculty_leaves")
            .select("*")
            .eq("leave_id", leave_id)
            .single()
            .execute()
        )
        return {
            "data": response.data,
            "message": "Faculty leave retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Faculty leave not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_faculty_leave(
    leave: FacultyLeaveCreate,
    current_user: CurrentUser = Depends(require_role("FACULTY")),
) -> dict:
    """Create a new faculty leave request — FACULTY only."""
    try:
        own_faculty = _get_faculty_for_user_email(current_user)
        if not own_faculty:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No faculty profile mapped to this account.",
            )
        if str(own_faculty.get("faculty_id")) != str(leave.faculty_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only submit leave requests for your own faculty profile.",
            )

        supabase = get_service_supabase()
        response = (
            supabase.table("faculty_leaves")
            .insert(leave.model_dump())
            .execute()
        )
        return {
            "data": response.data,
            "message": "Faculty leave created successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create faculty leave: {str(e)}",
        )


@router.put("/{leave_id}", response_model=SuccessResponse)
async def update_faculty_leave(
    leave_id: str,
    leave: FacultyLeaveUpdate,
    current_user: CurrentUser = Depends(require_role("HOD")),
) -> dict:
    """Approve or reject a faculty leave — HOD only."""
    try:
        supabase = get_service_supabase()
        update_data = leave.model_dump(exclude_unset=True)
        response = (
            supabase.table("faculty_leaves")
            .update(update_data)
            .eq("leave_id", leave_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": f"Faculty leave {update_data.get('status', 'updated')} successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update faculty leave: {str(e)}",
        )


@router.delete("/{leave_id}", response_model=SuccessResponse)
async def delete_faculty_leave(
    leave_id: str,
    current_user: CurrentUser = Depends(require_role("HOD")),
) -> dict:
    """Delete a faculty leave — HOD only."""
    try:
        supabase = get_service_supabase()
        response = (
            supabase.table("faculty_leaves")
            .delete()
            .eq("leave_id", leave_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Faculty leave deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete faculty leave: {str(e)}",
        )

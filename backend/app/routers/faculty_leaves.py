"""Faculty leaves management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse, LeaveStatusEnum

router = APIRouter(prefix="/faculty-leaves", tags=["faculty-leaves"])


class FacultyLeaveCreate(BaseModel):
    """Create faculty leave request."""

    faculty_id: str
    start_date: str
    end_date: str
    reason: str


class FacultyLeaveUpdate(BaseModel):
    """Update faculty leave request."""

    faculty_id: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    reason: str | None = None
    status: LeaveStatusEnum | None = None


@router.get("", response_model=SuccessResponse)
async def list_faculty_leaves(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all faculty leaves (RLS enforced)."""
    try:
        supabase = get_user_supabase()
        response = supabase.table("faculty_leaves").select("*").execute()
        return {
            "data": response.data,
            "message": "Faculty leaves retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch faculty leaves: {str(e)}",
        )


@router.get("/{leave_id}", response_model=SuccessResponse)
async def get_faculty_leave(
    leave_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get a specific faculty leave by ID."""
    try:
        supabase = get_user_supabase()
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
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new faculty leave request."""
    try:
        supabase = get_user_supabase()
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
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Update a faculty leave."""
    try:
        supabase = get_user_supabase()
        update_data = leave.model_dump(exclude_unset=True)
        response = (
            supabase.table("faculty_leaves")
            .update(update_data)
            .eq("leave_id", leave_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Faculty leave updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update faculty leave: {str(e)}",
        )


@router.delete("/{leave_id}", response_model=SuccessResponse)
async def delete_faculty_leave(
    leave_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete a faculty leave."""
    try:
        supabase = get_user_supabase()
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

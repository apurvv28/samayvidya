"""Divisions management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/divisions", tags=["divisions"])


class DivisionCreate(BaseModel):
    """Create division request."""

    division_name: str
    year: str
    department_id: str
    student_count: int
    min_working_days: int
    max_working_days: int
    earliest_start_time: str
    latest_end_time: str


class DivisionUpdate(BaseModel):
    """Update division request."""

    division_name: str | None = None
    year: str | None = None
    student_count: int | None = None
    min_working_days: int | None = None
    max_working_days: int | None = None
    earliest_start_time: str | None = None
    latest_end_time: str | None = None


@router.get("", response_model=SuccessResponse)
async def list_divisions(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all divisions (RLS enforced)."""
    try:
        supabase = get_user_supabase()
        response = supabase.table("divisions").select("*").execute()
        return {"data": response.data, "message": "Divisions retrieved successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch divisions: {str(e)}",
        )


@router.get("/{division_id}", response_model=SuccessResponse)
async def get_division(
    division_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get a specific division by ID."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("divisions")
            .select("*")
            .eq("division_id", division_id)
            .single()
            .execute()
        )
        return {
            "data": response.data,
            "message": "Division retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Division not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_division(
    division: DivisionCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new division."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("divisions").insert(division.model_dump()).execute()
        )
        return {
            "data": response.data,
            "message": "Division created successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create division: {str(e)}",
        )


@router.put("/{division_id}", response_model=SuccessResponse)
async def update_division(
    division_id: str,
    division: DivisionUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Update a division."""
    try:
        supabase = get_user_supabase()
        update_data = division.model_dump(exclude_unset=True)
        response = (
            supabase.table("divisions")
            .update(update_data)
            .eq("division_id", division_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Division updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update division: {str(e)}",
        )


@router.delete("/{division_id}", response_model=SuccessResponse)
async def delete_division(
    division_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete a division."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("divisions")
            .delete()
            .eq("division_id", division_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Division deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete division: {str(e)}",
        )

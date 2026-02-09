"""Days management routes (reference data)."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/days", tags=["days"])


class DayCreate(BaseModel):
    """Create day request."""

    day_name: str
    is_working_day: bool


class DayUpdate(BaseModel):
    """Update day request."""

    day_name: str | None = None
    is_working_day: bool | None = None


@router.get("", response_model=SuccessResponse)
async def list_days(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all days (RLS enforced)."""
    try:
        supabase = get_user_supabase()
        response = supabase.table("days").select("*").execute()
        return {"data": response.data, "message": "Days retrieved successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch days: {str(e)}",
        )


@router.get("/{day_id}", response_model=SuccessResponse)
async def get_day(
    day_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get a specific day by ID."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("days")
            .select("*")
            .eq("day_id", day_id)
            .single()
            .execute()
        )
        return {"data": response.data, "message": "Day retrieved successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Day not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_day(
    day: DayCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new day."""
    try:
        supabase = get_user_supabase()
        response = supabase.table("days").insert(day.model_dump()).execute()
        return {"data": response.data, "message": "Day created successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create day: {str(e)}",
        )


@router.put("/{day_id}", response_model=SuccessResponse)
async def update_day(
    day_id: int,
    day: DayUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Update a day."""
    try:
        supabase = get_user_supabase()
        update_data = day.model_dump(exclude_unset=True)
        response = (
            supabase.table("days")
            .update(update_data)
            .eq("day_id", day_id)
            .execute()
        )
        return {"data": response.data, "message": "Day updated successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update day: {str(e)}",
        )


@router.delete("/{day_id}", response_model=SuccessResponse)
async def delete_day(
    day_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete a day."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("days").delete().eq("day_id", day_id).execute()
        )
        return {"data": response.data, "message": "Day deleted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete day: {str(e)}",
        )

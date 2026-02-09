"""Time slots management routes (reference data)."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/time-slots", tags=["time-slots"])


class TimeSlotCreate(BaseModel):
    """Create time slot request."""

    start_time: str
    end_time: str
    slot_order: int
    is_break: bool = False


class TimeSlotUpdate(BaseModel):
    """Update time slot request."""

    start_time: str | None = None
    end_time: str | None = None
    slot_order: int | None = None
    is_break: bool | None = None


@router.get("", response_model=SuccessResponse)
async def list_time_slots(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all time slots (RLS enforced)."""
    try:
        supabase = get_user_supabase()
        response = supabase.table("time_slots").select("*").execute()
        return {"data": response.data, "message": "Time slots retrieved successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch time slots: {str(e)}",
        )


@router.get("/{slot_id}", response_model=SuccessResponse)
async def get_time_slot(
    slot_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get a specific time slot by ID."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("time_slots")
            .select("*")
            .eq("slot_id", slot_id)
            .single()
            .execute()
        )
        return {
            "data": response.data,
            "message": "Time slot retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Time slot not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_time_slot(
    slot: TimeSlotCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new time slot."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("time_slots").insert(slot.model_dump()).execute()
        )
        return {
            "data": response.data,
            "message": "Time slot created successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create time slot: {str(e)}",
        )


@router.put("/{slot_id}", response_model=SuccessResponse)
async def update_time_slot(
    slot_id: str,
    slot: TimeSlotUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Update a time slot."""
    try:
        supabase = get_user_supabase()
        update_data = slot.model_dump(exclude_unset=True)
        response = (
            supabase.table("time_slots")
            .update(update_data)
            .eq("slot_id", slot_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Time slot updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update time slot: {str(e)}",
        )


@router.delete("/{slot_id}", response_model=SuccessResponse)
async def delete_time_slot(
    slot_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete a time slot."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("time_slots")
            .delete()
            .eq("slot_id", slot_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Time slot deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete time slot: {str(e)}",
        )

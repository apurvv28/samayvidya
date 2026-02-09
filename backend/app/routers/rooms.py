"""Rooms management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse, RoomTypeEnum

router = APIRouter(prefix="/rooms", tags=["rooms"])


class RoomCreate(BaseModel):
    """Create room request."""

    room_number: str
    room_type: RoomTypeEnum
    capacity: int
    department_id: str
    is_active: bool = True


class RoomUpdate(BaseModel):
    """Update room request."""

    room_number: str | None = None
    room_type: RoomTypeEnum | None = None
    capacity: int | None = None
    is_active: bool | None = None


@router.get("", response_model=SuccessResponse)
async def list_rooms(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all rooms (RLS enforced)."""
    try:
        supabase = get_user_supabase()
        response = supabase.table("rooms").select("*").execute()
        return {"data": response.data, "message": "Rooms retrieved successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch rooms: {str(e)}",
        )


@router.get("/{room_id}", response_model=SuccessResponse)
async def get_room(
    room_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get a specific room by ID."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("rooms")
            .select("*")
            .eq("room_id", room_id)
            .single()
            .execute()
        )
        return {
            "data": response.data,
            "message": "Room retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_room(
    room: RoomCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new room."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("rooms").insert(room.model_dump()).execute()
        )
        return {
            "data": response.data,
            "message": "Room created successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create room: {str(e)}",
        )


@router.put("/{room_id}", response_model=SuccessResponse)
async def update_room(
    room_id: str,
    room: RoomUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Update a room."""
    try:
        supabase = get_user_supabase()
        update_data = room.model_dump(exclude_unset=True)
        response = (
            supabase.table("rooms")
            .update(update_data)
            .eq("room_id", room_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Room updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update room: {str(e)}",
        )


@router.delete("/{room_id}", response_model=SuccessResponse)
async def delete_room(
    room_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete a room."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("rooms")
            .delete()
            .eq("room_id", room_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Room deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete room: {str(e)}",
        )

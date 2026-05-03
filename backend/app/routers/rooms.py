"""Rooms management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import (
    get_current_user_with_profile,
    CurrentUser,
    resolve_effective_department_id,
)
from app.supabase_client import get_user_supabase, get_service_supabase
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
    department_id: str | None = None,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """List all rooms filtered by department."""
    try:
        supabase = get_service_supabase()

        target_dept_id = resolve_effective_department_id(current_user, department_id)

        print(f"[ROOMS] User: {current_user.email}, Role: {current_user.role}, Department: {target_dept_id}")

        if current_user.role != "ADMIN":
            if not target_dept_id:
                print(f"[ROOMS] No department assigned for user {current_user.email}")
                return {
                    "data": [],
                    "message": "No rooms found. Please contact admin to assign you to a department.",
                }

        query = supabase.table("rooms").select("*")

        if current_user.role != "ADMIN":
            query = query.eq("department_id", target_dept_id)
            print(f"[ROOMS] Filtering by department_id: {target_dept_id}")
        elif target_dept_id:
            query = query.eq("department_id", target_dept_id)
        
        response = query.execute()
        print(f"[ROOMS] Found {len(response.data or [])} rooms")
        
        # Return helpful message if no data
        if not response.data:
            return {
                "data": [],
                "message": "No rooms found. Click 'Add Room' to create your first room."
            }
        
        return {"data": response.data, "message": "Rooms retrieved successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ROOMS ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch rooms: {str(e)}",
        )


@router.get("/{room_id}", response_model=SuccessResponse)
async def get_room(
    room_id: str,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
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
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Create a new room with department validation."""
    try:
        # Validate user can create rooms for this department
        if current_user.role != "ADMIN" and room.department_id != current_user.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only create rooms for your own department",
            )
        
        supabase = get_service_supabase()
        response = (
            supabase.table("rooms").insert(room.model_dump()).execute()
        )
        return {
            "data": response.data,
            "message": "Room created successfully",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create room: {str(e)}",
        )


@router.put("/{room_id}", response_model=SuccessResponse)
async def update_room(
    room_id: str,
    room: RoomUpdate,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Update a room (Service Role - Bypasses RLS)."""
    try:
        supabase = get_service_supabase()
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
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Delete a room (Service Role - Bypasses RLS)."""
    try:
        supabase = get_service_supabase()
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

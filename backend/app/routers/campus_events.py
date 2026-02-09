"""Campus events management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse, EventTypeEnum

router = APIRouter(prefix="/campus-events", tags=["campus-events"])


class CampusEventCreate(BaseModel):
    """Create campus event request."""

    event_name: str
    start_date: str
    end_date: str
    event_type: EventTypeEnum
    affected_rooms: list[str] | None = None
    affected_divisions: list[str] | None = None


class CampusEventUpdate(BaseModel):
    """Update campus event request."""

    event_name: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    event_type: EventTypeEnum | None = None
    affected_rooms: list[str] | None = None
    affected_divisions: list[str] | None = None


@router.get("", response_model=SuccessResponse)
async def list_campus_events(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all campus events (RLS enforced)."""
    try:
        supabase = get_user_supabase()
        response = supabase.table("campus_events").select("*").execute()
        return {
            "data": response.data,
            "message": "Campus events retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch campus events: {str(e)}",
        )


@router.get("/{event_id}", response_model=SuccessResponse)
async def get_campus_event(
    event_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get a specific campus event by ID."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("campus_events")
            .select("*")
            .eq("event_id", event_id)
            .single()
            .execute()
        )
        return {
            "data": response.data,
            "message": "Campus event retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campus event not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_campus_event(
    event: CampusEventCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new campus event."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("campus_events")
            .insert(event.model_dump())
            .execute()
        )
        return {
            "data": response.data,
            "message": "Campus event created successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create campus event: {str(e)}",
        )


@router.put("/{event_id}", response_model=SuccessResponse)
async def update_campus_event(
    event_id: str,
    event: CampusEventUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Update a campus event."""
    try:
        supabase = get_user_supabase()
        update_data = event.model_dump(exclude_unset=True)
        response = (
            supabase.table("campus_events")
            .update(update_data)
            .eq("event_id", event_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Campus event updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update campus event: {str(e)}",
        )


@router.delete("/{event_id}", response_model=SuccessResponse)
async def delete_campus_event(
    event_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete a campus event."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("campus_events")
            .delete()
            .eq("event_id", event_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Campus event deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete campus event: {str(e)}",
        )

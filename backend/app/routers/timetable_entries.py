"""Timetable entries management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse, SubjectTypeEnum

router = APIRouter(prefix="/timetable-entries", tags=["timetable-entries"])


class TimetableEntryCreate(BaseModel):
    """Create timetable entry request."""

    version_id: str
    division_id: str
    subject_id: str
    faculty_id: str
    room_id: str
    day_id: int
    slot_id: str
    batch_id: str | None = None
    session_type: SubjectTypeEnum = SubjectTypeEnum.THEORY


class TimetableEntryUpdate(BaseModel):
    """Update timetable entry request."""

    version_id: str | None = None
    division_id: str | None = None
    subject_id: str | None = None
    faculty_id: str | None = None
    room_id: str | None = None
    day_id: int | None = None
    slot_id: str | None = None
    batch_id: str | None = None
    session_type: SubjectTypeEnum | None = None


@router.get("", response_model=SuccessResponse)
async def list_timetable_entries(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all timetable entries (RLS enforced)."""
    try:
        supabase = get_user_supabase()
        response = supabase.table("timetable_entries").select("*").execute()
        return {
            "data": response.data,
            "message": "Timetable entries retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch timetable entries: {str(e)}",
        )


@router.get("/{entry_id}", response_model=SuccessResponse)
async def get_timetable_entry(
    entry_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get a specific timetable entry by ID."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("timetable_entries")
            .select("*")
            .eq("entry_id", entry_id)
            .single()
            .execute()
        )
        return {
            "data": response.data,
            "message": "Timetable entry retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Timetable entry not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_timetable_entry(
    entry: TimetableEntryCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new timetable entry."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("timetable_entries")
            .insert(entry.model_dump())
            .execute()
        )
        return {
            "data": response.data,
            "message": "Timetable entry created successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create timetable entry: {str(e)}",
        )


@router.put("/{entry_id}", response_model=SuccessResponse)
async def update_timetable_entry(
    entry_id: str,
    entry: TimetableEntryUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Update a timetable entry."""
    try:
        supabase = get_user_supabase()
        update_data = entry.model_dump(exclude_unset=True)
        response = (
            supabase.table("timetable_entries")
            .update(update_data)
            .eq("entry_id", entry_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Timetable entry updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update timetable entry: {str(e)}",
        )


@router.delete("/{entry_id}", response_model=SuccessResponse)
async def delete_timetable_entry(
    entry_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete a timetable entry."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("timetable_entries")
            .delete()
            .eq("entry_id", entry_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Timetable entry deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete timetable entry: {str(e)}",
        )

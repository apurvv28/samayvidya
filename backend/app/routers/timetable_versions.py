"""Timetable versions management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/timetable-versions", tags=["timetable-versions"])


class TimetableVersionCreate(BaseModel):
    """Create timetable version request."""

    created_by: str
    reason: str | None = None
    is_active: bool = True


class TimetableVersionUpdate(BaseModel):
    """Update timetable version request."""

    created_by: str | None = None
    reason: str | None = None
    is_active: bool | None = None


@router.get("", response_model=SuccessResponse)
async def list_timetable_versions(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all timetable versions (RLS enforced)."""
    try:
        supabase = get_user_supabase()
        response = supabase.table("timetable_versions").select("*").execute()
        return {
            "data": response.data,
            "message": "Timetable versions retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch timetable versions: {str(e)}",
        )


@router.get("/{version_id}", response_model=SuccessResponse)
async def get_timetable_version(
    version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get a specific timetable version by ID."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("timetable_versions")
            .select("*")
            .eq("version_id", version_id)
            .single()
            .execute()
        )
        return {
            "data": response.data,
            "message": "Timetable version retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Timetable version not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_timetable_version(
    version: TimetableVersionCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new timetable version."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("timetable_versions")
            .insert(version.model_dump())
            .execute()
        )
        return {
            "data": response.data,
            "message": "Timetable version created successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create timetable version: {str(e)}",
        )


@router.put("/{version_id}", response_model=SuccessResponse)
async def update_timetable_version(
    version_id: str,
    version: TimetableVersionUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Update a timetable version."""
    try:
        supabase = get_user_supabase()
        update_data = version.model_dump(exclude_unset=True)
        response = (
            supabase.table("timetable_versions")
            .update(update_data)
            .eq("version_id", version_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Timetable version updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update timetable version: {str(e)}",
        )


@router.delete("/{version_id}", response_model=SuccessResponse)
async def delete_timetable_version(
    version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete a timetable version."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("timetable_versions")
            .delete()
            .eq("version_id", version_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Timetable version deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete timetable version: {str(e)}",
        )

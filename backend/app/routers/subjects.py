"""Subjects management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse, SubjectTypeEnum

router = APIRouter(prefix="/subjects", tags=["subjects"])


class SubjectCreate(BaseModel):
    """Create subject request."""

    subject_id: str
    subject_name: str
    subject_type: SubjectTypeEnum
    credits: int
    theory_hours: int = 0
    lab_hours: int = 0
    tutorial_hours: int = 0
    requires_continuity: bool
    department_id: str


class SubjectUpdate(BaseModel):
    """Update subject request."""

    subject_name: str | None = None
    subject_type: SubjectTypeEnum | None = None
    credits: int | None = None
    theory_hours: int | None = None
    lab_hours: int | None = None
    tutorial_hours: int | None = None
    requires_continuity: bool | None = None


@router.get("", response_model=SuccessResponse)
async def list_subjects(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all subjects (RLS enforced)."""
    try:
        supabase = get_user_supabase()
        response = supabase.table("subjects").select("*").execute()
        return {"data": response.data, "message": "Subjects retrieved successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch subjects: {str(e)}",
        )


@router.get("/{subject_id}", response_model=SuccessResponse)
async def get_subject(
    subject_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get a specific subject by ID."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("subjects")
            .select("*")
            .eq("subject_id", subject_id)
            .single()
            .execute()
        )
        return {
            "data": response.data,
            "message": "Subject retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Subject not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_subject(
    subject: SubjectCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new subject."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("subjects").insert(subject.model_dump()).execute()
        )
        return {
            "data": response.data,
            "message": "Subject created successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create subject: {str(e)}",
        )


@router.put("/{subject_id}", response_model=SuccessResponse)
async def update_subject(
    subject_id: str,
    subject: SubjectUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Update a subject."""
    try:
        supabase = get_user_supabase()
        update_data = subject.model_dump(exclude_unset=True)
        response = (
            supabase.table("subjects")
            .update(update_data)
            .eq("subject_id", subject_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Subject updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update subject: {str(e)}",
        )


@router.delete("/{subject_id}", response_model=SuccessResponse)
async def delete_subject(
    subject_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete a subject."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("subjects")
            .delete()
            .eq("subject_id", subject_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Subject deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete subject: {str(e)}",
        )

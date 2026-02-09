"""Academic Years management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from typing import Optional
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/academic-years", tags=["academic-years"])


class AcademicYearCreate(BaseModel):
    """Create academic year request."""
    name: str
    code: str
    description: Optional[str] = None


class AcademicYearUpdate(BaseModel):
    """Update academic year request."""
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None


@router.get("", response_model=SuccessResponse)
async def list_academic_years(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all academic years."""
    try:
        supabase = get_user_supabase()
        response = supabase.table("academic_years").select("*").order("created_at").execute()
        return {"data": response.data, "message": "Academic years retrieved successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch academic years: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_academic_year(
    year: AcademicYearCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new academic year."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("academic_years").insert(year.model_dump()).execute()
        )
        return {
            "data": response.data,
            "message": "Academic year created successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create academic year: {str(e)}",
        )


@router.delete("/{year_id}", response_model=SuccessResponse)
async def delete_academic_year(
    year_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete an academic year."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("academic_years")
            .delete()
            .eq("year_id", year_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Academic year deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete academic year: {str(e)}",
        )

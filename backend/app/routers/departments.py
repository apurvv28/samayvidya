"""Departments management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/departments", tags=["departments"])


class DepartmentCreate(BaseModel):
    """Create department request."""

    department_name: str
    academic_year: str
    semester: int
    start_date: str
    end_date: str


class DepartmentUpdate(BaseModel):
    """Update department request."""

    department_name: str | None = None
    academic_year: str | None = None
    semester: int | None = None
    start_date: str | None = None
    end_date: str | None = None


@router.get("", response_model=SuccessResponse)
async def list_departments(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all departments (RLS enforced)."""
    try:
        supabase = get_user_supabase()
        response = supabase.table("departments").select("*").execute()
        return {"data": response.data, "message": "Departments retrieved successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch departments: {str(e)}",
        )


@router.get("/{department_id}", response_model=SuccessResponse)
async def get_department(
    department_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get a specific department by ID."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("departments")
            .select("*")
            .eq("department_id", department_id)
            .single()
            .execute()
        )
        return {
            "data": response.data,
            "message": "Department retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Department not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_department(
    department: DepartmentCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new department."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("departments")
            .insert(department.model_dump())
            .execute()
        )
        return {
            "data": response.data,
            "message": "Department created successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create department: {str(e)}",
        )


@router.put("/{department_id}", response_model=SuccessResponse)
async def update_department(
    department_id: str,
    department: DepartmentUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Update a department."""
    try:
        supabase = get_user_supabase()
        update_data = department.model_dump(exclude_unset=True)
        response = (
            supabase.table("departments")
            .update(update_data)
            .eq("department_id", department_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Department updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update department: {str(e)}",
        )


@router.delete("/{department_id}", response_model=SuccessResponse)
async def delete_department(
    department_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete a department."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("departments")
            .delete()
            .eq("department_id", department_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Department deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete department: {str(e)}",
        )

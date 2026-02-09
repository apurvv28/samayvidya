"""Batches management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/batches", tags=["batches"])


class BatchCreate(BaseModel):
    """Create batch request."""

    division_id: str
    batch_code: str
    is_active: bool = True


class BatchUpdate(BaseModel):
    """Update batch request."""

    batch_code: str | None = None
    is_active: bool | None = None


@router.get("", response_model=SuccessResponse)
async def list_batches(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all batches (RLS enforced)."""
    try:
        supabase = get_user_supabase()
        response = supabase.table("batches").select("*").execute()
        return {"data": response.data, "message": "Batches retrieved successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch batches: {str(e)}",
        )


@router.get("/{batch_id}", response_model=SuccessResponse)
async def get_batch(
    batch_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get a specific batch by ID."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("batches")
            .select("*")
            .eq("batch_id", batch_id)
            .single()
            .execute()
        )
        return {
            "data": response.data,
            "message": "Batch retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Batch not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_batch(
    batch: BatchCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new batch."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("batches").insert(batch.model_dump()).execute()
        )
        return {
            "data": response.data,
            "message": "Batch created successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create batch: {str(e)}",
        )


@router.put("/{batch_id}", response_model=SuccessResponse)
async def update_batch(
    batch_id: str,
    batch: BatchUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Update a batch."""
    try:
        supabase = get_user_supabase()
        update_data = batch.model_dump(exclude_unset=True)
        response = (
            supabase.table("batches")
            .update(update_data)
            .eq("batch_id", batch_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Batch updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update batch: {str(e)}",
        )


@router.delete("/{batch_id}", response_model=SuccessResponse)
async def delete_batch(
    batch_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete a batch."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("batches")
            .delete()
            .eq("batch_id", batch_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Batch deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete batch: {str(e)}",
        )

"""Time slots management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_service_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/time-slots", tags=["time-slots"])


class TimeSlotResponse(BaseModel):
    """Time slot response model."""
    slot_id: str
    start_time: str
    end_time: str
    slot_order: int
    is_break: bool
    slot_name: str | None = None


@router.get("", response_model=SuccessResponse)
async def list_time_slots(
    include_breaks: bool = True,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """
    List all time slots.
    
    Query Parameters:
    - include_breaks: Whether to include break slots (default: True)
    """
    try:
        supabase = get_service_supabase()
        
        query = supabase.table("time_slots").select("*").order("slot_order")
        
        if not include_breaks:
            query = query.eq("is_break", False)
        
        response = query.execute()
        
        return {
            "data": response.data or [],
            "message": "Time slots retrieved successfully"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch time slots: {str(e)}",
        )


@router.get("/class-slots", response_model=SuccessResponse)
async def list_class_slots(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """
    List only class time slots (excluding breaks).
    """
    try:
        supabase = get_service_supabase()
        
        response = (
            supabase.table("time_slots")
            .select("*")
            .eq("is_break", False)
            .order("slot_order")
            .execute()
        )
        
        return {
            "data": response.data or [],
            "message": "Class time slots retrieved successfully"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch class time slots: {str(e)}",
        )


@router.get("/break-slots", response_model=SuccessResponse)
async def list_break_slots(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """
    List only break time slots (lunch breaks).
    """
    try:
        supabase = get_service_supabase()
        
        response = (
            supabase.table("time_slots")
            .select("*")
            .eq("is_break", True)
            .order("slot_order")
            .execute()
        )
        
        return {
            "data": response.data or [],
            "message": "Break time slots retrieved successfully"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch break time slots: {str(e)}",
        )


@router.get("/available-for-faculty/{faculty_id}", response_model=SuccessResponse)
async def get_available_slots_for_faculty(
    faculty_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """
    Get time slots available for a specific faculty based on their preferred times.
    """
    try:
        supabase = get_service_supabase()
        
        # Get faculty preferred times
        faculty_response = (
            supabase.table("faculty")
            .select("preferred_start_time, preferred_end_time")
            .eq("faculty_id", faculty_id)
            .single()
            .execute()
        )
        
        if not faculty_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Faculty not found"
            )
        
        faculty = faculty_response.data
        start_time = faculty.get("preferred_start_time", "08:00")
        end_time = faculty.get("preferred_end_time", "18:00")
        
        # Get slots within faculty's preferred time range
        response = (
            supabase.table("time_slots")
            .select("*")
            .gte("start_time", start_time)
            .lte("end_time", end_time)
            .eq("is_break", False)
            .order("slot_order")
            .execute()
        )
        
        return {
            "data": {
                "faculty_id": faculty_id,
                "preferred_start_time": start_time,
                "preferred_end_time": end_time,
                "available_slots": response.data or []
            },
            "message": f"Available slots for faculty retrieved successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch available slots: {str(e)}",
        )


@router.get("/{slot_id}", response_model=SuccessResponse)
async def get_time_slot(
    slot_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get a specific time slot by ID."""
    try:
        supabase = get_service_supabase()
        
        response = (
            supabase.table("time_slots")
            .select("*")
            .eq("slot_id", slot_id)
            .single()
            .execute()
        )
        
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Time slot not found"
            )
        
        return {
            "data": response.data,
            "message": "Time slot retrieved successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch time slot: {str(e)}",
        )

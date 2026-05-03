"""Debug endpoints to diagnose department isolation issues."""
from fastapi import APIRouter, Depends
from app.dependencies.auth import get_current_user_with_profile, CurrentUser
from app.supabase_client import get_service_supabase

router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/me")
async def debug_current_user(
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Debug endpoint to see current user's profile information."""
    return {
        "uid": current_user.uid,
        "email": current_user.email,
        "role": current_user.role,
        "department_id": current_user.department_id,
        "is_hod": current_user.is_hod,
        "is_coordinator": current_user.is_coordinator,
    }


@router.get("/subjects")
async def debug_subjects(
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Debug endpoint to see subjects query."""
    supabase = get_service_supabase()
    
    # Get all subjects
    all_subjects = supabase.table("subjects").select("subject_id, subject_name, year, department_id").execute()
    
    # Get subjects for user's department
    user_subjects = []
    if current_user.department_id:
        user_subjects = (
            supabase.table("subjects")
            .select("subject_id, subject_name, year, department_id")
            .eq("department_id", current_user.department_id)
            .execute()
            .data or []
        )
    
    # Get SY subjects for user's department
    sy_subjects = []
    if current_user.department_id:
        sy_subjects = (
            supabase.table("subjects")
            .select("subject_id, subject_name, year, department_id")
            .eq("department_id", current_user.department_id)
            .eq("year", "SY")
            .execute()
            .data or []
        )
    
    return {
        "current_user": {
            "email": current_user.email,
            "role": current_user.role,
            "department_id": current_user.department_id,
        },
        "total_subjects_in_db": len(all_subjects.data or []),
        "subjects_for_user_department": len(user_subjects),
        "sy_subjects_for_user_department": len(sy_subjects),
        "all_subjects_sample": (all_subjects.data or [])[:3],
        "user_subjects_sample": user_subjects[:3],
        "sy_subjects": sy_subjects,
    }


@router.get("/rooms")
async def debug_rooms(
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Debug endpoint to see rooms query."""
    supabase = get_service_supabase()
    
    # Get all rooms
    all_rooms = supabase.table("rooms").select("room_id, room_number, department_id").execute()
    
    # Get rooms for user's department
    user_rooms = []
    if current_user.department_id:
        user_rooms = (
            supabase.table("rooms")
            .select("room_id, room_number, department_id")
            .eq("department_id", current_user.department_id)
            .execute()
            .data or []
        )
    
    return {
        "current_user": {
            "email": current_user.email,
            "role": current_user.role,
            "department_id": current_user.department_id,
        },
        "total_rooms_in_db": len(all_rooms.data or []),
        "rooms_for_user_department": len(user_rooms),
        "all_rooms_sample": (all_rooms.data or [])[:3],
        "user_rooms_sample": user_rooms[:3],
    }

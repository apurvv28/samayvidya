"""Faculty timetable viewing routes with access control."""
from fastapi import APIRouter, HTTPException, status, Depends
from app.dependencies.auth import get_current_user, CurrentUser, require_role
from app.supabase_client import get_service_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/faculty-timetable", tags=["faculty-timetable"])


def _get_faculty_for_user_email(current_user: CurrentUser) -> dict | None:
    """Resolve faculty row for the logged-in user using email."""
    if not current_user.email:
        return None
    supabase = get_service_supabase()
    response = (
        supabase.table("faculty")
        .select("faculty_id, email, faculty_name, department_id")
        .ilike("email", current_user.email)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


@router.get("/my-timetable", response_model=SuccessResponse)
async def get_my_timetable(
    version_id: str | None = None,
    current_user: CurrentUser = Depends(require_role("FACULTY")),
) -> dict:
    """
    Get timetable for the logged-in faculty member.
    Faculty can only see their own timetable entries.
    """
    try:
        # Get faculty profile
        faculty = _get_faculty_for_user_email(current_user)
        if not faculty:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No faculty profile mapped to this account.",
            )
        
        faculty_id = faculty.get("faculty_id")
        supabase = get_service_supabase()
        
        # Get latest version if not specified
        if not version_id:
            version_response = (
                supabase.table("timetable_versions")
                .select("version_id")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if version_response.data:
                version_id = version_response.data[0]["version_id"]
            else:
                return {
                    "data": {
                        "faculty": faculty,
                        "entries": [],
                        "version_id": None,
                    },
                    "message": "No timetable version found",
                }
        
        # Get timetable entries for this faculty
        entries_response = (
            supabase.table("timetable_entries")
            .select("""
                *,
                divisions(division_id, division_name, year),
                subjects(subject_id, subject_name, subject_code),
                rooms(room_id, room_name, room_type),
                batches(batch_id, batch_name),
                days(day_id, day_name, day_order),
                time_slots(slot_id, start_time, end_time, slot_order)
            """)
            .eq("version_id", version_id)
            .eq("faculty_id", faculty_id)
            .order("day_id")
            .order("slot_id")
            .execute()
        )
        
        return {
            "data": {
                "faculty": faculty,
                "entries": entries_response.data or [],
                "version_id": version_id,
                "total_entries": len(entries_response.data or []),
            },
            "message": "Faculty timetable retrieved successfully",
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch faculty timetable: {str(e)}",
        )


@router.get("/division-timetable/{division_id}", response_model=SuccessResponse)
async def get_division_timetable(
    division_id: str,
    version_id: str | None = None,
    current_user: CurrentUser = Depends(require_role("FACULTY")),
) -> dict:
    """
    Get timetable for a specific division.
    Faculty can only view timetables of divisions they teach.
    """
    try:
        # Get faculty profile
        faculty = _get_faculty_for_user_email(current_user)
        if not faculty:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No faculty profile mapped to this account.",
            )
        
        faculty_id = faculty.get("faculty_id")
        supabase = get_service_supabase()
        
        # Get latest version if not specified
        if not version_id:
            version_response = (
                supabase.table("timetable_versions")
                .select("version_id")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if version_response.data:
                version_id = version_response.data[0]["version_id"]
            else:
                return {
                    "data": {
                        "division_id": division_id,
                        "entries": [],
                        "version_id": None,
                    },
                    "message": "No timetable version found",
                }
        
        # Check if faculty teaches this division
        faculty_teaches_division = (
            supabase.table("timetable_entries")
            .select("entry_id")
            .eq("version_id", version_id)
            .eq("faculty_id", faculty_id)
            .eq("division_id", division_id)
            .limit(1)
            .execute()
        )
        
        if not faculty_teaches_division.data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view timetables of divisions you teach.",
            )
        
        # Get division info
        division_response = (
            supabase.table("divisions")
            .select("*")
            .eq("division_id", division_id)
            .single()
            .execute()
        )
        
        # Get all timetable entries for this division
        entries_response = (
            supabase.table("timetable_entries")
            .select("""
                *,
                faculty(faculty_id, faculty_name, email),
                subjects(subject_id, subject_name, subject_code),
                rooms(room_id, room_name, room_type),
                batches(batch_id, batch_name),
                days(day_id, day_name, day_order),
                time_slots(slot_id, start_time, end_time, slot_order)
            """)
            .eq("version_id", version_id)
            .eq("division_id", division_id)
            .order("day_id")
            .order("slot_id")
            .execute()
        )
        
        return {
            "data": {
                "division": division_response.data,
                "entries": entries_response.data or [],
                "version_id": version_id,
                "total_entries": len(entries_response.data or []),
            },
            "message": "Division timetable retrieved successfully",
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch division timetable: {str(e)}",
        )


@router.get("/my-divisions", response_model=SuccessResponse)
async def get_my_divisions(
    version_id: str | None = None,
    current_user: CurrentUser = Depends(require_role("FACULTY")),
) -> dict:
    """
    Get list of divisions that the logged-in faculty teaches.
    """
    try:
        # Get faculty profile
        faculty = _get_faculty_for_user_email(current_user)
        if not faculty:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No faculty profile mapped to this account.",
            )
        
        faculty_id = faculty.get("faculty_id")
        supabase = get_service_supabase()
        
        # Get latest version if not specified
        if not version_id:
            version_response = (
                supabase.table("timetable_versions")
                .select("version_id")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if version_response.data:
                version_id = version_response.data[0]["version_id"]
            else:
                return {
                    "data": {
                        "faculty": faculty,
                        "divisions": [],
                        "version_id": None,
                    },
                    "message": "No timetable version found",
                }
        
        # Get distinct divisions taught by this faculty
        entries_response = (
            supabase.table("timetable_entries")
            .select("division_id, divisions(division_id, division_name, year, department_id)")
            .eq("version_id", version_id)
            .eq("faculty_id", faculty_id)
            .execute()
        )
        
        # Extract unique divisions
        divisions_map = {}
        for entry in (entries_response.data or []):
            div = entry.get("divisions")
            if div and div.get("division_id"):
                divisions_map[div["division_id"]] = div
        
        divisions = list(divisions_map.values())
        
        return {
            "data": {
                "faculty": faculty,
                "divisions": divisions,
                "version_id": version_id,
                "total_divisions": len(divisions),
            },
            "message": "Faculty divisions retrieved successfully",
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch faculty divisions: {str(e)}",
        )


@router.get("/my-schedule-summary", response_model=SuccessResponse)
async def get_my_schedule_summary(
    version_id: str | None = None,
    current_user: CurrentUser = Depends(require_role("FACULTY")),
) -> dict:
    """
    Get a summary of the faculty's teaching schedule.
    Includes total hours, divisions taught, subjects taught, etc.
    """
    try:
        # Get faculty profile
        faculty = _get_faculty_for_user_email(current_user)
        if not faculty:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No faculty profile mapped to this account.",
            )
        
        faculty_id = faculty.get("faculty_id")
        supabase = get_service_supabase()
        
        # Get latest version if not specified
        if not version_id:
            version_response = (
                supabase.table("timetable_versions")
                .select("version_id")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if version_response.data:
                version_id = version_response.data[0]["version_id"]
            else:
                return {
                    "data": {
                        "faculty": faculty,
                        "summary": {},
                        "version_id": None,
                    },
                    "message": "No timetable version found",
                }
        
        # Get all entries for this faculty
        entries_response = (
            supabase.table("timetable_entries")
            .select("""
                *,
                divisions(division_id, division_name),
                subjects(subject_id, subject_name),
                time_slots(start_time, end_time)
            """)
            .eq("version_id", version_id)
            .eq("faculty_id", faculty_id)
            .execute()
        )
        
        entries = entries_response.data or []
        
        # Calculate summary statistics
        divisions = set()
        subjects = set()
        session_types = {"THEORY": 0, "LAB": 0, "TUTORIAL": 0}
        total_slots = len(entries)
        
        for entry in entries:
            if entry.get("divisions"):
                divisions.add(entry["divisions"]["division_name"])
            if entry.get("subjects"):
                subjects.add(entry["subjects"]["subject_name"])
            session_type = entry.get("session_type", "THEORY")
            if session_type in session_types:
                session_types[session_type] += 1
        
        summary = {
            "total_slots": total_slots,
            "total_divisions": len(divisions),
            "total_subjects": len(subjects),
            "divisions": list(divisions),
            "subjects": list(subjects),
            "session_breakdown": session_types,
        }
        
        return {
            "data": {
                "faculty": faculty,
                "summary": summary,
                "version_id": version_id,
            },
            "message": "Faculty schedule summary retrieved successfully",
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch faculty schedule summary: {str(e)}",
        )

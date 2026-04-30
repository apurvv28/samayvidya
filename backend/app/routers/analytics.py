"""Department analytics routes for HOD dashboard."""
from fastapi import APIRouter, HTTPException, status, Depends
from app.dependencies.auth import get_current_user, CurrentUser, require_role
from app.supabase_client import get_service_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/department-overview", response_model=SuccessResponse)
async def get_department_overview(
    current_user: CurrentUser = Depends(require_role("HOD", "COORDINATOR", "ADMIN")),
) -> dict:
    """Get department overview statistics for HOD dashboard."""
    try:
        supabase = get_service_supabase()
        department_id = current_user.department_id
        
        # Get faculty count
        faculty_response = (
            supabase.table("faculty")
            .select("faculty_id", count="exact")
            .eq("department_id", department_id)
            .eq("is_active", True)
            .execute()
        )
        faculty_count = faculty_response.count or 0
        
        # Get divisions count
        divisions_response = (
            supabase.table("divisions")
            .select("division_id", count="exact")
            .eq("department_id", department_id)
            .execute()
        )
        divisions_count = divisions_response.count or 0
        
        # Get subjects count
        subjects_response = (
            supabase.table("subjects")
            .select("subject_id", count="exact")
            .eq("department_id", department_id)
            .execute()
        )
        subjects_count = subjects_response.count or 0
        
        # Get pending leaves count
        pending_leaves_response = (
            supabase.table("faculty_leaves")
            .select("leave_id", count="exact")
            .eq("status", "PENDING")
            .execute()
        )
        
        # Filter by department through faculty
        pending_leaves = pending_leaves_response.data or []
        faculty_ids = [f["faculty_id"] for f in (faculty_response.data or [])]
        
        # Get timetable versions count
        versions_response = (
            supabase.table("timetable_versions")
            .select("version_id", count="exact")
            .execute()
        )
        versions_count = versions_response.count or 0
        
        return {
            "data": {
                "faculty_count": faculty_count,
                "divisions_count": divisions_count,
                "subjects_count": subjects_count,
                "pending_leaves_count": len(pending_leaves),
                "timetable_versions_count": versions_count,
            },
            "message": "Department overview retrieved successfully",
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch department overview: {str(e)}",
        )


@router.get("/faculty-workload", response_model=SuccessResponse)
async def get_faculty_workload(
    version_id: str | None = None,
    current_user: CurrentUser = Depends(require_role("HOD", "COORDINATOR", "ADMIN")),
) -> dict:
    """Get faculty workload distribution for the department."""
    try:
        supabase = get_service_supabase()
        department_id = current_user.department_id
        
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
                    "data": {"workload": []},
                    "message": "No timetable version found",
                }
        
        # Get all faculty in department
        faculty_response = (
            supabase.table("faculty")
            .select("faculty_id, faculty_name, email, max_load_per_week")
            .eq("department_id", department_id)
            .eq("is_active", True)
            .execute()
        )
        
        faculty_list = faculty_response.data or []
        
        # Get timetable entries for each faculty
        workload_data = []
        for faculty in faculty_list:
            entries_response = (
                supabase.table("timetable_entries")
                .select("entry_id, session_type")
                .eq("version_id", version_id)
                .eq("faculty_id", faculty["faculty_id"])
                .execute()
            )
            
            entries = entries_response.data or []
            total_slots = len(entries)
            
            # Count by session type
            theory_count = sum(1 for e in entries if e.get("session_type") == "THEORY")
            lab_count = sum(1 for e in entries if e.get("session_type") == "LAB")
            tutorial_count = sum(1 for e in entries if e.get("session_type") == "TUTORIAL")
            
            workload_data.append({
                "faculty_id": faculty["faculty_id"],
                "faculty_name": faculty["faculty_name"],
                "email": faculty["email"],
                "total_slots": total_slots,
                "max_load": faculty.get("max_load_per_week", 0),
                "utilization_percentage": round((total_slots / faculty.get("max_load_per_week", 1)) * 100, 1) if faculty.get("max_load_per_week") else 0,
                "theory_slots": theory_count,
                "lab_slots": lab_count,
                "tutorial_slots": tutorial_count,
            })
        
        # Sort by utilization percentage descending
        workload_data.sort(key=lambda x: x["utilization_percentage"], reverse=True)
        
        return {
            "data": {
                "workload": workload_data,
                "version_id": version_id,
            },
            "message": "Faculty workload retrieved successfully",
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch faculty workload: {str(e)}",
        )


@router.get("/room-utilization", response_model=SuccessResponse)
async def get_room_utilization(
    version_id: str | None = None,
    current_user: CurrentUser = Depends(require_role("HOD", "COORDINATOR", "ADMIN")),
) -> dict:
    """Get room utilization statistics."""
    try:
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
                    "data": {"utilization": []},
                    "message": "No timetable version found",
                }
        
        # Get all rooms
        rooms_response = (
            supabase.table("rooms")
            .select("room_id, room_name, room_type, capacity")
            .execute()
        )
        
        rooms_list = rooms_response.data or []
        
        # Get total possible slots (days * time_slots)
        days_response = supabase.table("days").select("day_id", count="exact").execute()
        slots_response = supabase.table("time_slots").select("slot_id", count="exact").execute()
        
        total_possible_slots = (days_response.count or 0) * (slots_response.count or 0)
        
        # Get utilization for each room
        utilization_data = []
        for room in rooms_list:
            entries_response = (
                supabase.table("timetable_entries")
                .select("entry_id")
                .eq("version_id", version_id)
                .eq("room_id", room["room_id"])
                .execute()
            )
            
            used_slots = len(entries_response.data or [])
            utilization_percentage = round((used_slots / total_possible_slots) * 100, 1) if total_possible_slots else 0
            
            utilization_data.append({
                "room_id": room["room_id"],
                "room_name": room["room_name"],
                "room_type": room.get("room_type", "CLASSROOM"),
                "capacity": room.get("capacity", 0),
                "used_slots": used_slots,
                "total_possible_slots": total_possible_slots,
                "utilization_percentage": utilization_percentage,
            })
        
        # Sort by utilization percentage descending
        utilization_data.sort(key=lambda x: x["utilization_percentage"], reverse=True)
        
        return {
            "data": {
                "utilization": utilization_data,
                "version_id": version_id,
            },
            "message": "Room utilization retrieved successfully",
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch room utilization: {str(e)}",
        )


@router.get("/leave-statistics", response_model=SuccessResponse)
async def get_leave_statistics(
    current_user: CurrentUser = Depends(require_role("HOD", "COORDINATOR", "ADMIN")),
) -> dict:
    """Get leave statistics for the department."""
    try:
        supabase = get_service_supabase()
        department_id = current_user.department_id
        
        # Get all faculty in department
        faculty_response = (
            supabase.table("faculty")
            .select("faculty_id")
            .eq("department_id", department_id)
            .execute()
        )
        
        faculty_ids = [f["faculty_id"] for f in (faculty_response.data or [])]
        
        if not faculty_ids:
            return {
                "data": {
                    "total_leaves": 0,
                    "pending": 0,
                    "approved": 0,
                    "rejected": 0,
                    "by_month": [],
                },
                "message": "No faculty found in department",
            }
        
        # Get all leaves for department faculty
        leaves_response = (
            supabase.table("faculty_leaves")
            .select("leave_id, status, start_date, end_date, created_at")
            .in_("faculty_id", faculty_ids)
            .execute()
        )
        
        leaves = leaves_response.data or []
        
        # Count by status
        pending = sum(1 for l in leaves if l.get("status") == "PENDING")
        approved = sum(1 for l in leaves if l.get("status") == "APPROVED")
        rejected = sum(1 for l in leaves if l.get("status") == "REJECTED")
        
        # Group by month
        from collections import defaultdict
        from datetime import datetime
        
        by_month = defaultdict(lambda: {"pending": 0, "approved": 0, "rejected": 0})
        
        for leave in leaves:
            if leave.get("created_at"):
                month_key = datetime.fromisoformat(leave["created_at"].replace("Z", "+00:00")).strftime("%Y-%m")
                status = leave.get("status", "PENDING").lower()
                by_month[month_key][status] += 1
        
        # Convert to list
        monthly_data = [
            {"month": month, **counts}
            for month, counts in sorted(by_month.items())
        ]
        
        return {
            "data": {
                "total_leaves": len(leaves),
                "pending": pending,
                "approved": approved,
                "rejected": rejected,
                "by_month": monthly_data,
            },
            "message": "Leave statistics retrieved successfully",
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch leave statistics: {str(e)}",
        )


@router.get("/timetable-conflicts", response_model=SuccessResponse)
async def get_timetable_conflicts(
    version_id: str | None = None,
    current_user: CurrentUser = Depends(require_role("HOD", "COORDINATOR", "ADMIN")),
) -> dict:
    """Get timetable conflicts and issues."""
    try:
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
                    "data": {"conflicts": []},
                    "message": "No timetable version found",
                }
        
        # Get all entries
        entries_response = (
            supabase.table("timetable_entries")
            .select("entry_id, faculty_id, room_id, day_id, slot_id, division_id")
            .eq("version_id", version_id)
            .execute()
        )
        
        entries = entries_response.data or []
        
        # Check for conflicts
        conflicts = []
        
        # Group by day and slot
        from collections import defaultdict
        slots_map = defaultdict(list)
        
        for entry in entries:
            key = (entry["day_id"], entry["slot_id"])
            slots_map[key].append(entry)
        
        # Check for faculty double-booking
        for (day_id, slot_id), slot_entries in slots_map.items():
            faculty_map = defaultdict(list)
            room_map = defaultdict(list)
            
            for entry in slot_entries:
                faculty_map[entry["faculty_id"]].append(entry)
                room_map[entry["room_id"]].append(entry)
            
            # Faculty conflicts
            for faculty_id, fac_entries in faculty_map.items():
                if len(fac_entries) > 1:
                    conflicts.append({
                        "type": "FACULTY_DOUBLE_BOOKING",
                        "severity": "HIGH",
                        "day_id": day_id,
                        "slot_id": slot_id,
                        "faculty_id": faculty_id,
                        "entry_count": len(fac_entries),
                        "entry_ids": [e["entry_id"] for e in fac_entries],
                    })
            
            # Room conflicts
            for room_id, room_entries in room_map.items():
                if len(room_entries) > 1:
                    conflicts.append({
                        "type": "ROOM_DOUBLE_BOOKING",
                        "severity": "HIGH",
                        "day_id": day_id,
                        "slot_id": slot_id,
                        "room_id": room_id,
                        "entry_count": len(room_entries),
                        "entry_ids": [e["entry_id"] for e in room_entries],
                    })
        
        return {
            "data": {
                "conflicts": conflicts,
                "total_conflicts": len(conflicts),
                "version_id": version_id,
            },
            "message": "Timetable conflicts retrieved successfully",
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch timetable conflicts: {str(e)}",
        )

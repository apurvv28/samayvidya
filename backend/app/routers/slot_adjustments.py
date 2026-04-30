"""Slot adjustment management for faculty leaves."""
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_service_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/slot-adjustments", tags=["slot-adjustments"])


class CreateAdjustmentRequest(BaseModel):
    """Create slot adjustment request."""
    leave_id: str
    entry_ids: list[str]


class AssignReplacementFaculty(BaseModel):
    """Assign replacement faculty to affected slot."""
    affected_slot_id: str
    replacement_faculty_id: str | None  # None means "no faculty available"


@router.post("/create", response_model=SuccessResponse)
async def create_adjustment_request(
    request: CreateAdjustmentRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """
    Create a slot adjustment request for an approved leave.
    Identifies affected slots and finds available faculty.
    """
    try:
        supabase = get_service_supabase()
        
        # 1. Verify leave exists and is approved
        leave_response = (
            supabase.table("faculty_leaves")
            .select("*")
            .eq("leave_id", request.leave_id)
            .single()
            .execute()
        )
        
        if not leave_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Leave request not found"
            )
        
        leave = leave_response.data
        if leave.get("status") != "APPROVED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Leave must be approved before requesting adjustment"
            )
        
        faculty_id = leave.get("faculty_id")
        
        # 2. Check if adjustment request already exists
        existing = (
            supabase.table("slot_adjustment_requests")
            .select("request_id")
            .eq("leave_id", request.leave_id)
            .execute()
        )
        
        if existing.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Adjustment request already exists for this leave"
            )
        
        # 3. Get affected timetable entries
        entries_response = (
            supabase.table("timetable_entries")
            .select("*, divisions(division_id, division_name), subjects(subject_id, subject_name), days(day_id, day_name), time_slots(slot_id, start_time, end_time), rooms(room_id, room_number)")
            .in_("entry_id", request.entry_ids)
            .eq("faculty_id", faculty_id)
            .execute()
        )
        
        affected_entries = entries_response.data or []
        if not affected_entries:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No affected timetable entries found"
            )
        
        # 4. Create adjustment request
        adjustment_request = (
            supabase.table("slot_adjustment_requests")
            .insert({
                "leave_id": request.leave_id,
                "faculty_id": faculty_id,
                "status": "PENDING",
                "total_affected_slots": len(affected_entries),
                "resolved_slots": 0
            })
            .execute()
        )
        
        request_id = adjustment_request.data[0]["request_id"]
        
        # 5. Create affected slots records
        affected_slots_data = []
        for entry in affected_entries:
            affected_slots_data.append({
                "request_id": request_id,
                "entry_id": entry["entry_id"],
                "original_faculty_id": faculty_id,
                "division_id": entry["division_id"],
                "subject_id": entry["subject_id"],
                "day_id": entry["day_id"],
                "slot_id": entry["slot_id"],
                "room_id": entry["room_id"],
                "status": "PENDING"
            })
        
        affected_slots_response = (
            supabase.table("affected_slots")
            .insert(affected_slots_data)
            .execute()
        )
        
        affected_slots = affected_slots_response.data or []
        
        # 6. Find available faculty for each affected slot
        for affected_slot in affected_slots:
            available_faculty = await _find_available_faculty(
                supabase,
                affected_slot["day_id"],
                affected_slot["slot_id"],
                affected_slot["division_id"],
                affected_slot["subject_id"],
                faculty_id
            )
            
            # Insert available faculty records
            if available_faculty:
                availability_data = []
                for fac in available_faculty:
                    availability_data.append({
                        "affected_slot_id": affected_slot["affected_slot_id"],
                        "faculty_id": fac["faculty_id"],
                        "is_free": fac["is_free"],
                        "teaches_division": fac["teaches_division"],
                        "teaches_subject": fac["teaches_subject"],
                        "priority_score": fac["priority_score"]
                    })
                
                supabase.table("available_faculty_for_slots").insert(availability_data).execute()
        
        # 7. Send notification to coordinator
        try:
            # Get coordinators in the same department as the faculty
            faculty_response = (
                supabase.table("faculty")
                .select("department_id, faculty_name")
                .eq("faculty_id", faculty_id)
                .single()
                .execute()
            )
            
            if faculty_response.data:
                dept_id = faculty_response.data.get("department_id")
                faculty_name = faculty_response.data.get("faculty_name")
                
                if dept_id:
                    coordinators_response = (
                        supabase.table("user_profiles")
                        .select("email")
                        .eq("department_id", dept_id)
                        .eq("role", "COORDINATOR")
                        .execute()
                    )
                    
                    for coordinator in (coordinators_response.data or []):
                        if coordinator.get("email"):
                            try:
                                supabase.table("notification_log").insert({
                                    "notification_type": "SLOT_ADJUSTMENT_REQUEST",
                                    "recipient_email": coordinator["email"],
                                    "recipient_type": "COORDINATOR",
                                    "subject": "New Slot Adjustment Request",
                                    "body": f"{faculty_name} has requested slot adjustments for {len(affected_entries)} slots due to approved leave.",
                                    "status": "SENT"
                                }).execute()
                            except Exception as e:
                                print(f"Failed to send coordinator notification: {e}")
        except Exception as e:
            print(f"Failed to notify coordinators: {e}")
        
        return {
            "data": {
                "request_id": request_id,
                "affected_slots_count": len(affected_entries),
                "status": "PENDING"
            },
            "message": "Slot adjustment request created successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create adjustment request: {str(e)}"
        )


async def _find_available_faculty(
    supabase,
    day_id: int,
    slot_id: str,
    division_id: str,
    subject_id: str,
    exclude_faculty_id: str
) -> list[dict]:
    """
    Find faculty available for a specific slot.
    Priority: teaches same division & subject > teaches division > teaches subject > free
    """
    # Get all faculty
    all_faculty = supabase.table("faculty").select("faculty_id, faculty_name").execute().data or []
    
    # Get faculty already assigned to this slot
    busy_faculty_response = (
        supabase.table("timetable_entries")
        .select("faculty_id")
        .eq("day_id", day_id)
        .eq("slot_id", slot_id)
        .execute()
    )
    busy_faculty_ids = {entry["faculty_id"] for entry in (busy_faculty_response.data or [])}
    
    # Get faculty teaching this division
    division_faculty_response = (
        supabase.table("timetable_entries")
        .select("faculty_id")
        .eq("division_id", division_id)
        .execute()
    )
    division_faculty_ids = {entry["faculty_id"] for entry in (division_faculty_response.data or [])}
    
    # Get faculty teaching this subject
    subject_faculty_response = (
        supabase.table("timetable_entries")
        .select("faculty_id")
        .eq("subject_id", subject_id)
        .execute()
    )
    subject_faculty_ids = {entry["faculty_id"] for entry in (subject_faculty_response.data or [])}
    
    available_faculty = []
    for faculty in all_faculty:
        fac_id = faculty["faculty_id"]
        
        # Skip the faculty on leave
        if fac_id == exclude_faculty_id:
            continue
        
        is_free = fac_id not in busy_faculty_ids
        teaches_division = fac_id in division_faculty_ids
        teaches_subject = fac_id in subject_faculty_ids
        
        # Calculate priority score
        priority_score = 0
        if teaches_division and teaches_subject:
            priority_score = 3
        elif teaches_division:
            priority_score = 2
        elif teaches_subject:
            priority_score = 1
        
        # Only include if free OR teaches the division/subject
        if is_free or teaches_division or teaches_subject:
            available_faculty.append({
                "faculty_id": fac_id,
                "faculty_name": faculty["faculty_name"],
                "is_free": is_free,
                "teaches_division": teaches_division,
                "teaches_subject": teaches_subject,
                "priority_score": priority_score
            })
    
    # Sort by priority score (highest first)
    available_faculty.sort(key=lambda x: x["priority_score"], reverse=True)
    
    return available_faculty


@router.get("/requests", response_model=SuccessResponse)
async def list_adjustment_requests(
    status_filter: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all slot adjustment requests with details."""
    try:
        supabase = get_service_supabase()
        
        query = supabase.table("slot_adjustment_requests").select(
            "*, "
            "faculty_leaves(leave_id, start_date, end_date, leave_type, reason), "
            "faculty(faculty_id, faculty_name, email)"
        )
        
        if status_filter:
            query = query.eq("status", status_filter)
        
        response = query.order("created_at", desc=True).execute()
        
        return {
            "data": response.data,
            "message": "Adjustment requests retrieved successfully"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch adjustment requests: {str(e)}"
        )


@router.get("/requests/{request_id}/affected-slots", response_model=SuccessResponse)
async def get_affected_slots(
    request_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get all affected slots for an adjustment request with available faculty."""
    try:
        supabase = get_service_supabase()
        
        # Get affected slots with related data
        # Note: We need both original and replacement faculty
        affected_slots_response = (
            supabase.table("affected_slots")
            .select(
                "*, "
                "divisions(division_id, division_name), "
                "subjects(subject_id, subject_name, sub_short_form), "
                "days(day_id, day_name), "
                "time_slots(slot_id, start_time, end_time), "
                "rooms(room_id, room_number), "
                "original_faculty:faculty!affected_slots_original_faculty_id_fkey(faculty_id, faculty_name), "
                "replacement_faculty:faculty!affected_slots_replacement_faculty_id_fkey(faculty_id, faculty_name)"
            )
            .eq("request_id", request_id)
            .execute()
        )
        
        affected_slots = affected_slots_response.data or []
        
        # Get available faculty for each slot
        for slot in affected_slots:
            available_faculty_response = (
                supabase.table("available_faculty_for_slots")
                .select("*, faculty(faculty_id, faculty_name, email)")
                .eq("affected_slot_id", slot["affected_slot_id"])
                .order("priority_score", desc=True)
                .execute()
            )
            slot["available_faculty"] = available_faculty_response.data or []
        
        return {
            "data": affected_slots,
            "message": "Affected slots retrieved successfully"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch affected slots: {str(e)}"
        )


@router.post("/assign-replacement", response_model=SuccessResponse)
async def assign_replacement_faculty(
    assignment: AssignReplacementFaculty,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """
    Assign a replacement faculty to an affected slot.
    If replacement_faculty_id is None, marks slot as "no faculty available".
    """
    try:
        supabase = get_service_supabase()
        
        # Get affected slot details
        affected_slot_response = (
            supabase.table("affected_slots")
            .select("*, slot_adjustment_requests(request_id, faculty_id)")
            .eq("affected_slot_id", assignment.affected_slot_id)
            .single()
            .execute()
        )
        
        if not affected_slot_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Affected slot not found"
            )
        
        affected_slot = affected_slot_response.data
        request_id = affected_slot["slot_adjustment_requests"]["request_id"]
        
        # Handle "none" string from frontend
        replacement_id = assignment.replacement_faculty_id
        if replacement_id and replacement_id.lower() == "none":
            replacement_id = None
        
        # Update affected slot
        if replacement_id:
            # Assign replacement faculty
            update_data = {
                "replacement_faculty_id": replacement_id,
                "status": "ASSIGNED"
            }
            status_msg = "Replacement faculty assigned"
        else:
            # Mark as no replacement available - use explicit None
            update_data = {
                "status": "NO_REPLACEMENT"
            }
            status_msg = "Marked as no faculty available"
        
        # Execute update with proper error handling
        try:
            update_response = (
                supabase.table("affected_slots")
                .update(update_data)
                .eq("affected_slot_id", assignment.affected_slot_id)
                .execute()
            )
        except Exception as update_error:
            print(f"Update error: {update_error}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to update affected slot: {str(update_error)}"
            )
        
        # Update request progress
        all_slots_response = (
            supabase.table("affected_slots")
            .select("status")
            .eq("request_id", request_id)
            .execute()
        )
        
        all_slots = all_slots_response.data or []
        resolved_count = sum(1 for slot in all_slots if slot["status"] in ["ASSIGNED", "NO_REPLACEMENT"])
        total_count = len(all_slots)
        
        request_status = "COMPLETED" if resolved_count == total_count else "IN_PROGRESS"
        
        supabase.table("slot_adjustment_requests").update({
            "resolved_slots": resolved_count,
            "status": request_status,
            "completed_at": datetime.utcnow().isoformat() if request_status == "COMPLETED" else None
        }).eq("request_id", request_id).execute()
        
        # Send notifications
        if replacement_id:
            # Get replacement faculty email
            faculty_response = (
                supabase.table("faculty")
                .select("email, faculty_name")
                .eq("faculty_id", replacement_id)
                .single()
                .execute()
            )
            
            if faculty_response.data and faculty_response.data.get("email"):
                try:
                    supabase.table("notification_log").insert({
                        "notification_type": "SLOT_ASSIGNMENT",
                        "recipient_email": faculty_response.data["email"],
                        "recipient_type": "FACULTY",
                        "subject": "New Slot Assignment",
                        "body": f"You have been assigned to cover a slot for a faculty on leave.",
                        "status": "SENT"
                    }).execute()
                except Exception as e:
                    # Log but don't fail the assignment
                    print(f"Failed to send notification: {e}")
        
        # Notify students in the affected division
        try:
            division_id = affected_slot.get("division_id")
            if division_id:
                students_response = (
                    supabase.table("students")
                    .select("email")
                    .eq("division_id", division_id)
                    .execute()
                )
                
                for student in (students_response.data or []):
                    if student.get("email"):
                        try:
                            supabase.table("notification_log").insert({
                                "notification_type": "SLOT_ADJUSTMENT",
                                "recipient_email": student["email"],
                                "recipient_type": "STUDENT",
                                "subject": "Timetable Change",
                                "body": f"A slot in your timetable has been updated due to faculty leave.",
                                "status": "SENT"
                            }).execute()
                        except Exception as e:
                            print(f"Failed to send student notification: {e}")
        except Exception as e:
            print(f"Failed to notify students: {e}")
        
        # Note: Student notifications would require fetching student emails from the division
        # Skipping for now to avoid additional complexity
        
        return {
            "data": {
                "affected_slot_id": assignment.affected_slot_id,
                "status": update_data["status"],
                "request_progress": f"{resolved_count}/{total_count}"
            },
            "message": status_msg
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assign replacement: {str(e)}"
        )


@router.get("/my-affected-slots", response_model=SuccessResponse)
async def get_my_affected_slots(
    faculty_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get affected slots for a specific faculty (for faculty to view their own)."""
    try:
        supabase = get_service_supabase()
        
        # Get adjustment requests for this faculty
        requests_response = (
            supabase.table("slot_adjustment_requests")
            .select("request_id, status, total_affected_slots, resolved_slots, created_at")
            .eq("faculty_id", faculty_id)
            .order("created_at", desc=True)
            .execute()
        )
        
        requests = requests_response.data or []
        
        # Get affected slots for each request
        for request in requests:
            affected_slots_response = (
                supabase.table("affected_slots")
                .select(
                    "*, "
                    "divisions(division_name), "
                    "subjects(subject_name, sub_short_form), "
                    "days(day_name), "
                    "time_slots(start_time, end_time), "
                    "rooms(room_number), "
                    "faculty!affected_slots_replacement_faculty_id_fkey(faculty_name)"
                )
                .eq("request_id", request["request_id"])
                .execute()
            )
            request["affected_slots"] = affected_slots_response.data or []
        
        return {
            "data": requests,
            "message": "Your affected slots retrieved successfully"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch affected slots: {str(e)}"
        )

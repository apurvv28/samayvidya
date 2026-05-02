"""Slot adjustment management for faculty leaves."""
from datetime import datetime
import json
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_service_supabase
from app.schemas.common import SuccessResponse
from app.services.email_service import send_revised_timetable_update_email

router = APIRouter(prefix="/slot-adjustments", tags=["slot-adjustments"])
DAY_TABLE_MARKER = "__DAY_TABLE__:"


class CreateAdjustmentRequest(BaseModel):
    """Create slot adjustment request."""
    leave_id: str
    entry_ids: list[str]


class AssignReplacementFaculty(BaseModel):
    """Assign replacement faculty to affected slot."""
    affected_slot_id: str
    replacement_faculty_id: str | None  # None means "no faculty available"


class FacultyDecisionPayload(BaseModel):
    """Accept or reject an assigned slot adjustment."""
    affected_slot_id: str
    decision: str  # ACCEPT or REJECT


def _get_faculty_by_email(email: str | None) -> dict | None:
    """Resolve faculty profile from user email."""
    if not email:
        return None
    supabase = get_service_supabase()
    response = (
        supabase.table("faculty")
        .select("faculty_id, faculty_name, email")
        .ilike("email", email)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def _time_to_minutes(value: str | None) -> int:
    """Convert HH:MM or HH:MM:SS time to minutes."""
    if not value:
        return 0
    parts = str(value).split(":")
    if len(parts) < 2:
        return 0
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        return 0


def _calculate_request_status(slots: list[dict]) -> tuple[str, int]:
    """Compute request status and resolved count based on slot statuses."""
    final_statuses = {"ASSIGNED", "NO_REPLACEMENT"}
    resolved_count = sum(1 for slot in slots if slot.get("status") in final_statuses)
    has_pending = any(slot.get("status") == "PENDING" for slot in slots)
    if not slots:
        return "PENDING", 0
    if resolved_count == len(slots):
        return "COMPLETED", resolved_count
    if resolved_count > 0 or has_pending:
        return "IN_PROGRESS", resolved_count
    return "PENDING", 0


def _has_college_started(leave_start_date: str | None, now_utc: datetime | None = None) -> bool:
    """Return True if leave day has reached/passed 08:00 local equivalent."""
    if not leave_start_date:
        return False
    now = now_utc or datetime.now()
    try:
        leave_date = datetime.fromisoformat(str(leave_start_date)).date()
    except ValueError:
        return False
    if now.date() > leave_date:
        return True
    if now.date() < leave_date:
        return False
    return now.hour >= 8


def _notify_students_and_email_revised_timetable(
    supabase,
    *,
    request_id: str,
    leave: dict,
    slots: list[dict],
) -> None:
    """Notify and email students of revised daily timetable."""
    division_ids = sorted(
        {
            str(slot.get("division_id"))
            for slot in slots
            if slot.get("division_id")
        }
    )
    if not division_ids:
        return

    # NOTE: Supabase/PostgREST can reject `in.(...)` for UUID-like values depending
    # on URL encoding/parser behavior. Query per division_id to keep it robust.
    students: list[dict] = []
    for division_id in division_ids:
        rows = (
            supabase.table("students")
            .select("email, full_name, division_id")
            .eq("division_id", division_id)
            .execute()
            .data
            or []
        )
        students.extend(rows)
    if not students:
        return

    faculty_name = leave.get("faculty", {}).get("faculty_name") or "Faculty"
    updates_by_division = {}
    for slot in slots:
        division_id = str(slot.get("division_id") or "")
        if not division_id:
            continue
        day_name = (slot.get("days") or {}).get("day_name") or "Day"
        start_time = (slot.get("time_slots") or {}).get("start_time") or "--:--"
        end_time = (slot.get("time_slots") or {}).get("end_time") or "--:--"
        subject = (slot.get("subjects") or {}).get("subject_name") or "Subject"
        replacement_name = (slot.get("replacement_faculty") or {}).get("faculty_name")
        slot_status = slot.get("status")
        if slot_status == "ACCEPTED" and replacement_name:
            line = f"{day_name} {start_time}-{end_time}: {subject} by {replacement_name}"
        else:
            line = f"{day_name} {start_time}-{end_time}: {subject} is FREE SLOT"
        updates_by_division.setdefault(division_id, []).append(line)

    notification_rows = []
    for student in students:
        email = (student.get("email") or "").strip()
        division_id = str(student.get("division_id") or "")
        if not email:
            continue
        update_lines = updates_by_division.get(division_id, [])
        body = (
            f"Revised day timetable update for division {division_id} due to {faculty_name}'s leave "
            f"on {leave.get('start_date')}: "
            + ("; ".join(update_lines) if update_lines else "No affected slots.")
        )
        notification_rows.append(
            {
                "notification_type": "REVISED_DAY_TIMETABLE",
                "recipient_email": email,
                "recipient_type": "STUDENT",
                "subject": "Revised Day Timetable Update",
                "body": body,
                "related_leave_id": leave.get("leave_id"),
                "status": "SENT",
            }
        )
        send_revised_timetable_update_email(
            to_email=email,
            student_name=student.get("full_name") or "Student",
            leave_date=str(leave.get("start_date") or ""),
            update_lines=update_lines,
        )

    if notification_rows:
        supabase.table("notification_log").insert(notification_rows).execute()

def _maybe_publish_revised_timetable(supabase, request_id: str) -> None:
    """Publish revised timetable updates based on acceptance/cutoff rules."""
    request_response = (
        supabase.table("slot_adjustment_requests")
        .select("request_id, leave_id")
        .eq("request_id", request_id)
        .single()
        .execute()
    )
    request_row = request_response.data or {}
    if not request_row:
        return
    already_published = (
        supabase.table("notification_log")
        .select("notification_id")
        .eq("notification_type", "REVISED_DAY_TIMETABLE")
        .eq("related_leave_id", request_row.get("leave_id"))
        .limit(1)
        .execute()
        .data
        or []
    )
    if already_published:
        return

    leave_response = (
        supabase.table("faculty_leaves")
        .select("leave_id, start_date, faculty:faculty_id(faculty_name)")
        .eq("leave_id", request_row.get("leave_id"))
        .single()
        .execute()
    )
    leave = leave_response.data or {}

    slots_response = (
        supabase.table("affected_slots")
        .select(
            "*, "
            "days(day_name), "
            "time_slots(start_time, end_time), "
            "subjects(subject_name), "
            "replacement_faculty:faculty!affected_slots_replacement_faculty_id_fkey(faculty_name)"
        )
        .eq("request_id", request_id)
        .execute()
    )
    slots = slots_response.data or []
    if not slots:
        return

    all_resolved = all(
        slot.get("status") in {"ASSIGNED", "NO_REPLACEMENT"}
        for slot in slots
    )
    if all_resolved:
        _notify_students_and_email_revised_timetable(
            supabase, request_id=request_id, leave=leave, slots=slots
        )
        return

    if _has_college_started(leave.get("start_date")):
        unresolved_ids = [
            slot.get("affected_slot_id")
            for slot in slots
            if slot.get("status") not in {"ASSIGNED", "NO_REPLACEMENT"}
            and slot.get("affected_slot_id")
        ]
        if unresolved_ids:
            supabase.table("affected_slots").update(
                {"status": "NO_REPLACEMENT", "replacement_faculty_id": None}
            ).in_("affected_slot_id", unresolved_ids).execute()
            slots = (
                supabase.table("affected_slots")
                .select(
                    "*, "
                    "days(day_name), "
                    "time_slots(start_time, end_time), "
                    "subjects(subject_name), "
                    "replacement_faculty:faculty!affected_slots_replacement_faculty_id_fkey(faculty_name)"
                )
                .eq("request_id", request_id)
                .execute()
                .data
                or []
            )
        _notify_students_and_email_revised_timetable(
            supabase, request_id=request_id, leave=leave, slots=slots
        )


def _notify_division_students_for_slot_decision(supabase, slot: dict, decision: str) -> None:
    """Notify only affected division students when a slot is accepted/rejected."""
    division_id = slot.get("division_id")
    day_id = slot.get("day_id")
    request_id = (slot.get("slot_adjustment_requests") or {}).get("request_id")
    if not division_id:
        return

    # Prefer students table; fallback to user_profiles mapping.
    students: list[dict] = []
    try:
        students = (
            supabase.table("students")
            .select("email")
            .eq("division_id", division_id)
            .execute()
            .data
            or []
        )
    except Exception:
        students = []

    if not students:
        try:
            students = (
                supabase.table("user_profiles")
                .select("email")
                .eq("role", "STUDENT")
                .eq("division", str(division_id))
                .execute()
                .data
                or []
            )
        except Exception:
            students = []

    if not students:
        return

    # Build revised day timetable snapshot (table payload) for this division/day.
    version_rows = (
        supabase.table("timetable_versions")
        .select("version_id")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    version_id = version_rows[0]["version_id"] if version_rows else None

    day_row = (
        supabase.table("days")
        .select("day_name")
        .eq("day_id", day_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    day_name = day_row[0].get("day_name") if day_row else "Day"

    division_row = (
        supabase.table("divisions")
        .select("division_name")
        .eq("division_id", division_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    division_name = division_row[0].get("division_name") if division_row else str(division_id)

    entry_rows = []
    if version_id and day_id:
        entry_rows = (
            supabase.table("timetable_entries")
            .select(
                "slot_id, "
                "subjects(subject_name), "
                "faculty(faculty_name), "
                "time_slots(start_time, end_time, slot_order)"
            )
            .eq("version_id", version_id)
            .eq("division_id", division_id)
            .eq("day_id", day_id)
            .execute()
            .data
            or []
        )

    # Apply slot adjustments for this request/day/division to show revised day timetable.
    adjusted_slots = (
        supabase.table("affected_slots")
        .select(
            "slot_id, status, "
            "subjects(subject_name), "
            "time_slots(start_time, end_time), "
            "replacement_faculty:faculty!affected_slots_replacement_faculty_id_fkey(faculty_name)"
        )
        .eq("request_id", request_id)
        .eq("division_id", division_id)
        .eq("day_id", day_id)
        .execute()
        .data
        or []
    )

    entry_by_slot = {}
    for row in entry_rows:
        slot_id = row.get("slot_id")
        if not slot_id:
            continue
        time_data = row.get("time_slots") or {}
        entry_by_slot[slot_id] = {
            "slot_id": slot_id,
            "time": f"{time_data.get('start_time', '--:--')} - {time_data.get('end_time', '--:--')}",
            "slot_order": time_data.get("slot_order") or 0,
            "subject": (row.get("subjects") or {}).get("subject_name") or "-",
            "faculty": (row.get("faculty") or {}).get("faculty_name") or "-",
            "status": "Scheduled",
        }

    for row in adjusted_slots:
        slot_id = row.get("slot_id")
        if not slot_id:
            continue
        base = entry_by_slot.get(slot_id, {})
        subject_name = (row.get("subjects") or {}).get("subject_name") or base.get("subject") or "-"
        time_data = row.get("time_slots") or {}
        start_time = time_data.get("start_time") or "--:--"
        end_time = time_data.get("end_time") or "--:--"
        replacement_name = (row.get("replacement_faculty") or {}).get("faculty_name")
        status_value = row.get("status")
        if status_value == "ASSIGNED":
            faculty_name = replacement_name or base.get("faculty") or "-"
            slot_status = "Adjusted"
        elif status_value == "NO_REPLACEMENT":
            faculty_name = "FREE SLOT"
            slot_status = "Free"
        else:
            faculty_name = base.get("faculty") or "-"
            slot_status = "Pending"
        entry_by_slot[slot_id] = {
            "slot_id": slot_id,
            "time": f"{start_time} - {end_time}",
            "slot_order": base.get("slot_order", 0),
            "subject": subject_name,
            "faculty": faculty_name,
            "status": slot_status,
        }

    rows = sorted(
        entry_by_slot.values(),
        key=lambda item: (item.get("slot_order") or 0, item.get("time") or ""),
    )
    table_payload = {
        "division_name": division_name,
        "day_name": day_name,
        "rows": [
            {
                "time": item.get("time"),
                "subject": item.get("subject"),
                "faculty": item.get("faculty"),
                "status": item.get("status"),
            }
            for item in rows
        ],
    }
    body_payload = DAY_TABLE_MARKER + json.dumps(table_payload, separators=(",", ":"))

    recipient_rows = []
    for student in students:
        email = (student.get("email") or "").strip()
        if not email:
            continue
        if decision == "ACCEPT":
            subject = "Revised Day Timetable (Accepted Adjustment)"
        else:
            subject = "Revised Day Timetable (Slot Marked Free)"
        recipient_rows.append(
            {
                "notification_type": "SLOT_ADJUSTMENT_DECISION",
                "recipient_email": email,
                "recipient_type": "STUDENT",
                "subject": subject,
                "body": body_payload,
                "status": "SENT",
            }
        )
    if recipient_rows:
        supabase.table("notification_log").insert(recipient_rows).execute()


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
        
        return {
            "data": {
                "request_id": request_id,
                "affected_slots_count": len(affected_entries),
                "status": "PENDING"
            },
            "message": "Slot adjustment request created successfully. Assign replacement faculty and submit for approvals."
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
        
        # Faculty should only see/receive slots for divisions they already teach.
        # Busy/free is still shown for decision-making inside that division scope.
        if teaches_division:
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
            # Propose replacement faculty for HITL acceptance
            update_data = {
                "replacement_faculty_id": replacement_id,
                "status": "PENDING"
            }
            status_msg = "Replacement faculty assigned"
        else:
            # Mark as no replacement available - use explicit None
            update_data = {
                "replacement_faculty_id": None,
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
        request_status, resolved_count = _calculate_request_status(all_slots)
        total_count = len(all_slots)
        
        supabase.table("slot_adjustment_requests").update({
            "resolved_slots": resolved_count,
            "status": request_status,
            "completed_at": datetime.utcnow().isoformat() if request_status == "COMPLETED" else None
        }).eq("request_id", request_id).execute()
        
        # Send notifications to proposed replacement faculty
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
                        "notification_type": "SLOT_ADJUSTMENT_ACTION_REQUIRED",
                        "recipient_email": faculty_response.data["email"],
                        "recipient_type": "FACULTY",
                        "subject": "Slot Adjustment Request",
                        "body": "You have a slot adjustment request pending your acceptance.",
                        "status": "SENT"
                    }).execute()
                except Exception as e:
                    # Log but don't fail the assignment
                    print(f"Failed to send notification: {e}")
        
        _maybe_publish_revised_timetable(supabase, request_id)
        
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
            slots = affected_slots_response.data or []
            for slot in slots:
                available_faculty_response = (
                    supabase.table("available_faculty_for_slots")
                    .select("*, faculty(faculty_id, faculty_name, email)")
                    .eq("affected_slot_id", slot["affected_slot_id"])
                    .order("priority_score", desc=True)
                    .execute()
                )
                slot["available_faculty"] = available_faculty_response.data or []
            request["affected_slots"] = slots
        
        return {
            "data": requests,
            "message": "Your affected slots retrieved successfully"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch affected slots: {str(e)}"
        )


@router.get("/incoming-requests", response_model=SuccessResponse)
async def get_incoming_slot_adjustment_requests(
    faculty_id: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get incoming slot adjustment requests where current faculty is proposed replacement."""
    try:
        faculty = None
        if faculty_id:
            faculty_response = (
                get_service_supabase()
                .table("faculty")
                .select("faculty_id, faculty_name, email")
                .eq("faculty_id", faculty_id)
                .limit(1)
                .execute()
            )
            rows = faculty_response.data or []
            faculty = rows[0] if rows else None
        if not faculty:
            faculty = _get_faculty_by_email(current_user.email)
        if not faculty:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No faculty profile mapped to this account.",
            )
        supabase = get_service_supabase()
        rows = (
            supabase.table("affected_slots")
            .select(
                "*, "
                "divisions(division_id, division_name), "
                "subjects(subject_id, subject_name), "
                "days(day_id, day_name), "
                "time_slots(slot_id, start_time, end_time), "
                "slot_adjustment_requests(request_id, leave_id, faculty_id), "
                "original_faculty:faculty!affected_slots_original_faculty_id_fkey(faculty_name)"
            )
            .eq("replacement_faculty_id", faculty["faculty_id"])
            .in_("status", ["PENDING"])
            .order("created_at", desc=True)
            .execute()
        )
        return {
            "data": rows.data or [],
            "message": "Incoming slot adjustment requests retrieved successfully",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch incoming requests: {str(e)}",
        )


@router.post("/faculty-decision", response_model=SuccessResponse)
async def decide_slot_adjustment(
    payload: FacultyDecisionPayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Accept or reject a proposed slot adjustment by replacement faculty."""
    try:
        decision = (payload.decision or "").upper().strip()
        if decision not in {"ACCEPT", "REJECT"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="decision must be ACCEPT or REJECT",
            )
        faculty = _get_faculty_by_email(current_user.email)
        if not faculty:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No faculty profile mapped to this account.",
            )
        supabase = get_service_supabase()
        slot_response = (
            supabase.table("affected_slots")
            .select("*, slot_adjustment_requests(request_id)")
            .eq("affected_slot_id", payload.affected_slot_id)
            .single()
            .execute()
        )
        slot = slot_response.data or {}
        if not slot:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Affected slot not found.",
            )
        if str(slot.get("replacement_faculty_id")) != str(faculty.get("faculty_id")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only take action on requests assigned to you.",
            )
        if slot.get("status") not in {"PENDING", "ASSIGNED"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This slot request is no longer pending your decision.",
            )
        if decision == "ACCEPT":
            next_status = "ASSIGNED"
            update_data = {"status": next_status}
            message = "Slot adjustment accepted."
        else:
            next_status = "NO_REPLACEMENT"
            update_data = {"status": next_status, "replacement_faculty_id": None}
            message = "Slot adjustment rejected."
        supabase.table("affected_slots").update(update_data).eq(
            "affected_slot_id", payload.affected_slot_id
        ).execute()

        request_id = (slot.get("slot_adjustment_requests") or {}).get("request_id")
        all_slots = (
            supabase.table("affected_slots")
            .select("status")
            .eq("request_id", request_id)
            .execute()
            .data
            or []
        )
        request_status, resolved_count = _calculate_request_status(all_slots)
        supabase.table("slot_adjustment_requests").update(
            {
                "status": request_status,
                "resolved_slots": resolved_count,
                "completed_at": datetime.utcnow().isoformat() if request_status == "COMPLETED" else None,
            }
        ).eq("request_id", request_id).execute()
        _notify_division_students_for_slot_decision(supabase, slot, decision)

        return {
            "data": {"affected_slot_id": payload.affected_slot_id, "status": next_status},
            "message": message,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process decision: {str(e)}",
        )

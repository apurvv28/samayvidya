"""Faculty leaves management routes with RBAC and slot adjustment workflow."""
from datetime import datetime, date
from typing import List
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, get_current_user_with_profile, CurrentUser, require_role
from app.supabase_client import get_user_supabase, get_service_supabase
from app.schemas.common import SuccessResponse, LeaveStatusEnum
from app.services.email_service import (
    send_leave_approval_email,
    send_leave_rejection_email,
    send_adjustment_request_email,
    send_slot_cancelled_notification,
    send_slot_covered_notification
)

router = APIRouter(prefix="/faculty-leaves", tags=["faculty-leaves"])


class LeaveTypeEnum:
    """Leave type enumeration."""
    FULL_DAY = "FULL_DAY"
    HALF_DAY_FIRST = "HALF_DAY_FIRST"  # First half of the day
    HALF_DAY_SECOND = "HALF_DAY_SECOND"  # Second half of the day


class FacultyLeaveCreate(BaseModel):
    """Create faculty leave request."""

    faculty_id: str
    start_date: str  # ISO format: YYYY-MM-DD
    end_date: str    # ISO format: YYYY-MM-DD
    leave_type: str  # FULL_DAY, HALF_DAY_FIRST, HALF_DAY_SECOND
    reason: str
    proof_image_url: str | None = None  # Will be set after image upload


class FacultyLeaveUpdate(BaseModel):
    """Update faculty leave request (approve/reject by HOD)."""

    status: LeaveStatusEnum
    rejection_reason: str | None = None


class SlotAdjustmentRequest(BaseModel):
    """Request for slot adjustment when faculty is on leave."""
    
    leave_id: str
    entry_ids: List[str]  # List of timetable entry IDs affected


class SlotAdjustmentAccept(BaseModel):
    """Accept a slot adjustment request."""
    
    request_id: str
    faculty_id: str  # Faculty accepting the adjustment


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


def _get_affected_timetable_entries(faculty_id: str, start_date: str, end_date: str, leave_type: str):
    """Get all timetable entries affected by a leave period."""
    from datetime import datetime, timedelta
    
    supabase = get_service_supabase()
    
    # Get the latest timetable version
    version_response = (
        supabase.table("timetable_versions")
        .select("version_id")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    
    if not version_response.data:
        return []
    
    version_id = version_response.data[0]["version_id"]
    
    # Get days mapping from database
    days_response = supabase.table("days").select("day_id, day_name").execute()
    days_map = {day["day_name"].upper(): day["day_id"] for day in (days_response.data or [])}
    
    # Calculate which days of the week are affected
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    
    # Get all dates in the leave period
    affected_day_ids = set()
    current = start
    while current <= end:
        # Get day name (e.g., "MONDAY", "SUNDAY")
        day_name = current.strftime("%A").upper()
        if day_name in days_map:
            affected_day_ids.add(days_map[day_name])
        current += timedelta(days=1)
    
    print(f"Leave period: {start_date} to {end_date}")
    print(f"Affected day_ids: {affected_day_ids}")
    
    # Get all entries for this faculty in the latest version
    entries_response = (
        supabase.table("timetable_entries")
        .select("*, divisions(division_name), subjects(subject_name), days(day_name, day_id), time_slots(start_time, end_time), rooms(room_number)")
        .eq("version_id", version_id)
        .eq("faculty_id", faculty_id)
        .execute()
    )
    
    all_entries = entries_response.data or []
    print(f"Total entries for faculty: {len(all_entries)}")
    
    # Filter entries by affected day_ids
    affected_entries = [
        entry for entry in all_entries
        if entry.get("day_id") in affected_day_ids
    ]
    
    print(f"Filtered entries by day_id: {len(affected_entries)}")
    
    # If half-day leave, further filter by time
    if leave_type == "HALF_DAY_FIRST":
        # First half: slots before 13:00
        affected_entries = [
            entry for entry in affected_entries
            if entry.get("time_slots") and entry["time_slots"].get("end_time", "23:59") <= "13:00"
        ]
    elif leave_type == "HALF_DAY_SECOND":
        # Second half: slots after 13:00
        affected_entries = [
            entry for entry in affected_entries
            if entry.get("time_slots") and entry["time_slots"].get("start_time", "00:00") >= "13:00"
        ]
    
    return affected_entries


def _get_students_for_division(division_id: str):
    """Get all students enrolled in a division."""
    supabase = get_service_supabase()
    
    students_response = (
        supabase.table("user_profiles")
        .select("email, full_name")
        .eq("role", "STUDENT")
        .eq("division", division_id)
        .execute()
    )
    
    return students_response.data or []


def _get_students_for_divisions(division_ids: list[str]) -> list[dict]:
    """Get all students for given division ids (user_profiles first, students table fallback)."""
    if not division_ids:
        return []
    supabase = get_service_supabase()
    profile_rows = (
        supabase.table("user_profiles")
        .select("email, division")
        .eq("role", "STUDENT")
        .in_("division", division_ids)
        .execute()
        .data
        or []
    )
    student_rows = (
        supabase.table("students")
        .select("email, division_id")
        .in_("division_id", division_ids)
        .execute()
        .data
        or []
    )

    merged: dict[str, dict] = {}
    for row in profile_rows:
        email = (row.get("email") or "").strip().lower()
        if email:
            merged[email] = {"email": email, "division": row.get("division")}
    for row in student_rows:
        email = (row.get("email") or "").strip().lower()
        if email and email not in merged:
            merged[email] = {"email": email, "division": row.get("division_id")}
    return list(merged.values())


def _create_bulk_notifications(
    supabase,
    recipients: list[dict],
    *,
    notification_type: str,
    recipient_type: str,
    subject: str,
    body: str,
    related_leave_id: str | None = None,
) -> None:
    """Insert notification_log rows for many recipients, skipping empty emails."""
    rows = []
    for recipient in recipients or []:
        email = (recipient.get("email") or "").strip()
        if not email:
            continue
        rows.append(
            {
                "notification_type": notification_type,
                "recipient_email": email,
                "recipient_type": recipient_type,
                "subject": subject,
                "body": body,
                "related_leave_id": related_leave_id,
                "status": "SENT",
            }
        )
    if rows:
        supabase.table("notification_log").insert(rows).execute()


@router.get("", response_model=SuccessResponse)
async def list_faculty_leaves(
    status: str | None = None,
    current_user: CurrentUser = Depends(require_role("HOD", "COORDINATOR", "ADMIN")),
) -> dict:
    """List all faculty leaves — HOD/COORDINATOR/ADMIN only."""
    try:
        supabase = get_service_supabase()
        query = supabase.table("faculty_leaves").select("*, faculty:faculty_id(faculty_name, email, department_id)")
        
        if status:
            query = query.eq("status", status)
        
        # HOD can only see leaves in their department
        if current_user.role == "HOD" and current_user.department_id:
            # Filter by department through faculty join
            query = query.eq("faculty.department_id", current_user.department_id)
        
        response = query.order("created_at", desc=True).execute()
        return {
            "data": response.data,
            "message": "Faculty leaves retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch faculty leaves: {str(e)}",
        )


@router.get("/my", response_model=SuccessResponse)
async def list_my_leaves(
    faculty_id: str,
    current_user: CurrentUser = Depends(require_role("FACULTY")),
) -> dict:
    """List leaves for a specific faculty member — FACULTY only (own leaves)."""
    try:
        own_faculty = _get_faculty_for_user_email(current_user)
        if not own_faculty:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No faculty profile mapped to this account.",
            )
        if str(own_faculty.get("faculty_id")) != str(faculty_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own leave requests.",
            )

        supabase = get_service_supabase()
        response = (
            supabase.table("faculty_leaves")
            .select("*")
            .eq("faculty_id", faculty_id)
            .order("created_at", desc=True)
            .execute()
        )
        return {
            "data": response.data,
            "message": "My leaves retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch leaves: {str(e)}",
        )


@router.get("/{leave_id}", response_model=SuccessResponse)
async def get_faculty_leave(
    leave_id: str,
    current_user: CurrentUser = Depends(require_role("FACULTY", "HOD")),
) -> dict:
    """Get a specific faculty leave by ID."""
    try:
        supabase = get_service_supabase()
        response = (
            supabase.table("faculty_leaves")
            .select("*")
            .eq("leave_id", leave_id)
            .single()
            .execute()
        )
        return {
            "data": response.data,
            "message": "Faculty leave retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Faculty leave not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_faculty_leave(
    leave: FacultyLeaveCreate,
    current_user: CurrentUser = Depends(require_role("FACULTY")),
) -> dict:
    """Create a new faculty leave request — FACULTY only."""
    try:
        own_faculty = _get_faculty_for_user_email(current_user)
        if not own_faculty:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No faculty profile mapped to this account.",
            )
        if str(own_faculty.get("faculty_id")) != str(leave.faculty_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only submit leave requests for your own faculty profile.",
            )

        # Validate leave type
        valid_leave_types = [LeaveTypeEnum.FULL_DAY, LeaveTypeEnum.HALF_DAY_FIRST, LeaveTypeEnum.HALF_DAY_SECOND]
        if leave.leave_type not in valid_leave_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid leave_type. Must be one of: {', '.join(valid_leave_types)}",
            )

        supabase = get_service_supabase()
        leave_data = leave.model_dump()
        leave_data["status"] = "PENDING"
        
        response = (
            supabase.table("faculty_leaves")
            .insert(leave_data)
            .execute()
        )
        
        # Log notification (email will be sent when HOD approves/rejects)
        if response.data:
            leave_id = response.data[0].get("leave_id")
            supabase.table("notification_log").insert({
                "notification_type": "LEAVE_SUBMITTED",
                "recipient_email": own_faculty.get("email"),
                "recipient_type": "FACULTY",
                "subject": "Leave Request Submitted",
                "body": f"Your leave request from {leave.start_date} to {leave.end_date} has been submitted for approval.",
                "related_leave_id": leave_id,
                "status": "SENT"
            }).execute()
        
        return {
            "data": response.data,
            "message": "Faculty leave request submitted successfully. Awaiting HOD approval.",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create faculty leave: {str(e)}",
        )


@router.put("/{leave_id}", response_model=SuccessResponse)
async def update_faculty_leave(
    leave_id: str,
    leave: FacultyLeaveUpdate,
    current_user: CurrentUser = Depends(require_role("HOD", "COORDINATOR", "ADMIN")),
) -> dict:
    """Approve or reject a faculty leave — HOD/COORDINATOR/ADMIN only."""
    try:
        supabase = get_service_supabase()
        
        # Get the leave request
        leave_response = (
            supabase.table("faculty_leaves")
            .select("*, faculty:faculty_id(faculty_name, email, department_id)")
            .eq("leave_id", leave_id)
            .single()
            .execute()
        )
        
        if not leave_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Leave request not found",
            )
        
        leave_data = leave_response.data
        faculty_info = leave_data.get("faculty", {})
        
        # Check if HOD can approve this leave (must be in same department)
        if current_user.role == "HOD":
            if current_user.department_id != faculty_info.get("department_id"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only approve/reject leaves in your department",
                )
        
        # Update leave status
        update_data = {
            "status": leave.status.value,
            "reviewed_by": current_user.uid,
            "reviewed_at": datetime.utcnow().isoformat(),
        }
        
        if leave.rejection_reason:
            update_data["rejection_reason"] = leave.rejection_reason
        
        response = (
            supabase.table("faculty_leaves")
            .update(update_data)
            .eq("leave_id", leave_id)
            .execute()
        )
        
        # Send email notification
        faculty_email = faculty_info.get("email")
        faculty_name = faculty_info.get("faculty_name")
        
        if leave.status.value == "APPROVED":
            send_leave_approval_email(
                to_email=faculty_email,
                faculty_name=faculty_name,
                start_date=leave_data.get("start_date"),
                end_date=leave_data.get("end_date"),
                leave_type=leave_data.get("leave_type"),
            )
            notification_type = "LEAVE_APPROVED"
            subject = "Leave Request Approved"
            body = f"Your leave request from {leave_data.get('start_date')} to {leave_data.get('end_date')} has been approved."
        else:
            send_leave_rejection_email(
                to_email=faculty_email,
                faculty_name=faculty_name,
                start_date=leave_data.get("start_date"),
                end_date=leave_data.get("end_date"),
                reason=leave.rejection_reason or "No reason provided",
            )
            notification_type = "LEAVE_REJECTED"
            subject = "Leave Request Rejected"
            body = f"Your leave request from {leave_data.get('start_date')} to {leave_data.get('end_date')} has been rejected. Reason: {leave.rejection_reason or 'Not specified'}"
        
        # Log notification
        _create_bulk_notifications(
            supabase,
            [{"email": faculty_email}],
            notification_type=notification_type,
            recipient_type="FACULTY",
            subject=subject,
            body=body,
            related_leave_id=leave_id,
        )
        
        # If approved, notify coordinators about potential slot adjustments
        notified_students_count = 0
        if leave.status.value == "APPROVED":
            try:
                dept_id = faculty_info.get("department_id")
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
                                    "notification_type": "LEAVE_APPROVED",
                                    "recipient_email": coordinator["email"],
                                    "recipient_type": "COORDINATOR",
                                    "subject": "Faculty Leave Approved - Action Required",
                                    "body": f"{faculty_name}'s leave from {leave_data.get('start_date')} to {leave_data.get('end_date')} has been approved. Please review slot adjustments.",
                                    "status": "SENT"
                                }).execute()
                            except Exception as e:
                                print(f"Failed to send coordinator notification: {e}")

                    # Notify all faculty in department
                    faculty_users = (
                        supabase.table("user_profiles")
                        .select("email")
                        .eq("department_id", dept_id)
                        .eq("role", "FACULTY")
                        .execute()
                        .data
                        or []
                    )
                    _create_bulk_notifications(
                        supabase,
                        faculty_users,
                        notification_type="FACULTY_LEAVE_APPROVED_BROADCAST",
                        recipient_type="FACULTY",
                        subject="Faculty Leave Approved",
                        body=(
                            f"{faculty_name}'s leave from {leave_data.get('start_date')} "
                            f"to {leave_data.get('end_date')} has been approved by HOD."
                        ),
                        related_leave_id=leave_id,
                    )
            except Exception as e:
                print(f"Failed to notify coordinators: {e}")

            # Student notifications must not depend on department_id being present.
            try:
                affected_entries = _get_affected_timetable_entries(
                    faculty_id=leave_data.get("faculty_id"),
                    start_date=leave_data.get("start_date"),
                    end_date=leave_data.get("end_date"),
                    leave_type=leave_data.get("leave_type"),
                )
                affected_division_ids = sorted(
                    {
                        str(entry.get("division_id"))
                        for entry in affected_entries
                        if entry.get("division_id")
                    }
                )
                # Fallback: if date-range filter yields no entries, notify divisions
                # where the faculty is assigned in the current timetable.
                if not affected_division_ids:
                    fallback_entries = (
                        supabase.table("timetable_entries")
                        .select("division_id")
                        .eq("faculty_id", leave_data.get("faculty_id"))
                        .execute()
                        .data
                        or []
                    )
                    affected_division_ids = sorted(
                        {
                            str(entry.get("division_id"))
                            for entry in fallback_entries
                            if entry.get("division_id")
                        }
                    )

                student_users = _get_students_for_divisions(affected_division_ids)
                notified_students_count = len([u for u in student_users if (u.get("email") or "").strip()])
                _create_bulk_notifications(
                    supabase,
                    student_users,
                    notification_type="FACULTY_LEAVE_APPROVED_BROADCAST",
                    recipient_type="STUDENT",
                    subject="Faculty Leave Update",
                    body=(
                        f"{faculty_name} is on approved leave from {leave_data.get('start_date')} "
                        f"to {leave_data.get('end_date')}. Please check any class updates."
                    ),
                    related_leave_id=leave_id,
                )
            except Exception as e:
                print(f"Failed to notify students for approved leave {leave_id}: {e}")
        
        return {
            "data": response.data,
            "message": (
                f"Faculty leave {leave.status.value.lower()} successfully. "
                f"Email notification sent. Student notifications: {notified_students_count}."
            ),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update faculty leave: {str(e)}",
        )


@router.delete("/{leave_id}", response_model=SuccessResponse)
async def delete_faculty_leave(
    leave_id: str,
    current_user: CurrentUser = Depends(require_role("HOD", "COORDINATOR", "ADMIN")),
) -> dict:
    """Delete a faculty leave — HOD/COORDINATOR/ADMIN only."""
    try:
        supabase = get_service_supabase()
        response = (
            supabase.table("faculty_leaves")
            .delete()
            .eq("leave_id", leave_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Faculty leave deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete faculty leave: {str(e)}",
        )


@router.post("/upload-proof", response_model=SuccessResponse)
async def upload_leave_proof(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_role("FACULTY")),
) -> dict:
    """Upload leave proof image to Supabase Storage."""
    try:
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only image files are allowed",
            )
        
        # Get faculty info
        own_faculty = _get_faculty_for_user_email(current_user)
        if not own_faculty:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No faculty profile mapped to this account.",
            )
        
        faculty_id = own_faculty.get("faculty_id")
        
        # Read file content
        file_content = await file.read()
        
        # Generate unique filename
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file_extension = file.filename.split(".")[-1] if file.filename else "jpg"
        file_path = f"{faculty_id}/{timestamp}.{file_extension}"
        
        # Upload to Supabase Storage
        supabase = get_service_supabase()
        storage_response = supabase.storage.from_("leave-proofs").upload(
            file_path,
            file_content,
            {"content-type": file.content_type}
        )
        
        # Get public URL
        public_url = supabase.storage.from_("leave-proofs").get_public_url(file_path)
        
        return {
            "data": {
                "file_path": file_path,
                "public_url": public_url,
            },
            "message": "Leave proof uploaded successfully",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to upload leave proof: {str(e)}",
        )


@router.get("/{leave_id}/affected-slots", response_model=SuccessResponse)
async def get_affected_slots(
    leave_id: str,
    current_user: CurrentUser = Depends(require_role("FACULTY", "HOD", "COORDINATOR", "ADMIN")),
) -> dict:
    """Get all timetable slots affected by a leave request."""
    try:
        supabase = get_service_supabase()
        
        # Get leave details
        leave_response = (
            supabase.table("faculty_leaves")
            .select("*")
            .eq("leave_id", leave_id)
            .single()
            .execute()
        )
        
        if not leave_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Leave request not found",
            )
        
        leave_data = leave_response.data
        faculty_id = leave_data.get("faculty_id")
        start_date = leave_data.get("start_date")
        end_date = leave_data.get("end_date")
        leave_type = leave_data.get("leave_type")
        
        # Get affected timetable entries
        affected_entries = _get_affected_timetable_entries(
            faculty_id, start_date, end_date, leave_type
        )
        
        return {
            "data": {
                "leave": leave_data,
                "affected_entries": affected_entries,
                "total_slots": len(affected_entries),
            },
            "message": "Affected slots retrieved successfully",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch affected slots: {str(e)}",
        )


@router.post("/request-adjustment", response_model=SuccessResponse)
async def request_slot_adjustment(
    request: SlotAdjustmentRequest,
    current_user: CurrentUser = Depends(require_role("FACULTY")),
) -> dict:
    """Request slot adjustment for approved leave."""
    try:
        supabase = get_service_supabase()
        
        # Verify leave is approved
        leave_response = (
            supabase.table("faculty_leaves")
            .select("*, faculty:faculty_id(faculty_name, email)")
            .eq("leave_id", request.leave_id)
            .single()
            .execute()
        )
        
        if not leave_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Leave request not found",
            )
        
        leave_data = leave_response.data
        
        if leave_data.get("status") != "APPROVED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Can only request adjustment for approved leaves",
            )
        
        # Verify faculty owns this leave
        own_faculty = _get_faculty_for_user_email(current_user)
        if not own_faculty or str(own_faculty.get("faculty_id")) != str(leave_data.get("faculty_id")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only request adjustments for your own leaves",
            )
        
        # Create adjustment requests for each affected entry
        adjustment_requests = []
        faculty_emails_to_notify = set()
        
        for entry_id in request.entry_ids:
            # Get entry details
            entry_response = (
                supabase.table("timetable_entries")
                .select("*, divisions(division_id, division_name)")
                .eq("entry_id", entry_id)
                .single()
                .execute()
            )
            
            if not entry_response.data:
                continue
            
            entry = entry_response.data
            division_id = entry.get("division_id")
            
            # Create adjustment request
            adjustment_data = {
                "leave_id": request.leave_id,
                "original_faculty_id": leave_data.get("faculty_id"),
                "entry_id": entry_id,
                "division_id": division_id,
                "subject_id": entry.get("subject_id"),
                "day_id": entry.get("day_id"),
                "slot_id": entry.get("slot_id"),
                "session_type": entry.get("session_type"),
                "adjustment_date": leave_data.get("start_date"),  # Simplified: using start_date
                "status": "PENDING",
            }
            
            adj_response = (
                supabase.table("slot_adjustment_requests")
                .insert(adjustment_data)
                .execute()
            )
            
            if adj_response.data:
                adjustment_requests.append(adj_response.data[0])
            
            # Get faculty teaching same division
            faculty_response = supabase.rpc(
                "get_faculty_teaching_division",
                {"p_division_id": division_id, "p_exclude_faculty_id": leave_data.get("faculty_id")}
            ).execute()
            
            for fac in (faculty_response.data or []):
                if fac.get("email"):
                    faculty_emails_to_notify.add(fac.get("email"))
        
        # Send emails to all eligible faculty
        faculty_name = leave_data.get("faculty", {}).get("faculty_name")
        for email in faculty_emails_to_notify:
            send_adjustment_request_email(
                to_email=email,
                requesting_faculty_name=faculty_name,
                start_date=leave_data.get("start_date"),
                end_date=leave_data.get("end_date"),
                affected_slots=len(adjustment_requests),
            )
        
        return {
            "data": {
                "adjustment_requests": adjustment_requests,
                "notified_faculty_count": len(faculty_emails_to_notify),
            },
            "message": f"Adjustment requests created. {len(faculty_emails_to_notify)} faculty members notified.",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to request slot adjustment: {str(e)}",
        )


@router.post("/accept-adjustment", response_model=SuccessResponse)
async def accept_slot_adjustment(
    accept: SlotAdjustmentAccept,
    current_user: CurrentUser = Depends(require_role("FACULTY")),
) -> dict:
    """Accept a slot adjustment request."""
    try:
        supabase = get_service_supabase()
        
        # Verify faculty
        own_faculty = _get_faculty_for_user_email(current_user)
        if not own_faculty or str(own_faculty.get("faculty_id")) != str(accept.faculty_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only accept adjustments for your own faculty profile",
            )
        
        # Get adjustment request
        adj_response = (
            supabase.table("slot_adjustment_requests")
            .select("*")
            .eq("request_id", accept.request_id)
            .single()
            .execute()
        )
        
        if not adj_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Adjustment request not found",
            )
        
        adj_data = adj_response.data
        
        if adj_data.get("status") != "PENDING":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This adjustment request has already been processed",
            )
        
        # Check faculty availability
        is_available = supabase.rpc(
            "is_faculty_available_for_slot",
            {
                "p_faculty_id": accept.faculty_id,
                "p_day_id": adj_data.get("day_id"),
                "p_slot_id": adj_data.get("slot_id"),
                "p_date": adj_data.get("adjustment_date"),
            }
        ).execute()
        
        if not is_available.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You are not available for this slot",
            )
        
        # Update adjustment request
        update_response = (
            supabase.table("slot_adjustment_requests")
            .update({
                "status": "ACCEPTED",
                "accepted_by_faculty_id": accept.faculty_id,
                "accepted_at": datetime.utcnow().isoformat(),
            })
            .eq("request_id", accept.request_id)
            .execute()
        )
        
        # Create temporary override
        override_data = {
            "adjustment_request_id": accept.request_id,
            "original_entry_id": adj_data.get("entry_id"),
            "override_date": adj_data.get("adjustment_date"),
            "new_faculty_id": accept.faculty_id,
            "is_cancelled": False,
        }
        
        supabase.table("timetable_temporary_overrides").insert(override_data).execute()
        
        # Notify students
        students = _get_students_for_division(adj_data.get("division_id"))
        for student in students:
            send_slot_covered_notification(
                to_email=student.get("email"),
                student_name=student.get("full_name"),
                original_faculty=adj_data.get("original_faculty_id"),  # Should fetch name
                covering_faculty=own_faculty.get("faculty_name"),
                date=adj_data.get("adjustment_date"),
            )
        
        return {
            "data": update_response.data,
            "message": f"Slot adjustment accepted. {len(students)} students notified.",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to accept slot adjustment: {str(e)}",
        )

"""Timetable versions management routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
import json
from app.config import settings
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase, get_service_supabase
from app.schemas.common import SuccessResponse
from app.services.timetable_conflict_audit import audit_timetable_conflicts, fetch_timetable_entries_for_version

router = APIRouter(prefix="/timetable-versions", tags=["timetable-versions"])
_META_MARKER = "__TT_META__:"
_META_KEYS = {"version_name", "academic_year", "semester", "wef_date", "to_date"}


def _is_anonymous_mode_user(current_user: CurrentUser) -> bool:
    return settings.allow_anonymous_api and current_user.aud == "anonymous"


def _split_reason_and_meta(reason: str | None) -> tuple[str | None, dict]:
    if not reason:
        return reason, {}
    text = str(reason)
    idx = text.find(_META_MARKER)
    if idx < 0:
        return text, {}
    base = text[:idx].rstrip() or None
    raw_meta = text[idx + len(_META_MARKER):].strip()
    if not raw_meta:
        return base, {}
    try:
        parsed = json.loads(raw_meta)
        if isinstance(parsed, dict):
            return base, parsed
    except Exception:
        return text, {}
    return base, {}


def _compose_reason_with_meta(base_reason: str | None, meta: dict) -> str | None:
    cleaned_meta = {key: meta.get(key) for key in _META_KEYS if meta.get(key) not in (None, "")}
    if not cleaned_meta:
        return base_reason
    payload = json.dumps(cleaned_meta, separators=(",", ":"))
    if base_reason:
        return f"{base_reason}\n{_META_MARKER}{payload}"
    return f"{_META_MARKER}{payload}"


def _parse_ui_run_context(full_reason: str | None) -> dict[str, Any]:
    """Map AgentOrchestrator `reason` payload: `UI run context: {...}` into timetable meta fields."""
    if not full_reason:
        return {}
    text = str(full_reason).strip()
    marker = "UI run context:"
    pos = text.casefold().find(marker.casefold())
    if pos < 0:
        return {}
    tail = text[pos + len(marker) :].strip()
    if tail.startswith(":"):
        tail = tail[1:].strip()
    # After metadata save, reason can be `UI run context: {...}\n__TT_META__{...}` — parse only the UI JSON.
    if _META_MARKER in tail:
        tail = tail.split(_META_MARKER, 1)[0].strip()
    try:
        data = json.loads(tail)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, Any] = {
        "academic_year": data.get("academic_year"),
        "semester": data.get("semester"),
        "wef_date": data.get("effective_from"),
        "to_date": data.get("effective_to"),
        "version_name": data.get("program"),
    }
    sel = data.get("selected_divisions")
    if isinstance(sel, list):
        out["selected_divisions"] = [str(x) for x in sel if x is not None and str(x).strip()]
    return out


def _hydrate_version_row(row: dict) -> dict:
    if not row:
        return row
    full_reason = str(row.get("reason") or "")
    base_reason, meta = _split_reason_and_meta(row.get("reason"))
    hydrated = dict(row)
    hydrated["reason"] = base_reason
    ui_ctx = _parse_ui_run_context(full_reason)

    # Prefer embedded __TT_META__ JSON, then DB columns, then UI run context from agent orchestration.
    for key in _META_KEYS:
        value = meta.get(key)
        if value in (None, ""):
            value = row.get(key)
        if value in (None, ""):
            value = ui_ctx.get(key)
        hydrated[key] = value

    divs = ui_ctx.get("selected_divisions")
    if isinstance(divs, list) and divs:
        hydrated["selected_divisions"] = divs
    elif isinstance(meta.get("selected_divisions"), list) and meta.get("selected_divisions"):
        hydrated["selected_divisions"] = [str(x) for x in meta["selected_divisions"] if x is not None]
    elif isinstance(row.get("selected_divisions"), list):
        hydrated["selected_divisions"] = row.get("selected_divisions")
    return hydrated


class TimetableVersionCreate(BaseModel):
    """Create timetable version request."""

    created_by: str
    reason: str | None = None
    is_active: bool = True
    version_name: str | None = None
    academic_year: str | None = None
    semester: str | None = None
    wef_date: str | None = None
    to_date: str | None = None


class TimetableVersionUpdate(BaseModel):
    """Update timetable version request."""

    created_by: str | None = None
    reason: str | None = None
    is_active: bool | None = None
    version_name: str | None = None
    academic_year: str | None = None
    semester: str | None = None
    wef_date: str | None = None
    to_date: str | None = None


@router.get("", response_model=SuccessResponse)
async def list_timetable_versions(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all timetable versions (RLS enforced)."""
    try:
        supabase = get_service_supabase() if _is_anonymous_mode_user(current_user) else get_user_supabase()
        response = supabase.table("timetable_versions").select("*").order("created_at", desc=True).execute()
        rows = [_hydrate_version_row(row) for row in (response.data or [])]
        return {
            "data": rows,
            "message": "Timetable versions retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch timetable versions: {str(e)}",
        )


@router.get("/{version_id}/conflict-audit", response_model=SuccessResponse)
async def audit_timetable_version_conflicts(
    version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Slot-level and merged-interval room/faculty overlap check for a saved timetable version."""
    try:
        supabase = get_service_supabase() if _is_anonymous_mode_user(current_user) else get_user_supabase()
        entries = fetch_timetable_entries_for_version(supabase, version_id)
        slot_rows = supabase.table("time_slots").select("*").order("slot_order").execute().data or []
        days_by_id = {str(d["day_id"]): d for d in (supabase.table("days").select("*").execute().data or [])}
        rooms_by_id = {str(r["room_id"]): r for r in (supabase.table("rooms").select("*").execute().data or [])}
        faculty_by_id = {str(f["faculty_id"]): f for f in (supabase.table("faculty").select("*").execute().data or [])}
        divisions_by_id = {str(d["division_id"]): d for d in (supabase.table("divisions").select("*").execute().data or [])}
        subjects_by_id = {str(s["subject_id"]): s for s in (supabase.table("subjects").select("*").execute().data or [])}
        batch_code_by_id = {
            str(b["batch_id"]): str(b.get("batch_code") or "")
            for b in (supabase.table("batches").select("*").execute().data or [])
            if b.get("batch_id")
        }
        report = audit_timetable_conflicts(
            entries=entries,
            slot_rows=slot_rows,
            days_by_id=days_by_id,
            rooms_by_id=rooms_by_id,
            faculty_by_id=faculty_by_id,
            divisions_by_id=divisions_by_id,
            subjects_by_id=subjects_by_id,
            batch_code_by_id=batch_code_by_id,
        )
        return {
            "data": {"version_id": version_id, **report},
            "message": "Timetable conflict audit completed.",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to audit timetable version: {str(e)}",
        )


@router.get("/{version_id}", response_model=SuccessResponse)
async def get_timetable_version(
    version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get a specific timetable version by ID."""
    try:
        supabase = get_service_supabase() if _is_anonymous_mode_user(current_user) else get_user_supabase()
        response = (
            supabase.table("timetable_versions")
            .select("*")
            .eq("version_id", version_id)
            .single()
            .execute()
        )
        return {
            "data": _hydrate_version_row(response.data),
            "message": "Timetable version retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Timetable version not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_timetable_version(
    version: TimetableVersionCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new timetable version."""
    try:
        supabase = get_service_supabase() if _is_anonymous_mode_user(current_user) else get_user_supabase()
        create_data = version.model_dump()
        incoming_meta = {key: create_data.pop(key) for key in _META_KEYS if key in create_data}
        create_data["reason"] = _compose_reason_with_meta(create_data.get("reason"), incoming_meta)
        response = (
            supabase.table("timetable_versions")
            .insert(create_data)
            .execute()
        )
        rows = [_hydrate_version_row(row) for row in (response.data or [])]
        return {
            "data": rows,
            "message": "Timetable version created successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create timetable version: {str(e)}",
        )


@router.put("/{version_id}", response_model=SuccessResponse)
async def update_timetable_version(
    version_id: str,
    version: TimetableVersionUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Update a timetable version."""
    try:
        supabase = get_service_supabase() if _is_anonymous_mode_user(current_user) else get_user_supabase()
        update_data = version.model_dump(exclude_unset=True)
        
        # Since wef_date and to_date are actual columns in the database,
        # we should NOT treat them as metadata to be embedded in reason field
        # Just update them directly
        response = (
            supabase.table("timetable_versions")
            .update(update_data)
            .eq("version_id", version_id)
            .execute()
        )
        rows = [_hydrate_version_row(row) for row in (response.data or [])]
        return {
            "data": rows,
            "message": "Timetable version updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update timetable version: {str(e)}",
        )


@router.delete("/{version_id}", response_model=SuccessResponse)
async def delete_timetable_version(
    version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete a timetable version."""
    try:
        supabase = get_service_supabase() if _is_anonymous_mode_user(current_user) else get_user_supabase()
        response = (
            supabase.table("timetable_versions")
            .delete()
            .eq("version_id", version_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Timetable version deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete timetable version: {str(e)}",
        )


class ApprovalAction(BaseModel):
    """Approval action request."""
    rejection_reason: str | None = None


@router.post("/{version_id}/verify", response_model=SuccessResponse)
async def verify_timetable_version(
    version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Coordinator verifies timetable and forwards to HOD."""
    try:
        supabase = get_service_supabase()
        
        # Check if user is coordinator
        if current_user.role not in ["COORDINATOR", "ADMIN"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only coordinators can verify timetables"
            )
        
        # Update timetable version
        from datetime import datetime
        response = (
            supabase.table("timetable_versions")
            .update({
                "approval_status": "COORDINATOR_VERIFIED",
                "verified_by": current_user.uid,
                "verified_at": datetime.utcnow().isoformat()
            })
            .eq("version_id", version_id)
            .execute()
        )
        
        # Send notification to HOD
        # Get department HOD
        version_data = response.data[0] if response.data else {}
        dept_id = version_data.get("department_id")
        
        if dept_id:
            hod_response = (
                supabase.table("user_profiles")
                .select("email")
                .eq("department_id", dept_id)
                .eq("role", "HOD")
                .execute()
            )
            
            if hod_response.data:
                for hod in hod_response.data:
                    try:
                        supabase.table("notification_log").insert({
                            "notification_type": "TIMETABLE_VERIFICATION",
                            "recipient_email": hod["email"],
                            "recipient_type": "HOD",
                            "subject": "Timetable Ready for Approval",
                            "body": f"A timetable version has been verified by coordinator and is ready for your approval.",
                            "status": "SENT"
                        }).execute()
                    except Exception as e:
                        print(f"Failed to send notification: {e}")
        
        return {
            "data": _hydrate_version_row(response.data[0] if response.data else {}),
            "message": "Timetable verified and forwarded to HOD"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify timetable: {str(e)}"
        )


@router.post("/{version_id}/approve", response_model=SuccessResponse)
async def approve_timetable_version(
    version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """HOD approves and freezes timetable for the specified period."""
    try:
        supabase = get_service_supabase()
        
        # Check if user is HOD
        if current_user.role not in ["HOD", "ADMIN"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HOD can approve timetables"
            )
        
        # Get timetable to check if it has valid dates
        version_response = (
            supabase.table("timetable_versions")
            .select("*")
            .eq("version_id", version_id)
            .single()
            .execute()
        )
        
        if not version_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Timetable version not found"
            )
        
        # Check direct columns for dates (they exist in the database schema)
        version_data = version_response.data
        wef_date = version_data.get("wef_date")
        to_date = version_data.get("to_date")
        
        # Validate that dates are set
        if not wef_date or not to_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Timetable must have 'W.E.F' and 'To Date' set before approval. Please set these dates in the metadata section and click 'Save Metadata'."
            )
        
        # Update timetable version - approve and freeze
        from datetime import datetime
        response = (
            supabase.table("timetable_versions")
            .update({
                "approval_status": "HOD_APPROVED",
                "approved_by": current_user.uid,
                "approved_at": datetime.utcnow().isoformat(),
                "is_active": True,
                "is_frozen": True,
                "frozen_at": datetime.utcnow().isoformat()
            })
            .eq("version_id", version_id)
            .execute()
        )
        
        # Deactivate other versions in the same department
        dept_id = version_data.get("department_id")
        
        if dept_id:
            supabase.table("timetable_versions").update({
                "is_active": False
            }).eq("department_id", dept_id).neq("version_id", version_id).execute()
        
        # Send notification to coordinator about approval
        try:
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
                            "notification_type": "TIMETABLE_APPROVED",
                            "recipient_email": coordinator["email"],
                            "recipient_type": "COORDINATOR",
                            "subject": "Timetable Approved and Frozen",
                            "body": f"The timetable has been approved by HOD and is now frozen for the period {wef_date} to {to_date}.",
                            "status": "SENT"
                        }).execute()
                    except Exception as e:
                        print(f"Failed to send coordinator notification: {e}")
        except Exception as e:
            print(f"Failed to notify coordinators: {e}")
        
        return {
            "data": _hydrate_version_row(response.data[0] if response.data else {}),
            "message": f"Timetable approved and frozen for period {wef_date} to {to_date}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve timetable: {str(e)}"
        )


@router.post("/{version_id}/reject", response_model=SuccessResponse)
async def reject_timetable_version(
    version_id: str,
    action: ApprovalAction,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Coordinator or HOD rejects timetable."""
    try:
        supabase = get_service_supabase()
        
        # Check if user is coordinator or HOD
        if current_user.role not in ["COORDINATOR", "HOD", "ADMIN"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only coordinators and HOD can reject timetables"
            )
        
        # Update timetable version
        response = (
            supabase.table("timetable_versions")
            .update({
                "approval_status": "REJECTED",
                "rejection_reason": action.rejection_reason,
                "is_active": False
            })
            .eq("version_id", version_id)
            .execute()
        )
        
        return {
            "data": _hydrate_version_row(response.data[0] if response.data else {}),
            "message": "Timetable rejected"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reject timetable: {str(e)}"
        )


class ExtendTimetableRequest(BaseModel):
    """Request to extend timetable validity period."""
    new_to_date: str  # ISO format: YYYY-MM-DD


@router.post("/{version_id}/extend", response_model=SuccessResponse)
async def extend_timetable_validity(
    version_id: str,
    request: ExtendTimetableRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Coordinator extends timetable validity period."""
    try:
        supabase = get_service_supabase()
        
        # Check if user is coordinator
        if current_user.role not in ["COORDINATOR", "ADMIN"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only coordinators can extend timetables"
            )
        
        # Get current timetable
        version_response = (
            supabase.table("timetable_versions")
            .select("*")
            .eq("version_id", version_id)
            .single()
            .execute()
        )
        
        if not version_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Timetable version not found"
            )
        
        version_data = version_response.data
        
        # Validate that timetable is approved and frozen
        if version_data.get("approval_status") != "HOD_APPROVED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only approved timetables can be extended"
            )
        
        # Validate new date is after current to_date
        from datetime import datetime
        current_to_date = version_data.get("to_date")
        if current_to_date:
            current_date = datetime.fromisoformat(str(current_to_date))
            new_date = datetime.fromisoformat(request.new_to_date)
            if new_date <= current_date:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="New end date must be after current end date"
                )
        
        # Update timetable with new end date
        response = (
            supabase.table("timetable_versions")
            .update({
                "to_date": request.new_to_date,
                "extension_requested": True,
                "expiry_notified_at": None,  # Reset notification
                "auto_delete_at": None  # Cancel auto-deletion
            })
            .eq("version_id", version_id)
            .execute()
        )
        
        # Notify HOD about extension
        dept_id = version_data.get("department_id")
        if dept_id:
            try:
                hod_response = (
                    supabase.table("user_profiles")
                    .select("email")
                    .eq("department_id", dept_id)
                    .eq("role", "HOD")
                    .execute()
                )
                
                for hod in (hod_response.data or []):
                    if hod.get("email"):
                        try:
                            supabase.table("notification_log").insert({
                                "notification_type": "TIMETABLE_EXTENDED",
                                "recipient_email": hod["email"],
                                "recipient_type": "HOD",
                                "subject": "Timetable Validity Extended",
                                "body": f"Coordinator has extended the timetable validity to {request.new_to_date}.",
                                "status": "SENT"
                            }).execute()
                        except Exception as e:
                            print(f"Failed to send HOD notification: {e}")
            except Exception as e:
                print(f"Failed to notify HOD: {e}")
        
        return {
            "data": _hydrate_version_row(response.data[0] if response.data else {}),
            "message": f"Timetable validity extended to {request.new_to_date}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to extend timetable: {str(e)}"
        )


@router.get("/expiring/check", response_model=SuccessResponse)
async def check_expiring_timetables(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Check for timetables that are expiring soon or need deletion."""
    try:
        supabase = get_service_supabase()
        
        # Call the database function
        response = supabase.rpc("check_expiring_timetables").execute()
        
        expiring = response.data or []
        
        # Process notifications and deletions
        for item in expiring:
            version_id = item.get("version_id")
            should_notify = item.get("should_notify")
            should_delete = item.get("should_delete")
            
            if should_notify:
                # Send notification to coordinator
                dept_id = item.get("department_id")
                if dept_id:
                    try:
                        coordinators = (
                            supabase.table("user_profiles")
                            .select("email")
                            .eq("department_id", dept_id)
                            .eq("role", "COORDINATOR")
                            .execute()
                        )
                        
                        for coordinator in (coordinators.data or []):
                            if coordinator.get("email"):
                                supabase.table("notification_log").insert({
                                    "notification_type": "TIMETABLE_EXPIRING",
                                    "recipient_email": coordinator["email"],
                                    "recipient_type": "COORDINATOR",
                                    "subject": "Timetable Expiring Soon",
                                    "body": f"A timetable will expire on {item.get('to_date')}. Please extend it if needed, or it will be auto-deleted 7 days after expiry.",
                                    "status": "SENT"
                                }).execute()
                        
                        # Mark as notified
                        from datetime import datetime
                        supabase.table("timetable_versions").update({
                            "expiry_notified_at": datetime.utcnow().isoformat()
                        }).eq("version_id", version_id).execute()
                    except Exception as e:
                        print(f"Failed to notify about expiring timetable: {e}")
            
            if should_delete:
                # Auto-delete expired timetable
                try:
                    supabase.table("timetable_versions").delete().eq("version_id", version_id).execute()
                    print(f"Auto-deleted expired timetable: {version_id}")
                except Exception as e:
                    print(f"Failed to auto-delete timetable: {e}")
        
        return {
            "data": {
                "expiring_count": len([x for x in expiring if x.get("should_notify")]),
                "deleted_count": len([x for x in expiring if x.get("should_delete")]),
                "details": expiring
            },
            "message": "Expiry check completed"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check expiring timetables: {str(e)}"
        )

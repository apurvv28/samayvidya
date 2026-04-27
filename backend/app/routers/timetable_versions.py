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
        incoming_meta = {key: update_data.pop(key) for key in _META_KEYS if key in update_data}

        if incoming_meta:
            current = (
                supabase.table("timetable_versions")
                .select("reason")
                .eq("version_id", version_id)
                .single()
                .execute()
                .data
                or {}
            )
            current_reason = current.get("reason")
            base_reason, existing_meta = _split_reason_and_meta(current_reason)

            merged_meta = dict(existing_meta)
            for key, value in incoming_meta.items():
                merged_meta[key] = value

            reason_source = update_data.get("reason", base_reason)
            update_data["reason"] = _compose_reason_with_meta(reason_source, merged_meta)

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

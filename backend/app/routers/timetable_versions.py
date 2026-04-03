"""Timetable versions management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
import json
from app.config import settings
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase, get_service_supabase
from app.schemas.common import SuccessResponse

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


def _hydrate_version_row(row: dict) -> dict:
    if not row:
        return row
    base_reason, meta = _split_reason_and_meta(row.get("reason"))
    hydrated = dict(row)
    hydrated["reason"] = base_reason
    for key in _META_KEYS:
        hydrated[key] = meta.get(key)
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

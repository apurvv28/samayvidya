"""Timetable entries management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.config import settings
from app.dependencies.auth import (
    get_current_user_with_profile,
    CurrentUser,
    canonical_department_id,
)
from app.supabase_client import get_user_supabase, get_service_supabase
from app.schemas.common import SuccessResponse, SubjectTypeEnum

router = APIRouter(prefix="/timetable-entries", tags=["timetable-entries"])


def _is_anonymous_mode_user(current_user: CurrentUser) -> bool:
    return settings.allow_anonymous_api and current_user.aud == "anonymous"


def _slot_conflicts_for_entry(
    supabase,
    *,
    version_id: str,
    day_id: int,
    slot_id: str,
    faculty_id: str,
    room_id: str,
    exclude_entry_id: str | None = None,
) -> tuple[list[dict], list[dict]]:
    rows = (
        supabase.table("timetable_entries")
        .select("entry_id, division_id, faculty_id, room_id, subject_id, batch_id, session_type")
        .eq("version_id", version_id)
        .eq("day_id", day_id)
        .eq("slot_id", slot_id)
        .execute()
        .data
        or []
    )

    if exclude_entry_id:
        rows = [row for row in rows if str(row.get("entry_id")) != str(exclude_entry_id)]

    faculty_conflicts = [row for row in rows if str(row.get("faculty_id")) == str(faculty_id)]
    room_conflicts = [row for row in rows if str(row.get("room_id")) == str(room_id)]
    return faculty_conflicts, room_conflicts


class TimetableEntryCreate(BaseModel):
    """Create timetable entry request."""

    version_id: str
    division_id: str
    subject_id: str
    faculty_id: str
    room_id: str
    day_id: int
    slot_id: str
    batch_id: str | None = None
    session_type: SubjectTypeEnum = SubjectTypeEnum.THEORY


class TimetableEntryUpdate(BaseModel):
    """Update timetable entry request."""

    version_id: str | None = None
    division_id: str | None = None
    subject_id: str | None = None
    faculty_id: str | None = None
    room_id: str | None = None
    day_id: int | None = None
    slot_id: str | None = None
    batch_id: str | None = None
    session_type: SubjectTypeEnum | None = None


@router.get("", response_model=SuccessResponse)
async def list_timetable_entries(
    version_id: str | None = None,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """List all timetable entries with department filtering enforced."""
    try:
        supabase = get_service_supabase() if _is_anonymous_mode_user(current_user) else get_service_supabase()
        
        # Join with related tables to get names instead of just IDs
        query = supabase.table("timetable_entries").select(
            "*,"
            "subjects(subject_id, subject_name, subject_type, sub_short_form),"
            "faculty(faculty_id, faculty_name, faculty_code),"
            "divisions(division_id, division_name, year),"
            "rooms(room_id, room_number, room_type),"
            "days(day_id, day_name),"
            "time_slots(slot_id, start_time, end_time, slot_order),"
            "batches(batch_id, batch_code),"
            "timetable_versions(version_id, department_id)"
        )
        
        if version_id:
            query = query.eq("version_id", version_id)
        
        response = query.execute()

        if current_user.role != "ADMIN":
            user_d = canonical_department_id(current_user.department_id)
            if not user_d:
                response.data = []
            else:
                filtered_data = [
                    entry
                    for entry in (response.data or [])
                    if canonical_department_id(
                        (entry.get("timetable_versions") or {}).get("department_id")
                    )
                    == user_d
                ]
                response.data = filtered_data
        
        return {
            "data": response.data,
            "message": "Timetable entries retrieved successfully",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch timetable entries: {str(e)}",
        )


@router.get("/{entry_id}", response_model=SuccessResponse)
async def get_timetable_entry(
    entry_id: str,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Get a specific timetable entry by ID with related data."""
    try:
        supabase = get_service_supabase()

        # Join with related tables to get names
        response = (
            supabase.table("timetable_entries")
            .select(
                "*,"
                "subjects(subject_id, subject_name, subject_type, sub_short_form),"
                "faculty(faculty_id, faculty_name, faculty_code),"
                "divisions(division_id, division_name, year),"
                "rooms(room_id, room_number, room_type),"
                "days(day_id, day_name),"
                "time_slots(slot_id, start_time, end_time, slot_order),"
                "batches(batch_id, batch_code),"
                "timetable_versions(version_id, department_id)"
            )
            .eq("entry_id", entry_id)
            .single()
            .execute()
        )
        row = response.data
        if current_user.role != "ADMIN":
            user_d = canonical_department_id(current_user.department_id)
            entry_dept = canonical_department_id(
                (row.get("timetable_versions") or {}).get("department_id")
            )
            if not user_d or entry_dept != user_d:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Timetable entry not found",
                )
        return {
            "data": row,
            "message": "Timetable entry retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Timetable entry not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_timetable_entry(
    entry: TimetableEntryCreate,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Create a new timetable entry."""
    try:
        supabase = get_user_supabase()
        faculty_conflicts, room_conflicts = _slot_conflicts_for_entry(
            supabase,
            version_id=entry.version_id,
            day_id=entry.day_id,
            slot_id=entry.slot_id,
            faculty_id=entry.faculty_id,
            room_id=entry.room_id,
        )
        if faculty_conflicts or room_conflicts:
            conflict_parts: list[str] = []
            if faculty_conflicts:
                conflict_parts.append(
                    f"faculty already assigned in this slot ({len(faculty_conflicts)} existing entry/entries)"
                )
            if room_conflicts:
                conflict_parts.append(
                    f"room already assigned in this slot ({len(room_conflicts)} existing entry/entries)"
                )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Cannot create timetable entry due to hard conflict: "
                    + "; ".join(conflict_parts)
                ),
            )

        response = (
            supabase.table("timetable_entries")
            .insert(entry.model_dump())
            .execute()
        )
        return {
            "data": response.data,
            "message": "Timetable entry created successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create timetable entry: {str(e)}",
        )


@router.put("/{entry_id}", response_model=SuccessResponse)
async def update_timetable_entry(
    entry_id: str,
    entry: TimetableEntryUpdate,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Update a timetable entry."""
    try:
        supabase = get_service_supabase() if _is_anonymous_mode_user(current_user) else get_user_supabase()
        update_data = entry.model_dump(exclude_unset=True)

        existing = (
            supabase.table("timetable_entries")
            .select("*")
            .eq("entry_id", entry_id)
            .single()
            .execute()
            .data
        )
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Timetable entry not found.",
            )

        candidate = {**existing, **update_data}
        faculty_conflicts, room_conflicts = _slot_conflicts_for_entry(
            supabase,
            version_id=str(candidate.get("version_id") or ""),
            day_id=int(candidate.get("day_id")),
            slot_id=str(candidate.get("slot_id") or ""),
            faculty_id=str(candidate.get("faculty_id") or ""),
            room_id=str(candidate.get("room_id") or ""),
            exclude_entry_id=entry_id,
        )
        if faculty_conflicts or room_conflicts:
            conflict_parts: list[str] = []
            if faculty_conflicts:
                conflict_parts.append(
                    f"faculty already assigned in this slot ({len(faculty_conflicts)} existing entry/entries)"
                )
            if room_conflicts:
                conflict_parts.append(
                    f"room already assigned in this slot ({len(room_conflicts)} existing entry/entries)"
                )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Cannot update timetable entry due to hard conflict: "
                    + "; ".join(conflict_parts)
                ),
            )

        response = (
            supabase.table("timetable_entries")
            .update(update_data)
            .eq("entry_id", entry_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Timetable entry updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update timetable entry: {str(e)}",
        )


@router.delete("/{entry_id}", response_model=SuccessResponse)
async def delete_timetable_entry(
    entry_id: str,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Delete a timetable entry."""
    try:
        supabase = get_service_supabase() if _is_anonymous_mode_user(current_user) else get_user_supabase()
        response = (
            supabase.table("timetable_entries")
            .delete()
            .eq("entry_id", entry_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Timetable entry deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete timetable entry: {str(e)}",
        )

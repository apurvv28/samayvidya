from fastapi import APIRouter, HTTPException, status, Depends
import json
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from app.config import settings
from app.dependencies.auth import (
    get_current_user_with_profile,
    CurrentUser,
    resolve_effective_department_id,
)
from app.supabase_client import get_service_supabase
from app.schemas.common import SuccessResponse
from app.services.load_management_agents import LoadManagementCrew
from app.services.timetable_orchestrator import (
    TimetableOrchestrationEngine,
    _division_base_name,
    _division_level_from_name,
    _compact_token,
    _normalize_text,
    _normalize_year_level,
    _subject_code_from_load,
)

router = APIRouter(prefix="/agents", tags=["agents"])


def _is_anonymous_mode_user(current_user: CurrentUser) -> bool:
    return settings.allow_anonymous_api and current_user.aud == "anonymous"


class TimetableOrchestrationRequest(BaseModel):
    department_id: str | None = None
    reason: str | None = None
    dry_run: bool = False


@router.get("/input-readiness", response_model=SuccessResponse)
async def get_timetable_input_readiness(
    department_id: str | None = None,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Return preflight readiness details for timetable generation with department filtering."""
    try:
        supabase = get_service_supabase()

        target_dept_id = resolve_effective_department_id(current_user, department_id)

        if current_user.role != "ADMIN":
            if not target_dept_id:
                return {
                    "data": [],
                    "message": "No data found. Please contact admin to assign you to a department.",
                }

        load_query = supabase.table("load_distribution").select(
            "faculty_name, year, division, subject, theory_hrs, lab_hrs, tutorial_hrs, batch"
        )

        if current_user.role != "ADMIN":
            load_query = load_query.eq("department_id", target_dept_id)
        elif target_dept_id:
            load_query = load_query.eq("department_id", target_dept_id)
        elif not _is_anonymous_mode_user(current_user):
            load_query = load_query.eq("uploaded_by", current_user.uid)

        load_rows = load_query.execute().data or []

        faculty_names_from_load = sorted(
            {
                str(row.get("faculty_name") or "").strip()
                for row in load_rows
                if str(row.get("faculty_name") or "").strip()
            }
        )

        division_query = supabase.table("divisions").select("division_id, division_name, year, department_id")
        if current_user.role != "ADMIN":
            division_query = division_query.eq("department_id", target_dept_id)
        elif target_dept_id:
            division_query = division_query.eq("department_id", target_dept_id)
        division_rows = division_query.execute().data or []

        subject_query = supabase.table("subjects").select("subject_id, subject_name, year, department_id")
        if current_user.role != "ADMIN":
            subject_query = subject_query.eq("department_id", target_dept_id)
        elif target_dept_id:
            subject_query = subject_query.eq("department_id", target_dept_id)
        subject_rows = subject_query.execute().data or []

        room_query = supabase.table("rooms").select("room_id, room_number, room_type, capacity, department_id, is_active")
        if current_user.role != "ADMIN":
            room_query = room_query.eq("department_id", target_dept_id)
        elif target_dept_id:
            room_query = room_query.eq("department_id", target_dept_id)
        room_rows = [row for row in (room_query.execute().data or []) if row.get("is_active", True)]

        departments = (
            supabase.table("departments")
            .select("department_id, department_name")
            .order("department_name")
            .execute()
            .data
            or []
        )

        division_by_key: dict[tuple[str, str], dict] = {}
        division_by_normalized: dict[str, dict] = {}
        for row in division_rows:
            division_name_key = _division_base_name(row.get("division_name"))
            division_name_norm = _normalize_text(division_name_key)
            division_name_compact = _compact_token(division_name_key)
            year_level = _division_level_from_name(row.get("division_name")) or _normalize_year_level(row.get("year"))

            if year_level and division_name_norm and (year_level, division_name_norm) not in division_by_key:
                division_by_key[(year_level, division_name_norm)] = row
            if year_level and division_name_compact and (year_level, division_name_compact) not in division_by_key:
                division_by_key[(year_level, division_name_compact)] = row

            if division_name_norm and division_name_norm not in division_by_normalized:
                division_by_normalized[division_name_norm] = row
            if division_name_compact and division_name_compact not in division_by_normalized:
                division_by_normalized[division_name_compact] = row

        subject_by_code: dict[tuple[str, str], dict] = {}
        subject_by_name: dict[tuple[str, str], dict] = {}
        subject_by_code_fallback: dict[str, dict] = {}
        subject_by_name_fallback: dict[str, dict] = {}
        for row in subject_rows:
            year_level = _normalize_year_level(row.get("year"))
            code_key = _normalize_text(row.get("subject_id"))
            name_key = _normalize_text(row.get("subject_name"))

            if year_level and code_key and (year_level, code_key) not in subject_by_code:
                subject_by_code[(year_level, code_key)] = row
            if year_level and name_key and (year_level, name_key) not in subject_by_name:
                subject_by_name[(year_level, name_key)] = row

            if code_key and code_key not in subject_by_code_fallback:
                subject_by_code_fallback[code_key] = row
            if name_key and name_key not in subject_by_name_fallback:
                subject_by_name_fallback[name_key] = row

        unresolved_divisions: set[str] = set()
        unresolved_subjects: set[str] = set()

        for row in load_rows:
            load_year = _normalize_year_level(row.get("year"))
            division_name_key = _division_base_name(row.get("division"))
            division_name_fallback = _normalize_text(row.get("division"))
            division_name_compact = _compact_token(division_name_key)
            subject_code = _subject_code_from_load(row.get("subject"))
            subject_name_key = _normalize_text(row.get("subject"))

            division_row = (
                division_by_key.get((load_year, _normalize_text(division_name_key)))
                or division_by_key.get((load_year, division_name_compact))
                or division_by_normalized.get(division_name_fallback)
                or division_by_normalized.get(division_name_compact)
            )
            subject_row = (
                subject_by_code.get((load_year, subject_code))
                or subject_by_name.get((load_year, subject_name_key))
                or subject_by_code_fallback.get(subject_code)
                or subject_by_name_fallback.get(subject_name_key)
            )

            if not division_row and division_name_fallback:
                unresolved_divisions.add(str(row.get("division") or "").strip())
            if not subject_row and subject_name_key:
                unresolved_subjects.add(str(row.get("subject") or "").strip())

        faculty_without_max_load: list[str] = []
        rooms_without_capacity = sorted(
            {
                str(row.get("room_number") or "").strip()
                for row in room_rows
                if not row.get("capacity")
            }
        )

        classrooms = [row for row in room_rows if str(row.get("room_type") or "").upper() == "CLASSROOM"]
        labs = [row for row in room_rows if str(row.get("room_type") or "").upper() == "LAB"]

        blocking_issues: list[str] = []
        if not load_rows:
            blocking_issues.append("No load distribution rows found.")
        if not faculty_names_from_load:
            blocking_issues.append("No faculty names found in load distribution.")
        if not division_rows:
            blocking_issues.append("No division records found.")
        if not subject_rows:
            blocking_issues.append("No subject records found.")
        if not room_rows:
            blocking_issues.append("No active room records found.")
        if not classrooms:
            blocking_issues.append("No active CLASSROOM rooms found.")
        if not labs:
            blocking_issues.append("No active LAB rooms found.")
        if unresolved_divisions:
            blocking_issues.append("Some load rows have divisions not found in division master.")
        if unresolved_subjects:
            blocking_issues.append("Some load rows have subjects not found in subject master.")

        division_options = []
        for row in division_rows:
            year = str(row.get("year") or "").strip()
            name = str(row.get("division_name") or "").strip()
            label = f"{year} | {name}" if year else name
            division_options.append(
                {
                    "division_id": row.get("division_id"),
                    "division_name": name,
                    "year": year,
                    "label": label,
                }
            )

        return {
            "data": {
                "counts": {
                    "load_rows": len(load_rows),
                    "faculty": len(faculty_names_from_load),
                    "divisions": len(division_rows),
                    "subjects": len(subject_rows),
                    "rooms": len(room_rows),
                    "classrooms": len(classrooms),
                    "labs": len(labs),
                },
                "coverage": {
                    "unresolved_faculty": [],
                    "unresolved_divisions": sorted(unresolved_divisions),
                    "unresolved_subjects": sorted(unresolved_subjects),
                },
                "quality": {
                    "faculty_without_max_load_per_week": faculty_without_max_load,
                    "rooms_without_capacity": rooms_without_capacity,
                },
                "defaults": {
                    "academic_year": "2025-26",
                    "semester": "Semester 2",
                    "program": "BTech CSE (Artificial Intelligence)",
                    "effective_from": "2026-01-05",
                    "effective_to": "2026-05-31",
                },
                "departments": departments,
                "division_options": division_options,
                "blocking_issues": blocking_issues,
                "can_generate": len(blocking_issues) == 0,
            },
            "message": "Input readiness calculated from Supabase master data.",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compute input readiness: {str(e)}",
        )


@router.post("/seed-defaults", response_model=SuccessResponse)
async def seed_orchestration_defaults(
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Seed default orchestration data: working days, slots, faculty shifts, and division windows."""
    try:
        supabase = get_service_supabase()

        days_seed = [
            {"day_id": 1, "day_name": "Monday", "is_working_day": True},
            {"day_id": 2, "day_name": "Tuesday", "is_working_day": True},
            {"day_id": 3, "day_name": "Wednesday", "is_working_day": True},
            {"day_id": 4, "day_name": "Thursday", "is_working_day": True},
            {"day_id": 5, "day_name": "Friday", "is_working_day": True},
            {"day_id": 6, "day_name": "Saturday", "is_working_day": False},
            {"day_id": 7, "day_name": "Sunday", "is_working_day": False},
        ]

        supabase.table("days").upsert(days_seed, on_conflict="day_id").execute()

        # Lunch break is a single one-hour slot from 12:00 to 13:00.
        slots_seed = [
            {"start_time": "08:00", "end_time": "09:00", "slot_order": 1, "is_break": False},
            {"start_time": "09:00", "end_time": "10:00", "slot_order": 2, "is_break": False},
            {"start_time": "10:00", "end_time": "11:00", "slot_order": 3, "is_break": False},
            {"start_time": "11:00", "end_time": "12:00", "slot_order": 4, "is_break": False},
            {"start_time": "12:00", "end_time": "13:00", "slot_order": 5, "is_break": True},
            {"start_time": "13:00", "end_time": "14:00", "slot_order": 6, "is_break": False},
            {"start_time": "14:00", "end_time": "15:00", "slot_order": 7, "is_break": False},
            {"start_time": "15:00", "end_time": "16:00", "slot_order": 8, "is_break": False},
            {"start_time": "16:00", "end_time": "17:00", "slot_order": 9, "is_break": False},
            {"start_time": "17:00", "end_time": "18:00", "slot_order": 10, "is_break": False},
        ]

        for slot in slots_seed:
            existing_slot = (
                supabase.table("time_slots")
                .select("slot_id")
                .eq("slot_order", slot["slot_order"])
                .limit(1)
                .execute()
                .data
                or []
            )
            if existing_slot:
                supabase.table("time_slots").update(slot).eq("slot_order", slot["slot_order"]).execute()
            else:
                supabase.table("time_slots").insert(slot).execute()

        faculty_rows = supabase.table("faculty").select("faculty_id").order("faculty_id").execute().data or []
        split_index = len(faculty_rows) // 2
        first_half = faculty_rows[:split_index]
        second_half = faculty_rows[split_index:]

        for row in first_half:
            supabase.table("faculty").update(
                {"preferred_start_time": "08:00", "preferred_end_time": "16:00"}
            ).eq("faculty_id", row["faculty_id"]).execute()

        for row in second_half:
            supabase.table("faculty").update(
                {"preferred_start_time": "10:00", "preferred_end_time": "18:00"}
            ).eq("faculty_id", row["faculty_id"]).execute()

        divisions = supabase.table("divisions").select("division_id").execute().data or []
        for row in divisions:
            supabase.table("divisions").update(
                {
                    "min_working_days": 5,
                    "max_working_days": 6,
                    "earliest_start_time": "08:00",
                    "latest_end_time": "18:00",
                }
            ).eq("division_id", row["division_id"]).execute()

        return {
            "data": {
                "days_seeded": len(days_seed),
                "time_slots_seeded": len(slots_seed),
                "faculty_updated": len(faculty_rows),
                "divisions_updated": len(divisions),
                "faculty_shift_split": {
                    "08:00-16:00": len(first_half),
                    "10:00-18:00": len(second_half),
                },
            },
            "message": "Default orchestration seed completed.",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to seed defaults: {str(e)}",
        )


@router.post("/generate-faculty-load", response_model=SuccessResponse)
async def generate_faculty_load(
    department_id: str | None = None,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Summarize load distribution rows for timetable generation."""
    try:
        supabase = get_service_supabase()

        target_dept_id = resolve_effective_department_id(current_user, department_id)

        load_query = supabase.table("load_distribution").select(
            "load_distribution_id, faculty_name, year, division, subject, theory_hrs, lab_hrs, tutorial_hrs, batch, total_hrs_per_week, created_at"
        )
        if current_user.role != "ADMIN":
            if not target_dept_id:
                raise HTTPException(status_code=400, detail="No department context for load distribution.")
            load_query = load_query.eq("department_id", target_dept_id)
        elif target_dept_id:
            load_query = load_query.eq("department_id", target_dept_id)
        elif not _is_anonymous_mode_user(current_user):
            load_query = load_query.eq("uploaded_by", current_user.uid)

        load_rows_res = load_query.execute()
        load_rows = load_rows_res.data or []

        if not load_rows:
            raise HTTPException(status_code=400, detail="No load distribution rows found.")

        crew = LoadManagementCrew()
        result_json_str = crew.calculate_and_validate_load(load_rows)

        try:
            result_data = json.loads(result_json_str)

        except json.JSONDecodeError:
            result_data = {"raw_output": result_json_str}

        return {
            "data": result_data,
            "message": "Load distribution summarized successfully."
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agent process failed: {str(e)}",
        )


@router.post("/create-timetable", response_model=SuccessResponse)
async def create_timetable_with_agents(
    payload: TimetableOrchestrationRequest,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Run multi-agent orchestration to build a timetable from persisted master data."""
    try:
        effective_dept = resolve_effective_department_id(current_user, payload.department_id)
        if current_user.role != "ADMIN" and not effective_dept:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Department is required to generate a timetable.",
            )
        orchestrator = TimetableOrchestrationEngine()
        result = orchestrator.run(
            user_id=None if _is_anonymous_mode_user(current_user) else current_user.uid,
            department_id=effective_dept,
            persist=not payload.dry_run,
            reason=payload.reason,
        )
        return {
            "data": result,
            "message": "Multi-agent timetable orchestration completed successfully.",
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Timetable orchestration failed: {str(e)}",
        )


@router.post("/create-timetable/stream")
async def create_timetable_with_agents_stream(
    payload: TimetableOrchestrationRequest,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
):
    """Stream real-time stage updates for timetable orchestration using SSE."""

    def event_stream():
        try:
            orchestrator = TimetableOrchestrationEngine()
            for event in orchestrator.run_stream(
                user_id=None if _is_anonymous_mode_user(current_user) else current_user.uid,
                department_id=payload.department_id,
                persist=not payload.dry_run,
                reason=payload.reason,
            ):
                event_type = event.get("type", "message")
                yield f"event: {event_type}\n"
                yield f"data: {json.dumps(event)}\n\n"
        except ValueError as e:
            error_event = {
                "type": "error",
                "status_code": 400,
                "detail": str(e),
            }
            yield "event: error\n"
            yield f"data: {json.dumps(error_event)}\n\n"
        except Exception as e:
            error_event = {
                "type": "error",
                "status_code": 500,
                "detail": f"Timetable orchestration failed: {str(e)}",
            }
            yield "event: error\n"
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

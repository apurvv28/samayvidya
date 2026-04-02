from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterator
from uuid import uuid4

from app.config import settings
from app.supabase_client import get_service_supabase


def _to_float(value: object) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _to_session_count(value: object) -> int:
    # Round hours to nearest session count; negative/invalid values become zero.
    hours = _to_float(value)
    return max(int(round(hours)), 0)


def _normalize_division_name(value: object) -> str:
    normalized = str(value or "").strip().upper()
    for prefix in ("FY-", "SY-", "TY-", "LY-"):
        if normalized.startswith(prefix):
            return normalized[len(prefix) :]
    return normalized


def _normalize_text(value: object) -> str:
    return str(value or "").strip().casefold()


@dataclass
class _SessionTask:
    division_id: str
    faculty_id: str
    subject_id: str
    batch_id: str | None
    session_type: str


class TimetableOrchestrationEngine:
    """Multi-agent style orchestration for single-click timetable generation."""

    def __init__(self) -> None:
        self.supabase = get_service_supabase()

    def run(
        self,
        *,
        user_id: str | None,
        department_id: str | None = None,
        persist: bool = True,
        reason: str | None = None,
    ) -> dict:
        final_result: dict | None = None
        for event in self.run_stream(
            user_id=user_id,
            department_id=department_id,
            persist=persist,
            reason=reason,
        ):
            if event.get("type") == "result":
                final_result = event.get("result")

        if not final_result:
            raise ValueError("Timetable orchestration did not produce a final result.")

        return final_result

    def run_stream(
        self,
        *,
        user_id: str | None,
        department_id: str | None = None,
        persist: bool = True,
        reason: str | None = None,
    ) -> Iterator[dict]:
        run_id = str(uuid4())
        stages: list[dict] = []

        def emit_stage(stage_payload: dict) -> dict:
            stages.append(stage_payload)
            return {
                "type": "stage",
                "run_id": run_id,
                "stage_index": len(stages),
                "stage": stage_payload,
            }

        # 1) Data ingestion agent
        load_query = self.supabase.table("load_distribution").select(
            "faculty_name, year, division, subject, theory_hrs, lab_hrs, tutorial_hrs"
        )
        if user_id:
            load_query = load_query.eq("uploaded_by", user_id)
        load_rows = load_query.execute().data or []
        if not load_rows:
            raise ValueError("No load distribution rows found. Upload load data before creating timetable.")

        faculty_query = self.supabase.table("faculty").select(
            "faculty_id, faculty_name, department_id, max_load_per_week, is_active"
        )
        if department_id:
            faculty_query = faculty_query.eq("department_id", department_id)
        faculty_rows = [row for row in (faculty_query.execute().data or []) if row.get("is_active", True)]

        division_query = self.supabase.table("divisions").select("division_id, division_name, year, department_id")
        if department_id:
            division_query = division_query.eq("department_id", department_id)
        division_rows = division_query.execute().data or []

        subject_query = self.supabase.table("subjects").select(
            "subject_id, subject_name, year, department_id, subject_type"
        )
        if department_id:
            subject_query = subject_query.eq("department_id", department_id)
        subject_rows = subject_query.execute().data or []

        room_query = self.supabase.table("rooms").select("room_id, room_type, is_active")
        room_rows = [row for row in (room_query.execute().data or []) if row.get("is_active", True)]

        day_rows = (
            self.supabase.table("days")
            .select("day_id, day_name, is_working_day")
            .eq("is_working_day", True)
            .order("day_id")
            .execute()
            .data
            or []
        )
        slot_rows = (
            self.supabase.table("time_slots")
            .select("slot_id, slot_order, is_break")
            .eq("is_break", False)
            .order("slot_order")
            .execute()
            .data
            or []
        )

        if not faculty_rows:
            raise ValueError("No active faculty found for timetable creation.")
        if not division_rows:
            raise ValueError("No divisions found for timetable creation.")
        if not subject_rows:
            raise ValueError("No subjects found for timetable creation.")
        if not room_rows:
            raise ValueError("No active rooms found for timetable creation.")
        if not day_rows or not slot_rows:
            raise ValueError("Days or time slots are missing. Configure reference data first.")

        yield emit_stage(
            {
                "agent": "Data Ingestion Agent",
                "status": "completed",
                "metrics": {
                    "load_rows": len(load_rows),
                    "faculty": len(faculty_rows),
                    "divisions": len(division_rows),
                    "subjects": len(subject_rows),
                    "rooms": len(room_rows),
                    "working_days": len(day_rows),
                    "usable_slots": len(slot_rows),
                },
                "message": "Source data prepared for orchestration.",
            }
        )

        # 2) Curriculum planner + faculty load manager + student division planner
        faculty_by_name = {
            _normalize_text(row.get("faculty_name")): row
            for row in faculty_rows
            if row.get("faculty_name")
        }
        division_by_key = {
            (_normalize_division_name(row.get("division_name")), _normalize_text(row.get("year"))): row
            for row in division_rows
        }
        subject_by_key = {
            (_normalize_text(row.get("subject_name")), _normalize_text(row.get("year"))): row
            for row in subject_rows
        }

        tasks: list[_SessionTask] = []
        unresolved_rows = 0

        for row in load_rows:
            faculty_row = faculty_by_name.get(_normalize_text(row.get("faculty_name")))
            division_row = division_by_key.get(
                (
                    _normalize_division_name(row.get("division")),
                    _normalize_text(row.get("year")),
                )
            )
            subject_row = subject_by_key.get(
                (
                    _normalize_text(row.get("subject")),
                    _normalize_text(row.get("year")),
                )
            )

            if not faculty_row or not division_row or not subject_row:
                unresolved_rows += 1
                continue

            theory_count = _to_session_count(row.get("theory_hrs"))
            lab_count = _to_session_count(row.get("lab_hrs"))
            tutorial_count = _to_session_count(row.get("tutorial_hrs"))

            for _ in range(theory_count):
                tasks.append(
                    _SessionTask(
                        division_id=division_row["division_id"],
                        faculty_id=faculty_row["faculty_id"],
                        subject_id=subject_row["subject_id"],
                        batch_id=None,
                        session_type="THEORY",
                    )
                )
            for _ in range(lab_count):
                tasks.append(
                    _SessionTask(
                        division_id=division_row["division_id"],
                        faculty_id=faculty_row["faculty_id"],
                        subject_id=subject_row["subject_id"],
                        batch_id=None,
                        session_type="LAB",
                    )
                )
            for _ in range(tutorial_count):
                tasks.append(
                    _SessionTask(
                        division_id=division_row["division_id"],
                        faculty_id=faculty_row["faculty_id"],
                        subject_id=subject_row["subject_id"],
                        batch_id=None,
                        session_type="TUTORIAL",
                    )
                )

        if not tasks:
            raise ValueError(
                "No schedulable tasks generated. Ensure faculty/division/subject names in load distribution match master data."
            )

        yield emit_stage(
            {
                "agent": "Curriculum + Faculty + Division Planning Agents",
                "status": "completed",
                "metrics": {
                    "session_tasks": len(tasks),
                    "unresolved_load_rows": unresolved_rows,
                },
                "message": "Session-level scheduling tasks generated.",
            }
        )

        # 3) Resource allocation + constraints/conflict detection/resolution + optimization
        lab_rooms = [room for room in room_rows if str(room.get("room_type", "")).upper() == "LAB"]
        theory_rooms = [room for room in room_rows if str(room.get("room_type", "")).upper() != "LAB"]
        if not theory_rooms:
            theory_rooms = room_rows
        if not lab_rooms:
            lab_rooms = room_rows

        used_division_slot: set[tuple[str, int, str]] = set()
        used_faculty_slot: set[tuple[str, int, str]] = set()
        used_room_slot: set[tuple[str, int, str]] = set()
        faculty_load_counter: dict[str, int] = {}
        faculty_limit: dict[str, int] = {
            row["faculty_id"]: int(row.get("max_load_per_week") or 0) if row.get("max_load_per_week") else 999
            for row in faculty_rows
            if row.get("faculty_id")
        }

        allocated_entries: list[dict] = []
        unresolved_tasks = 0
        detected_conflicts = 0

        sorted_tasks = sorted(
            tasks,
            key=lambda task: (task.session_type != "LAB", task.division_id, task.faculty_id),
        )

        for task in sorted_tasks:
            room_candidates = lab_rooms if task.session_type == "LAB" else theory_rooms
            scheduled = False

            if faculty_load_counter.get(task.faculty_id, 0) >= faculty_limit.get(task.faculty_id, 999):
                unresolved_tasks += 1
                detected_conflicts += 1
                continue

            for day in day_rows:
                day_id = int(day["day_id"])
                for slot in slot_rows:
                    slot_id = str(slot["slot_id"])
                    div_key = (task.division_id, day_id, slot_id)
                    fac_key = (task.faculty_id, day_id, slot_id)

                    if div_key in used_division_slot or fac_key in used_faculty_slot:
                        detected_conflicts += 1
                        continue

                    selected_room_id: str | None = None
                    for room in room_candidates:
                        room_id = str(room["room_id"])
                        room_key = (room_id, day_id, slot_id)
                        if room_key in used_room_slot:
                            continue
                        selected_room_id = room_id
                        break

                    if not selected_room_id:
                        detected_conflicts += 1
                        continue

                    allocated_entries.append(
                        {
                            "division_id": task.division_id,
                            "faculty_id": task.faculty_id,
                            "subject_id": task.subject_id,
                            "room_id": selected_room_id,
                            "day_id": day_id,
                            "slot_id": slot_id,
                            "batch_id": task.batch_id,
                            "session_type": task.session_type,
                        }
                    )
                    used_division_slot.add(div_key)
                    used_faculty_slot.add(fac_key)
                    used_room_slot.add((selected_room_id, day_id, slot_id))
                    faculty_load_counter[task.faculty_id] = faculty_load_counter.get(task.faculty_id, 0) + 1
                    scheduled = True
                    break

                if scheduled:
                    break

            if not scheduled:
                unresolved_tasks += 1

        allocated_entries.sort(
            key=lambda item: (item["division_id"], item["day_id"], str(item["slot_id"]))
        )

        yield emit_stage(
            {
                "agent": "Resource + Constraint Handling + Schedule Optimization Agents",
                "status": "completed",
                "metrics": {
                    "allocated_sessions": len(allocated_entries),
                    "unresolved_sessions": unresolved_tasks,
                    "detected_conflicts": detected_conflicts,
                },
                "message": "Conflicts handled with greedy resolution and capacity checks.",
            }
        )

        version_id: str | None = None
        if persist and allocated_entries:
            version_payload = {
                "created_by": user_id,
                "reason": reason or f"Agent orchestration run {run_id}",
                "is_active": True,
            }
            version_insert = self.supabase.table("timetable_versions").insert(version_payload).execute().data or []
            if version_insert:
                version_id = version_insert[0].get("version_id")

            if version_id:
                rows_to_insert = [{**entry, "version_id": version_id} for entry in allocated_entries]
                self.supabase.table("timetable_entries").insert(rows_to_insert).execute()

        yield emit_stage(
            {
                "agent": "Notification Agent",
                "status": "completed",
                "metrics": {
                    "version_created": bool(version_id),
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                },
                "message": "Timetable orchestration completed.",
            }
        )

        final_result = {
            "run_id": run_id,
            "version_id": version_id,
            "orchestration": {
                "workflow_engine": "LangGraph-style staged orchestration",
                "agent_manager": "CrewAI-style agent manager",
                "llm_provider": "groq",
                "llm_model": settings.groq_model,
            },
            "stages": stages,
            "final_timetable": allocated_entries,
            "summary": {
                "requested_sessions": len(tasks),
                "scheduled_sessions": len(allocated_entries),
                "unscheduled_sessions": unresolved_tasks,
            },
        }
        yield {
            "type": "result",
            "run_id": run_id,
            "result": final_result,
        }
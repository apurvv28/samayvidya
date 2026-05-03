from __future__ import annotations

from dataclasses import dataclass
import hashlib
from datetime import datetime
import re
from typing import Any, Iterator
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


def _normalize_year_level(value: object) -> str:
    normalized = _normalize_text(value)
    if normalized in {"sy", "second year", "second year (sy)", "second year sy"}:
        return "SY"
    if normalized in {"ty", "third year", "third year (ty)", "third year ty"}:
        return "TY"
    if normalized in {"fy", "first year", "first year (fy)", "first year fy"}:
        return "FY"
    if normalized in {"ly", "last year", "last year (ly)", "last year ly"}:
        return "LY"
    upper = str(value or "").strip().upper()
    if upper in {"SY", "TY", "FY", "LY"}:
        return upper
    return upper


def _compact_token(value: object) -> str:
    return re.sub(r"[^a-z0-9]", "", _normalize_text(value))


def _subject_code_from_load(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    return raw.split("-")[0].strip().casefold()


def _division_level_from_name(value: object) -> str:
    normalized = str(value or "").strip().upper()
    for prefix in ("SY-", "TY-", "FY-", "LY-"):
        if normalized.startswith(prefix):
            return prefix[:-1]
    return ""


def _division_base_name(value: object) -> str:
    normalized = str(value or "").strip().upper()
    for prefix in ("SY-", "TY-", "FY-", "LY-"):
        if normalized.startswith(prefix):
            return normalized[len(prefix) :]
    return normalized


@dataclass
class _SessionTask:
    division_id: str
    faculty_id: str
    subject_id: str
    year_level: str
    batch_id: str | None
    session_type: str
    duration_slots: int = 1
    group_id: str | None = None


def _parse_time_to_minutes(value: object) -> int | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        hour, minute = raw.split(":")[:2]
        return int(hour) * 60 + int(minute)
    except (TypeError, ValueError):
        return None


def _slot_within_faculty_window(slot_row: dict, faculty_window: tuple[int | None, int | None]) -> bool:
    start_limit, end_limit = faculty_window
    slot_start = _parse_time_to_minutes(slot_row.get("start_time"))
    slot_end = _parse_time_to_minutes(slot_row.get("end_time"))

    if slot_start is None or slot_end is None:
        return True
    if start_limit is not None and slot_start < start_limit:
        return False
    if end_limit is not None and slot_end > end_limit:
        return False
    return True


def _slot_within_window(slot_row: dict, window: tuple[int | None, int | None]) -> bool:
    start_limit, end_limit = window
    slot_start = _parse_time_to_minutes(slot_row.get("start_time"))
    slot_end = _parse_time_to_minutes(slot_row.get("end_time"))

    if slot_start is None or slot_end is None:
        return True
    if start_limit is not None and slot_start < start_limit:
        return False
    if end_limit is not None and slot_end > end_limit:
        return False
    return True


def _block_within_window(slot_rows: list[dict], window: tuple[int | None, int | None]) -> bool:
    return all(_slot_within_window(slot_row, window) for slot_row in slot_rows)


def _is_gapless_day_pattern(slot_orders: set[int], lunch_slot_order: int | None) -> bool:
    """Validate no-gap day pattern with conditional 12:00-13:00 lunch break.

    Rule:
    - If total scheduled hours for a day are > 4, lunch slot (12:00-13:00) must be free.
    - Otherwise lunch slot can be used.
    - No internal gaps are allowed (except the lunch gap when the >4 rule applies).
    """
    if not slot_orders:
        return True

    sorted_orders = sorted(slot_orders)
    total_hours = len(sorted_orders)

    if lunch_slot_order is not None and total_hours > 4:
        if lunch_slot_order in slot_orders:
            return False

        left = [order for order in sorted_orders if order < lunch_slot_order]
        right = [order for order in sorted_orders if order > lunch_slot_order]

        if left and left != list(range(left[0], left[-1] + 1)):
            return False
        if right and right != list(range(right[0], right[-1] + 1)):
            return False
        return True

    return sorted_orders == list(range(sorted_orders[0], sorted_orders[-1] + 1))


class TimetableOrchestrationEngine:
    """Multi-agent style orchestration for single-click timetable generation."""

    def __init__(self) -> None:
        self.supabase = get_service_supabase()

    def _invoke_llm_hook(self, pass_name: str, payload: dict[str, Any], enabled: bool) -> dict[str, Any]:
        """Best-effort LLM invocation hook for pass-level reasoning/tracing."""
        trace = {
            "pass": pass_name,
            "llm_enabled": enabled and bool(settings.bedrock_model),
            "llm_invoked": False,
            "llm_status": "skipped",
            "llm_provider": "bedrock",
            "llm_model": settings.bedrock_model,
            "llm_note": "",
            "llm_content": "",
        }

        if not enabled:
            trace["llm_note"] = "llm hook disabled for this run"
            return trace

        if not settings.bedrock_model:
            trace["llm_note"] = "bedrock_model not configured"
            return trace

        try:
            from litellm import completion

            trace["llm_invoked"] = True
            response = completion(
                model=f"bedrock/{settings.bedrock_model}",
                aws_region_name=settings.bedrock_region,
                temperature=0.2,
                max_tokens=80,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a scheduling pass assistant. Return exactly one tag from: "
                            "TY_FIRST, FY_FIRST, LAB_FIRST, BALANCED."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Pass={pass_name}. Payload summary={payload}",
                    },
                ],
            )
            response_text = ""
            if getattr(response, "choices", None):
                response_text = str(response.choices[0].message.content or "")
            trace["llm_content"] = response_text.strip()
            trace["llm_status"] = "ok"
            trace["llm_note"] = trace["llm_content"] or "LLM hook executed"
        except Exception as e:
            trace["llm_status"] = "error"
            trace["llm_note"] = str(e)

        return trace

    @staticmethod
    def _planning_profile_from_llm(content: str) -> str:
        normalized = _normalize_text(content).upper()
        for token in re.findall(r"[A-Z_]+", normalized):
            if token in {"TY_FIRST", "FY_FIRST", "LAB_FIRST", "BALANCED"}:
                return token
        return "TY_FIRST"

    def _deterministic_validator_gate(self, pass_name: str, context: dict[str, Any]) -> dict[str, Any]:
        """Deterministic validation gate used between passes."""
        result = {
            "pass": pass_name,
            "passed": True,
            "errors": [],
        }

        if pass_name == "PASS0":
            sunday_non_working = context.get("sunday_non_working", False)
            if not sunday_non_working:
                result["passed"] = False
                result["errors"].append("Sunday must be non-working.")

        if pass_name == "PASS7":
            if (context.get("unresolved_tasks") or 0) > 0:
                result["passed"] = False
                result["errors"].append("Unresolved tasks remain after scheduling.")
            if (context.get("detected_conflicts") or 0) > 0:
                result["passed"] = False
                result["errors"].append("Conflicts detected after allocation.")

        return result

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
        pass_trace: list[dict[str, Any]] = []
        strict_gate_enabled = "strict" in (reason or "").casefold()
        llm_hooks_enabled = bool(settings.bedrock_model) and "no-llm-hook" not in (reason or "").casefold()

        def seeded_rank(*parts: object) -> int:
            token = "|".join(str(part) for part in parts)
            digest = hashlib.sha1(f"{run_id}|{token}".encode("utf-8")).hexdigest()
            return int(digest[:8], 16)

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
            "faculty_name, year, division, subject, theory_hrs, lab_hrs, tutorial_hrs, batch"
        )
        if department_id:
            load_query = load_query.eq("department_id", department_id)
        elif user_id:
            load_query = load_query.eq("uploaded_by", user_id)
        load_rows = load_query.execute().data or []
        if not load_rows:
            raise ValueError("No load distribution rows found. Upload load data before creating timetable.")

        faculty_query = self.supabase.table("faculty").select(
            "faculty_id, faculty_name, department_id, max_load_per_week, preferred_start_time, preferred_end_time, is_active"
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

        room_query = self.supabase.table("rooms").select("room_id, room_type, is_active, department_id")
        if department_id:
            room_query = room_query.eq("department_id", department_id)
        room_rows = [row for row in (room_query.execute().data or []) if row.get("is_active", True)]

        batch_query = self.supabase.table("batches").select("batch_id, division_id, is_active, batch_code")
        batch_rows = [row for row in (batch_query.execute().data or []) if row.get("is_active", True)]
        if department_id:
            allowed_divisions = {str(r["division_id"]) for r in division_rows if r.get("division_id")}
            batch_rows = [
                row
                for row in batch_rows
                if str(row.get("division_id") or "") in allowed_divisions
            ]

        day_rows = (
            self.supabase.table("days")
            .select("day_id, day_name, is_working_day")
            .eq("is_working_day", True)
            .order("day_id")
            .execute()
            .data
            or []
        )
        day_rows = [
            row
            for row in day_rows
            if str(row.get("day_name") or "").strip().casefold() not in {"saturday", "sunday"}
        ]
        if len(day_rows) > 5:
            day_rows = day_rows[:5]
        all_day_rows = (
            self.supabase.table("days")
            .select("day_id, day_name, is_working_day")
            .order("day_id")
            .execute()
            .data
            or []
        )
        all_slot_rows = (
            self.supabase.table("time_slots")
            .select("slot_id, slot_order, is_break, start_time, end_time")
            .order("slot_order")
            .execute()
            .data
            or []
        )
        slot_rows = (
            self.supabase.table("time_slots")
            .select("slot_id, slot_order, is_break, start_time, end_time")
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

        # PASS 0: break/sunday lock validation hook + deterministic gate
        pass0_llm = self._invoke_llm_hook(
            "PASS0",
            {
                "working_days": [row.get("day_name") for row in day_rows],
                "all_days": [row.get("day_name") for row in all_day_rows],
                "break_slots": [
                    f"{str(row.get('start_time') or '')[:5]}-{str(row.get('end_time') or '')[:5]}"
                    for row in all_slot_rows
                    if row.get("is_break")
                ],
            },
            llm_hooks_enabled,
        )
        pass0_gate = self._deterministic_validator_gate(
            "PASS0",
            {
                "break_slots": [],
                "sunday_non_working": any(
                    str(row.get("day_name") or "").casefold() == "sunday" and not row.get("is_working_day", True)
                    for row in all_day_rows
                ),
            },
        )
        pass_trace.append(
            {
                "pass": "PASS0",
                "solver": "deterministic",
                "llm": pass0_llm,
                "gate": pass0_gate,
            }
        )
        if strict_gate_enabled and not pass0_gate["passed"]:
            raise ValueError(f"PASS0 validation failed: {pass0_gate['errors']}")

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
                    "batches": len(batch_rows),
                    "working_days": len(day_rows),
                    "usable_slots": len(slot_rows),
                },
                "message": "Source data prepared for orchestration.",
            }
        )

        # 2) Curriculum planner + faculty load manager + student division planner
        pass1_llm = self._invoke_llm_hook(
            "PASS1",
            {
                "load_rows": len(load_rows),
                "faculty_rows": len(faculty_rows),
                "note": "DR lock planning hook",
            },
            llm_hooks_enabled,
        )
        pass_trace.append(
            {
                "pass": "PASS1",
                "solver": "deterministic",
                "llm": pass1_llm,
                "gate": {"pass": "PASS1", "passed": True, "errors": []},
            }
        )

        faculty_by_name = {}
        for row in faculty_rows:
            name = row.get("faculty_name")
            if not name:
                continue
            normalized = _normalize_text(name)
            compact = _compact_token(name)
            alpha_compact = re.sub(r"[^a-z]", "", normalized)
            faculty_by_name.setdefault(normalized, row)
            if compact:
                faculty_by_name.setdefault(compact, row)
            if alpha_compact:
                faculty_by_name.setdefault(alpha_compact, row)

            # Add searchable tokens so short forms like PPD map to names like Mrs. PPD.
            for token in re.findall(r"[A-Za-z]{2,}", str(name)):
                faculty_by_name.setdefault(token.casefold(), row)

        division_by_key: dict[tuple[str, str], dict] = {}
        division_by_normalized: dict[str, dict] = {}
        division_name_by_id: dict[str, str] = {}
        for row in division_rows:
            normalized_div = _division_base_name(row.get("division_name"))
            normalized_div_text = _normalize_text(normalized_div)
            compact_div = _compact_token(normalized_div)
            year_level = _division_level_from_name(row.get("division_name")) or _normalize_year_level(row.get("year"))
            division_id = str(row.get("division_id") or "").strip()
            if division_id:
                division_name_by_id[division_id] = _compact_token(normalized_div)
            if normalized_div_text:
                division_by_normalized.setdefault(normalized_div_text, row)
            if compact_div:
                division_by_normalized.setdefault(compact_div, row)
            if year_level and normalized_div_text:
                division_by_key.setdefault((year_level, normalized_div_text), row)
            if year_level and compact_div:
                division_by_key.setdefault((year_level, compact_div), row)

        subject_by_code: dict[tuple[str, str], dict] = {}
        subject_by_name: dict[tuple[str, str], dict] = {}
        subject_by_code_fallback: dict[str, dict] = {}
        subject_by_name_fallback: dict[str, dict] = {}
        for row in subject_rows:
            subject_id = str(row.get("subject_id") or "").strip().casefold()
            subject_name = _normalize_text(row.get("subject_name"))
            subject_year = _normalize_year_level(row.get("year"))
            if subject_id:
                subject_by_code_fallback.setdefault(subject_id, row)
                if subject_year:
                    subject_by_code.setdefault((subject_year, subject_id), row)
            if subject_name:
                subject_by_name_fallback.setdefault(subject_name, row)
                if subject_year:
                    subject_by_name.setdefault((subject_year, subject_name), row)
        batches_by_division: dict[str, list[str]] = {}
        batch_code_to_id: dict[tuple[str, str], str] = {}
        for row in batch_rows:
            division_id = row.get("division_id")
            batch_id = row.get("batch_id")
            if not division_id or not batch_id:
                continue
            batches_by_division.setdefault(str(division_id), []).append(str(batch_id))
            batch_code = str(row.get("batch_code") or "").strip().upper()
            if batch_code:
                batch_code_to_id[(str(division_id), batch_code)] = str(batch_id)

        tasks: list[_SessionTask] = []
        unresolved_rows = 0
        lab_parallel_groups = 0

        for row in load_rows:
            raw_faculty = row.get("faculty_name")
            faculty_key = _normalize_text(raw_faculty)
            faculty_compact = _compact_token(raw_faculty)
            faculty_alpha = re.sub(r"[^a-z]", "", faculty_key)
            faculty_row = faculty_by_name.get(faculty_key) or faculty_by_name.get(faculty_compact) or faculty_by_name.get(faculty_alpha)

            if not faculty_row and faculty_alpha:
                for candidate in faculty_rows:
                    candidate_name = _normalize_text(candidate.get("faculty_name"))
                    candidate_alpha = re.sub(r"[^a-z]", "", candidate_name)
                    if faculty_alpha and faculty_alpha in candidate_alpha:
                        faculty_row = candidate
                        break

            load_year = _normalize_year_level(row.get("year"))
            division_name_key = _division_base_name(row.get("division"))
            division_name_norm = _normalize_text(division_name_key)
            division_name_compact = _compact_token(division_name_key)
            division_row = (
                division_by_key.get((load_year, division_name_norm))
                or division_by_key.get((load_year, division_name_compact))
                or division_by_normalized.get(division_name_norm)
                or division_by_normalized.get(division_name_compact)
            )

            subject_code = _subject_code_from_load(row.get("subject"))
            subject_name_key = _normalize_text(row.get("subject"))
            subject_row = (
                subject_by_code.get((load_year, subject_code))
                or subject_by_name.get((load_year, subject_name_key))
                or subject_by_code_fallback.get(subject_code)
                or subject_by_name_fallback.get(subject_name_key)
            )

            if not faculty_row or not division_row or not subject_row:
                unresolved_rows += 1
                continue

            theory_count = _to_session_count(row.get("theory_hrs"))
            lab_count = _to_session_count(row.get("lab_hrs"))
            tutorial_count = _to_session_count(row.get("tutorial_hrs"))

            # Use 2-hour theory blocks where possible (plus 1-hour remainder) to
            # keep generated session counts aligned with CSV expectations.
            theory_block_count = theory_count // 2
            theory_remainder = theory_count % 2
            for block_index in range(theory_block_count):
                tasks.append(
                    _SessionTask(
                        division_id=division_row["division_id"],
                        faculty_id=faculty_row["faculty_id"],
                        subject_id=subject_row["subject_id"],
                        year_level=load_year,
                        batch_id=None,
                        session_type="THEORY",
                        duration_slots=2,
                        group_id=f"{division_row['division_id']}:{subject_row['subject_id']}:{faculty_row['faculty_id']}:THEORY:{block_index}",
                    )
                )
            for remainder_index in range(theory_remainder):
                tasks.append(
                    _SessionTask(
                        division_id=division_row["division_id"],
                        faculty_id=faculty_row["faculty_id"],
                        subject_id=subject_row["subject_id"],
                        year_level=load_year,
                        batch_id=None,
                        session_type="THEORY",
                        group_id=f"{division_row['division_id']}:{subject_row['subject_id']}:{faculty_row['faculty_id']}:THEORY:1HR:{remainder_index}",
                    )
                )
            if lab_count > 0:
                division_id = str(division_row["division_id"])
                division_batches = batches_by_division.get(division_id, [])
                requested_batch_code = str(row.get("batch") or "").strip().upper()
                requested_batch_id = batch_code_to_id.get((division_id, requested_batch_code)) if requested_batch_code else None
                target_batches = [requested_batch_id] if requested_batch_id else (division_batches or [None])

                # Labs are always 2-hour contiguous blocks.
                lab_block_count = max((lab_count + 1) // 2, 1)
                for block_index in range(lab_block_count):
                    for batch_id in target_batches:
                        tasks.append(
                            _SessionTask(
                                division_id=division_id,
                                faculty_id=faculty_row["faculty_id"],
                                subject_id=subject_row["subject_id"],
                                year_level=load_year,
                                batch_id=batch_id,
                                session_type="LAB",
                                duration_slots=2,
                                group_id=f"{division_id}:{subject_row['subject_id']}:{faculty_row['faculty_id']}:LAB:{block_index}",
                            )
                        )
                    lab_parallel_groups += 1

            if tutorial_count > 0:
                division_id = str(division_row["division_id"])
                division_batches = batches_by_division.get(division_id, [])
                requested_batch_code = str(row.get("batch") or "").strip().upper()
                requested_batch_id = batch_code_to_id.get((division_id, requested_batch_code)) if requested_batch_code else None
                target_batches = [requested_batch_id] if requested_batch_id else (division_batches or [None])

                for tutorial_index in range(tutorial_count):
                    for batch_id in target_batches:
                        tasks.append(
                            _SessionTask(
                                division_id=division_row["division_id"],
                                faculty_id=faculty_row["faculty_id"],
                                subject_id=subject_row["subject_id"],
                                year_level=load_year,
                                batch_id=batch_id,
                                session_type="TUTORIAL",
                                duration_slots=1,
                                group_id=f"{division_id}:{subject_row['subject_id']}:{faculty_row['faculty_id']}:{batch_id or 'ALL'}:TUTORIAL:{tutorial_index}",
                            )
                        )

        if not tasks:
            raise ValueError(
                "No schedulable tasks generated. Ensure faculty/division/subject names in load distribution match master data."
            )

        shift_windows: dict[str, tuple[str, tuple[int, int]]] = {
            "FY": ("SHIFT_08_15", (8 * 60, 15 * 60)),
            "SY": ("SHIFT_10_17", (10 * 60, 17 * 60)),
            "TY": ("SHIFT_11_18", (11 * 60, 18 * 60)),
        }
        ordered_division_ids = [
            str(row.get("division_id"))
            for row in sorted(
                division_rows,
                key=lambda row: (
                    {"FY": 0, "SY": 1, "TY": 2, "LY": 3}.get(_normalize_year_level(row.get("year")), 4),
                    _normalize_text(row.get("division_name")),
                    str(row.get("division_id") or ""),
                ),
            )
            if row.get("division_id")
        ]
        division_year_by_id = {
            str(row.get("division_id")): _normalize_year_level(row.get("year"))
            for row in division_rows
            if row.get("division_id")
        }
        division_shift_assignments: dict[str, tuple[str, tuple[int, int]]] = {}
        year_buckets: dict[str, list[str]] = {"FY": [], "SY": [], "TY": [], "LY": []}
        for division_id in ordered_division_ids:
            year_buckets.setdefault(division_year_by_id.get(division_id, "LY"), []).append(division_id)

        for year_level, division_ids in year_buckets.items():
            shift_name, shift_window = shift_windows.get(year_level, shift_windows["FY"])
            for division_id in division_ids:
                division_shift_assignments[division_id] = (shift_name, shift_window)

        # PASS 2/3/4 planning hooks
        planning_profile = "TY_FIRST"
        planning_signals: list[str] = []
        for pass_name in ("PASS2", "PASS3", "PASS4"):
            llm_trace = self._invoke_llm_hook(
                pass_name,
                {
                    "session_tasks": len(tasks),
                    "lab_parallel_groups": lab_parallel_groups,
                    "note": "Pre-allocation guidance hook",
                },
                llm_hooks_enabled,
            )
            pass_trace.append(
                {
                    "pass": pass_name,
                    "solver": "deterministic",
                    "llm": llm_trace,
                    "gate": {"pass": pass_name, "passed": True, "errors": []},
                }
            )
            if llm_trace.get("llm_status") == "ok" and llm_trace.get("llm_content"):
                planning_signals.append(str(llm_trace.get("llm_content")))

        if planning_signals:
            planning_profile = self._planning_profile_from_llm(planning_signals[-1])
            if planning_profile == "BALANCED":
                # BALANCED ordering can strand a few sessions under tight constraints.
                # Keep LLM hooks active but use a stable deterministic ordering profile.
                planning_profile = "TY_FIRST"

        yield emit_stage(
            {
                "agent": "Curriculum + Faculty + Division Planning Agents",
                "status": "completed",
                "metrics": {
                    "session_tasks": len(tasks),
                    "lab_parallel_groups": lab_parallel_groups,
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

        # Division occupancy is tracked separately for full-division sessions and per-batch sessions.
        # This allows parallel labs for different batches while still preventing invalid overlaps.
        used_division_full_slot: set[tuple[str, int, str]] = set()
        used_division_any_batch_slot: set[tuple[str, int, str]] = set()
        used_division_batch_slot: set[tuple[str, str, int, str]] = set()
        division_slot_lab_subjects: dict[tuple[str, int, str], set[str]] = {}
        used_faculty_slot: set[tuple[str, int, str]] = set()
        used_room_slot: set[tuple[str, int, str]] = set()
        division_day_slots: dict[tuple[str, int], set[str]] = {}
        division_day_slot_orders: dict[tuple[str, int], set[int]] = {}
        # Track theory + lab hours per division per day (8-hour max constraint)
        division_day_theory_lab_hours: dict[tuple[str, int], int] = {}
        # Track theory + lab hours per faculty per day (8-hour max constraint)
        faculty_day_theory_lab_hours: dict[tuple[str, int], int] = {}
        faculty_load_counter: dict[str, int] = {}
        room_usage_counter: dict[str, int] = {}
        faculty_limit: dict[str, int] = {
            row["faculty_id"]: int(row.get("max_load_per_week") or 0) if row.get("max_load_per_week") else 999
            for row in faculty_rows
            if row.get("faculty_id")
        }
        faculty_windows: dict[str, tuple[int | None, int | None]] = {
            str(row["faculty_id"]): (
                _parse_time_to_minutes(row.get("preferred_start_time")),
                _parse_time_to_minutes(row.get("preferred_end_time")),
            )
            for row in faculty_rows
            if row.get("faculty_id")
        }

        allocated_entries: list[dict] = []
        scheduled_task_assignments: dict[str, dict[str, Any]] = {}
        unresolved_task_pool: list[_SessionTask] = []
        unresolved_tasks = 0
        candidate_rejections = 0
        unresolved_task_samples: list[dict[str, Any]] = []
        hour_limit_usage: dict[int, int] = {6: 0}
        # Strict lab parallelization: all batch labs in the same lab-group must share day+slot.
        lab_group_expected_counts: dict[str, int] = {}
        lab_group_faculties: dict[str, set[str]] = {}
        for session_task in tasks:
            if session_task.session_type == "LAB" and session_task.batch_id and session_task.group_id:
                lab_group_expected_counts[session_task.group_id] = lab_group_expected_counts.get(session_task.group_id, 0) + 1
                lab_group_faculties.setdefault(session_task.group_id, set()).add(session_task.faculty_id)
        strict_parallel_lab_groups = {
            group_id
            for group_id, expected_count in lab_group_expected_counts.items()
            if expected_count >= 3 and len(lab_group_faculties.get(group_id, set())) >= 3
        }
        lab_group_slot_binding: dict[str, tuple[int, tuple[str, ...]]] = {}
        required_parallel_labs_by_division: dict[str, int] = {}
        for division_id, batch_ids in batches_by_division.items():
            if len(batch_ids) >= 2:
                required_parallel_labs_by_division[str(division_id)] = len(batch_ids)
        division_slot_parallel_labs: dict[tuple[str, int, str], list[tuple[str, str]]] = {}
        division_daily_hard_limit = 6
        faculty_daily_hard_limit = 12

        def year_rank(value: str) -> int:
            # Prioritize SY to improve under-allocation in second-year divisions.
            return {"SY": 0, "TY": 1, "FY": 2, "LY": 3}.get(value, 4)

        def task_key(task: _SessionTask) -> str:
            # IMPORTANT: group_id is shared across parallel batch-lab siblings by design.
            # Include batch/session identity to avoid overwriting sibling assignments.
            return (
                f"{task.group_id or 'NO_GROUP'}"
                f"|DIV={task.division_id}"
                f"|SUB={task.subject_id}"
                f"|FAC={task.faculty_id}"
                f"|BAT={task.batch_id or 'ALL'}"
                f"|TYP={task.session_type}"
                f"|DUR={task.duration_slots}"
            )

        def shift_rank(shift_name: str) -> int:
            return {"SHIFT_08_15": 0, "SHIFT_10_17": 1, "SHIFT_11_18": 2}.get(shift_name, 3)

        def candidate_start_priority(candidate_slots: list[dict], preferred_window: tuple[int, int] | None) -> tuple[int, int, int]:
            if not candidate_slots:
                return (1, 9999, 9999)
            slot_order = int(candidate_slots[0].get("slot_order") or 0)
            if not preferred_window:
                return (1, 9999, slot_order)

            slot_start = _parse_time_to_minutes(candidate_slots[0].get("start_time")) or 0
            slot_end = _parse_time_to_minutes(candidate_slots[-1].get("end_time")) or 0
            preferred_start, preferred_end = preferred_window
            fits_preferred = int(slot_start >= preferred_start and slot_end <= preferred_end)
            distance = abs(slot_start - preferred_start)
            return (1 - fits_preferred, distance, slot_order)

        def task_priority(task: _SessionTask) -> tuple:
            shift_name, division_window = division_shift_assignments.get(task.division_id, ("SHIFT_08_15", (8 * 60, 15 * 60)))
            if planning_profile == "FY_FIRST":
                year_priority = {"FY": 0, "SY": 1, "TY": 2, "LY": 3}.get(task.year_level, 4)
            else:
                year_priority = year_rank(task.year_level)

            mix_seed = f"{task.division_id}:{task.subject_id}".encode("utf-8")
            subject_mix_bucket = hashlib.sha1(mix_seed).digest()[0] % 2

            if task.session_type == "TUTORIAL":
                session_priority = 2
            elif subject_mix_bucket == 0:
                session_priority = 0 if task.session_type == "THEORY" else 1
            else:
                session_priority = 0 if task.session_type == "LAB" else 1

            return (
                shift_rank(shift_name),
                year_priority,
                subject_mix_bucket,
                session_priority,
                task.division_id,
                task.subject_id,
                task.faculty_id,
                task.batch_id or "",
                seeded_rank(
                    task.division_id,
                    task.subject_id,
                    task.faculty_id,
                    task.batch_id or "",
                    task.session_type,
                ),
            )

        # Schedule divisions strictly in master-data order (FY→SY→TY, then name, then id).
        # Within each division, keep task_priority ordering. Earlier divisions are fully
        # committed to shared resource sets (rooms, faculty, division slots) before any
        # later division is considered, so every new division validates against cumulative
        # occupancy from all prior divisions—not only tasks that happened to sort earlier.
        tasks_by_division: dict[str, list[_SessionTask]] = {}
        for session_task in tasks:
            tasks_by_division.setdefault(str(session_task.division_id), []).append(session_task)

        tasks_ordered: list[_SessionTask] = []
        for division_id in ordered_division_ids:
            div_tasks = tasks_by_division.pop(division_id, [])
            if div_tasks:
                tasks_ordered.extend(sorted(div_tasks, key=task_priority))
        for division_id in sorted(tasks_by_division.keys()):
            div_tasks = tasks_by_division[division_id]
            tasks_ordered.extend(sorted(div_tasks, key=task_priority))

        slot_rows_ordered = sorted(slot_rows, key=lambda slot: int(slot.get("slot_order") or 0))
        slot_order_by_id = {str(slot.get("slot_id")): int(slot.get("slot_order") or 0) for slot in slot_rows_ordered}

        def slot_order_for_window(start_hhmm: str, end_hhmm: str) -> int | None:
            return next(
                (
                    int(slot.get("slot_order") or 0)
                    for slot in slot_rows_ordered
                    if str(slot.get("start_time") or "")[:5] == start_hhmm
                    and str(slot.get("end_time") or "")[:5] == end_hhmm
                ),
                None,
            )

        shift_lunch_slot_order: dict[str, int | None] = {
            "SHIFT_08_15": slot_order_for_window("12:00", "13:00"),
            "SHIFT_10_17": slot_order_for_window("12:00", "13:00"),
            "SHIFT_11_18": slot_order_for_window("13:00", "14:00"),
        }

        def select_rooms_for_block(room_candidates: list[dict], day_id: int, slot_ids: list[str], room_count: int) -> list[str]:
            available = [
                room
                for room in room_candidates
                if all((str(room["room_id"]), day_id, slot_id) not in used_room_slot for slot_id in slot_ids)
            ]
            if not available:
                return []
            available.sort(
                key=lambda room: (
                    room_usage_counter.get(str(room["room_id"]), 0),
                    seeded_rank(str(room["room_id"]), day_id, ",".join(slot_ids)),
                    str(room.get("room_number") or room["room_id"]),
                )
            )
            return [str(room["room_id"]) for room in available[:room_count]]

        # Hard cap for 6-hour shift model: at most 6 occupied teaching slots per day.
        max_sessions_per_day = 6

        for task in tasks_ordered:
            scheduled = False
            room_candidates = (lab_rooms + theory_rooms) if task.session_type == "LAB" else theory_rooms
            preferred_shift_name, preferred_shift_window = division_shift_assignments.get(
                task.division_id,
                ("SHIFT_08_15", (8 * 60, 15 * 60)),
            )
            preferred_lunch_slot_order = shift_lunch_slot_order.get(preferred_shift_name)
            lab_group_id = (
                task.group_id
                if task.session_type == "LAB"
                and task.batch_id
                and task.group_id
                and task.group_id in strict_parallel_lab_groups
                else None
            )

            task_duration = max(task.duration_slots, 1)
            group_size = 1
            for current_hour_limit in (division_daily_hard_limit,):
                for day in sorted(
                    day_rows,
                    key=lambda row: seeded_rank(
                        task.division_id,
                        task.subject_id,
                        task.faculty_id,
                        task.batch_id or "",
                        row.get("day_id"),
                    ),
                ):
                    day_id = int(day["day_id"])
                    candidate_start_indices = sorted(
                        range(len(slot_rows_ordered)),
                        key=lambda start_index: candidate_start_priority(
                            slot_rows_ordered[start_index : start_index + task_duration],
                            preferred_shift_window,
                        )
                        + (
                            seeded_rank(task.division_id, task.subject_id, day_id, start_index, task.batch_id or ""),
                        ),
                    )

                    for start_index in candidate_start_indices:
                        candidate_slots = slot_rows_ordered[start_index : start_index + task_duration]
                        if len(candidate_slots) != task_duration:
                            continue

                        # Hard window check: every scheduled session must stay inside the
                        # assigned six-hour shift block for the division.
                        if task.session_type != "TUTORIAL" and not _block_within_window(candidate_slots, preferred_shift_window):
                            candidate_rejections += 1
                            continue

                        # Multi-hour sessions require contiguous slots.
                        if any(
                            int(candidate_slots[i + 1].get("slot_order") or 0) - int(candidate_slots[i].get("slot_order") or 0) != 1
                            for i in range(len(candidate_slots) - 1)
                        ):
                            continue

                        slot_ids = [str(item["slot_id"]) for item in candidate_slots]
                        full_div_keys = [(task.division_id, day_id, slot_id) for slot_id in slot_ids]
                        batch_div_keys = [
                            (task.division_id, str(task.batch_id), day_id, slot_id)
                            for slot_id in slot_ids
                        ]
                        fac_keys = [(task.faculty_id, day_id, slot_id) for slot_id in slot_ids]
                        day_key = (task.division_id, day_id)
                        occupied = division_day_slots.setdefault(day_key, set())
                        occupied_orders = division_day_slot_orders.setdefault(day_key, set())

                        if task.batch_id:
                            # Batch-scoped sessions can overlap with other batches, but not with
                            # full-division sessions or the same batch at the same slot.
                            if any(div_key in used_division_full_slot for div_key in full_div_keys):
                                candidate_rejections += 1
                                continue
                            if any(batch_key in used_division_batch_slot for batch_key in batch_div_keys):
                                candidate_rejections += 1
                                continue

                            # Encourage practical lab rotation: avoid assigning the same lab subject
                            # to multiple batches of the same division at the same time.
                            if task.session_type == "LAB" and not lab_group_id:
                                duplicate_lab_subject = False
                                for slot_id in slot_ids:
                                    key = (task.division_id, day_id, slot_id)
                                    subject_set = division_slot_lab_subjects.get(key, set())
                                    if task.subject_id in subject_set:
                                        duplicate_lab_subject = True
                                        break
                                if duplicate_lab_subject:
                                    candidate_rejections += 1
                                    continue

                            required_parallel = required_parallel_labs_by_division.get(task.division_id)
                            if task.session_type == "LAB" and required_parallel:
                                invalid_parallel_window = False
                                opening_new_parallel_window = True
                                for slot_id in slot_ids:
                                    parallel_key = (task.division_id, day_id, slot_id)
                                    current_entries = division_slot_parallel_labs.get(parallel_key, [])
                                    current_batches = {entry[0] for entry in current_entries}
                                    current_subjects = {entry[1] for entry in current_entries}
                                    if str(task.batch_id) in current_batches:
                                        invalid_parallel_window = True
                                        break
                                    # Same-subject labs across different batches are valid and expected
                                    # for strict parallel batch-lab packing.
                                    if len(current_entries) >= required_parallel:
                                        invalid_parallel_window = True
                                        break
                                    if current_entries:
                                        opening_new_parallel_window = False

                                if invalid_parallel_window:
                                    candidate_rejections += 1
                                    continue

                                incomplete_window_exists = any(
                                    key[0] == task.division_id
                                    and key[1] == day_id
                                    and 0 < len(entries) < required_parallel
                                    for key, entries in division_slot_parallel_labs.items()
                                )
                                if incomplete_window_exists and opening_new_parallel_window:
                                    candidate_rejections += 1
                                    continue
                        else:
                            # Full-division sessions cannot overlap with any existing full-division
                            # session or any batch session in that slot.
                            if any(div_key in used_division_full_slot for div_key in full_div_keys):
                                candidate_rejections += 1
                                continue
                            if any(div_key in used_division_any_batch_slot for div_key in full_div_keys):
                                candidate_rejections += 1
                                continue

                        new_slot_count = sum(1 for slot_id in slot_ids if slot_id not in occupied)
                        if task.session_type != "TUTORIAL" and len(occupied) + new_slot_count > max_sessions_per_day:
                            candidate_rejections += 1
                            continue

                        candidate_orders = {slot_order_by_id.get(slot_id, 0) for slot_id in slot_ids}
                        proposed_orders = set(occupied_orders)
                        proposed_orders.update(candidate_orders)
                        if task.session_type != "TUTORIAL" and not _is_gapless_day_pattern(proposed_orders, preferred_lunch_slot_order):
                            candidate_rejections += 1
                            continue

                        if any(fac_key in used_faculty_slot for fac_key in fac_keys):
                            candidate_rejections += 1
                            continue

                        # Prefer 8-hour day load, then fallback to 9/10 only when needed.
                        session_is_theory_or_lab = task.session_type in ("THEORY", "LAB")
                        if session_is_theory_or_lab:
                            div_day_key = (task.division_id, day_id)
                            current_div_hours = division_day_theory_lab_hours.get(div_day_key, 0)
                            if current_div_hours + task_duration > current_hour_limit:
                                candidate_rejections += 1
                                continue

                            fac_day_key = (task.faculty_id, day_id)
                            current_fac_hours = faculty_day_theory_lab_hours.get(fac_day_key, 0)
                            if current_fac_hours + task_duration > faculty_daily_hard_limit:
                                candidate_rejections += 1
                                continue

                        if lab_group_id:
                            bound_slot = lab_group_slot_binding.get(lab_group_id)
                            if bound_slot:
                                bound_day_id, bound_slot_ids = bound_slot
                                if day_id != bound_day_id or tuple(slot_ids) != bound_slot_ids:
                                    candidate_rejections += 1
                                    continue
                            else:
                                required_rooms = lab_group_expected_counts.get(lab_group_id, 1)
                                precheck_room_ids = select_rooms_for_block(room_candidates, day_id, slot_ids, required_rooms)
                                if len(precheck_room_ids) < required_rooms:
                                    candidate_rejections += 1
                                    continue

                        selected_room_ids = select_rooms_for_block(room_candidates, day_id, slot_ids, group_size)
                        if len(selected_room_ids) < group_size:
                            candidate_rejections += 1
                            continue

                        selected_room_id = selected_room_ids[0]
                        for slot_id in slot_ids:
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
                            used_room_slot.add((selected_room_id, day_id, slot_id))
                            if task.batch_id:
                                used_division_batch_slot.add((task.division_id, str(task.batch_id), day_id, slot_id))
                                used_division_any_batch_slot.add((task.division_id, day_id, slot_id))
                                if task.session_type == "LAB":
                                    key = (task.division_id, day_id, slot_id)
                                    division_slot_lab_subjects.setdefault(key, set()).add(task.subject_id)
                                    parallel_key = (task.division_id, day_id, slot_id)
                                    division_slot_parallel_labs.setdefault(parallel_key, []).append((str(task.batch_id), task.subject_id))
                            else:
                                used_division_full_slot.add((task.division_id, day_id, slot_id))
                            used_faculty_slot.add((task.faculty_id, day_id, slot_id))
                            if task.session_type != "TUTORIAL":
                                occupied.add(slot_id)
                                occupied_orders.add(slot_order_by_id.get(slot_id, 0))
                        if lab_group_id:
                            lab_group_slot_binding.setdefault(lab_group_id, (day_id, tuple(slot_ids)))
                        room_usage_counter[selected_room_id] = room_usage_counter.get(selected_room_id, 0) + task_duration
                        faculty_load_counter[task.faculty_id] = faculty_load_counter.get(task.faculty_id, 0) + task_duration

                        if task.session_type in ("THEORY", "LAB"):
                            div_day_key = (task.division_id, day_id)
                            division_day_theory_lab_hours[div_day_key] = division_day_theory_lab_hours.get(div_day_key, 0) + task_duration

                            fac_day_key = (task.faculty_id, day_id)
                            faculty_day_theory_lab_hours[fac_day_key] = faculty_day_theory_lab_hours.get(fac_day_key, 0) + task_duration
                            hour_limit_usage[current_hour_limit] += 1

                        scheduled_task_assignments[task_key(task)] = {
                            "task": task,
                            "day_id": day_id,
                            "slot_ids": list(slot_ids),
                            "room_id": selected_room_id,
                        }

                        scheduled = True
                        break

                    if scheduled:
                        break

                if scheduled:
                    break

            if not scheduled:
                # Last-resort fallback: relax only gapless-day pattern for this task
                # while preserving room/faculty/division conflict checks and 10-hour hard cap.
                room_candidates = lab_rooms if task.session_type == "LAB" else theory_rooms
                for day in sorted(
                    day_rows,
                    key=lambda row: seeded_rank(
                        task.division_id,
                        task.subject_id,
                        task.faculty_id,
                        task.batch_id or "",
                        "fallback",
                        row.get("day_id"),
                    ),
                ):
                    day_id = int(day["day_id"])
                    candidate_start_indices = sorted(
                        range(len(slot_rows_ordered)),
                        key=lambda start_index: candidate_start_priority(
                            slot_rows_ordered[start_index : start_index + task_duration],
                            preferred_shift_window,
                        )
                        + (
                            seeded_rank(task.division_id, task.subject_id, day_id, "fallback", start_index, task.batch_id or ""),
                        ),
                    )

                    for start_index in candidate_start_indices:
                        candidate_slots = slot_rows_ordered[start_index : start_index + task_duration]
                        if len(candidate_slots) != task_duration:
                            continue

                        if task.session_type != "TUTORIAL" and not _block_within_window(candidate_slots, preferred_shift_window):
                            continue

                        if any(
                            int(candidate_slots[i + 1].get("slot_order") or 0) - int(candidate_slots[i].get("slot_order") or 0) != 1
                            for i in range(len(candidate_slots) - 1)
                        ):
                            continue

                        slot_ids = [str(item["slot_id"]) for item in candidate_slots]
                        full_div_keys = [(task.division_id, day_id, slot_id) for slot_id in slot_ids]
                        batch_div_keys = [
                            (task.division_id, str(task.batch_id), day_id, slot_id)
                            for slot_id in slot_ids
                        ]
                        fac_keys = [(task.faculty_id, day_id, slot_id) for slot_id in slot_ids]
                        day_key = (task.division_id, day_id)
                        occupied = division_day_slots.setdefault(day_key, set())
                        occupied_orders = division_day_slot_orders.setdefault(day_key, set())

                        if task.batch_id:
                            if any(div_key in used_division_full_slot for div_key in full_div_keys):
                                continue
                            if any(batch_key in used_division_batch_slot for batch_key in batch_div_keys):
                                continue

                            required_parallel = required_parallel_labs_by_division.get(task.division_id)
                            if task.session_type == "LAB" and required_parallel:
                                invalid_parallel_window = False
                                opening_new_parallel_window = True
                                for slot_id in slot_ids:
                                    parallel_key = (task.division_id, day_id, slot_id)
                                    current_entries = division_slot_parallel_labs.get(parallel_key, [])
                                    current_batches = {entry[0] for entry in current_entries}
                                    current_subjects = {entry[1] for entry in current_entries}
                                    if str(task.batch_id) in current_batches:
                                        invalid_parallel_window = True
                                        break
                                    # Same-subject labs across different batches are valid and expected
                                    # for strict parallel batch-lab packing.
                                    if len(current_entries) >= required_parallel:
                                        invalid_parallel_window = True
                                        break
                                    if current_entries:
                                        opening_new_parallel_window = False
                                if invalid_parallel_window:
                                    continue

                                incomplete_window_exists = any(
                                    key[0] == task.division_id
                                    and key[1] == day_id
                                    and 0 < len(entries) < required_parallel
                                    for key, entries in division_slot_parallel_labs.items()
                                )
                                if incomplete_window_exists and opening_new_parallel_window:
                                    continue
                        else:
                            if any(div_key in used_division_full_slot for div_key in full_div_keys):
                                continue
                            if any(div_key in used_division_any_batch_slot for div_key in full_div_keys):
                                continue

                        new_slot_count = sum(1 for slot_id in slot_ids if slot_id not in occupied)
                        if task.session_type != "TUTORIAL" and len(occupied) + new_slot_count > max_sessions_per_day:
                            continue

                        if any(fac_key in used_faculty_slot for fac_key in fac_keys):
                            continue

                        if task.session_type in ("THEORY", "LAB"):
                            hard_limit = current_hour_limit
                            div_day_key = (task.division_id, day_id)
                            current_div_hours = division_day_theory_lab_hours.get(div_day_key, 0)
                            if current_div_hours + task_duration > hard_limit:
                                continue

                            fac_day_key = (task.faculty_id, day_id)
                            current_fac_hours = faculty_day_theory_lab_hours.get(fac_day_key, 0)
                            if current_fac_hours + task_duration > faculty_daily_hard_limit:
                                continue

                        if lab_group_id:
                            bound_slot = lab_group_slot_binding.get(lab_group_id)
                            if bound_slot:
                                bound_day_id, bound_slot_ids = bound_slot
                                if day_id != bound_day_id or tuple(slot_ids) != bound_slot_ids:
                                    continue
                            else:
                                required_rooms = lab_group_expected_counts.get(lab_group_id, 1)
                                precheck_room_ids = select_rooms_for_block(room_candidates, day_id, slot_ids, required_rooms)
                                if len(precheck_room_ids) < required_rooms:
                                    continue

                        selected_room_ids = select_rooms_for_block(room_candidates, day_id, slot_ids, group_size)
                        if len(selected_room_ids) < group_size:
                            continue

                        selected_room_id = selected_room_ids[0]
                        for slot_id in slot_ids:
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
                            used_room_slot.add((selected_room_id, day_id, slot_id))
                            if task.batch_id:
                                used_division_batch_slot.add((task.division_id, str(task.batch_id), day_id, slot_id))
                                used_division_any_batch_slot.add((task.division_id, day_id, slot_id))
                                if task.session_type == "LAB":
                                    key = (task.division_id, day_id, slot_id)
                                    division_slot_lab_subjects.setdefault(key, set()).add(task.subject_id)
                                    parallel_key = (task.division_id, day_id, slot_id)
                                    division_slot_parallel_labs.setdefault(parallel_key, []).append((str(task.batch_id), task.subject_id))
                            else:
                                used_division_full_slot.add((task.division_id, day_id, slot_id))
                            used_faculty_slot.add((task.faculty_id, day_id, slot_id))
                            if task.session_type != "TUTORIAL":
                                occupied.add(slot_id)
                                occupied_orders.add(slot_order_by_id.get(slot_id, 0))
                        if lab_group_id:
                            lab_group_slot_binding.setdefault(lab_group_id, (day_id, tuple(slot_ids)))

                        room_usage_counter[selected_room_id] = room_usage_counter.get(selected_room_id, 0) + task_duration
                        faculty_load_counter[task.faculty_id] = faculty_load_counter.get(task.faculty_id, 0) + task_duration

                        if task.session_type in ("THEORY", "LAB"):
                            div_day_key = (task.division_id, day_id)
                            division_day_theory_lab_hours[div_day_key] = division_day_theory_lab_hours.get(div_day_key, 0) + task_duration
                            fac_day_key = (task.faculty_id, day_id)
                            faculty_day_theory_lab_hours[fac_day_key] = faculty_day_theory_lab_hours.get(fac_day_key, 0) + task_duration
                            hour_limit_usage[hard_limit] = hour_limit_usage.get(hard_limit, 0) + 1

                        scheduled_task_assignments[task_key(task)] = {
                            "task": task,
                            "day_id": day_id,
                            "slot_ids": list(slot_ids),
                            "room_id": selected_room_id,
                        }

                        scheduled = True
                        break

                    if scheduled:
                        break

            if not scheduled:
                unresolved_task_pool.append(task)
                unresolved_tasks += 1
                if len(unresolved_task_samples) < 20:
                    unresolved_task_samples.append(
                        {
                            "division_id": task.division_id,
                            "faculty_id": task.faculty_id,
                            "subject_id": task.subject_id,
                            "batch_id": task.batch_id,
                            "session_type": task.session_type,
                            "reason": "no_feasible_slot",
                        }
                    )

        slot_row_by_id = {str(slot.get("slot_id")): slot for slot in slot_rows_ordered}

        def _remove_assignment(assignment: dict[str, Any]) -> None:
            task: _SessionTask = assignment["task"]
            day_id = int(assignment["day_id"])
            slot_ids = [str(slot_id) for slot_id in assignment["slot_ids"]]
            room_id = str(assignment["room_id"])
            key = task_key(task)

            for slot_id in slot_ids:
                used_room_slot.discard((room_id, day_id, slot_id))
                used_faculty_slot.discard((task.faculty_id, day_id, slot_id))
                if task.batch_id:
                    used_division_batch_slot.discard((task.division_id, str(task.batch_id), day_id, slot_id))
                    used_division_any_batch_slot.discard((task.division_id, day_id, slot_id))
                    if task.session_type == "LAB":
                        subject_key = (task.division_id, day_id, slot_id)
                        subject_set = division_slot_lab_subjects.get(subject_key)
                        if subject_set:
                            subject_set.discard(task.subject_id)
                            if not subject_set:
                                division_slot_lab_subjects.pop(subject_key, None)

                        parallel_key = (task.division_id, day_id, slot_id)
                        entries = division_slot_parallel_labs.get(parallel_key, [])
                        entries = [entry for entry in entries if not (entry[0] == str(task.batch_id) and entry[1] == task.subject_id)]
                        if entries:
                            division_slot_parallel_labs[parallel_key] = entries
                        else:
                            division_slot_parallel_labs.pop(parallel_key, None)
                else:
                    used_division_full_slot.discard((task.division_id, day_id, slot_id))

                if task.session_type != "TUTORIAL":
                    day_key = (task.division_id, day_id)
                    occupied = division_day_slots.get(day_key)
                    if occupied:
                        occupied.discard(slot_id)
                        if not occupied:
                            division_day_slots.pop(day_key, None)

                    occupied_orders = division_day_slot_orders.get(day_key)
                    if occupied_orders:
                        occupied_orders.discard(slot_order_by_id.get(slot_id, 0))
                        if not occupied_orders:
                            division_day_slot_orders.pop(day_key, None)

            room_usage_counter[room_id] = max(room_usage_counter.get(room_id, 0) - len(slot_ids), 0)
            faculty_load_counter[task.faculty_id] = max(faculty_load_counter.get(task.faculty_id, 0) - len(slot_ids), 0)

            if task.session_type in ("THEORY", "LAB"):
                div_day_key = (task.division_id, day_id)
                faculty_day_key = (task.faculty_id, day_id)
                division_day_theory_lab_hours[div_day_key] = max(division_day_theory_lab_hours.get(div_day_key, 0) - len(slot_ids), 0)
                faculty_day_theory_lab_hours[faculty_day_key] = max(faculty_day_theory_lab_hours.get(faculty_day_key, 0) - len(slot_ids), 0)

            if task.group_id and task.group_id in lab_group_slot_binding:
                bound_day, bound_slots = lab_group_slot_binding.get(task.group_id, (None, tuple()))
                if bound_day == day_id and tuple(slot_ids) == tuple(bound_slots):
                    still_bound = any(
                        existing["task"].group_id == task.group_id
                        for existing in scheduled_task_assignments.values()
                        if existing["task"].group_id != task.group_id or task_key(existing["task"]) != key
                    )
                    if not still_bound:
                        lab_group_slot_binding.pop(task.group_id, None)

            scheduled_task_assignments.pop(key, None)

        def _can_place(
            task: _SessionTask,
            day_id: int,
            slot_ids: list[str],
            room_id: str,
            *,
            relax_gapless: bool = False,
            relax_parallel_gate: bool = False,
            relax_division_daily: bool = False,
            relax_shift_window: bool = False,
            relax_parallel_binding: bool = False,
            relax_faculty_daily: bool = False,
            relax_daily_slot_cap: bool = False,
        ) -> bool:
            candidate_slots = [slot_row_by_id.get(slot_id) for slot_id in slot_ids]
            if any(slot is None for slot in candidate_slots):
                return False

            if task.session_type != "TUTORIAL":
                _, preferred_shift_window = division_shift_assignments.get(task.division_id, ("SHIFT_08_15", (8 * 60, 15 * 60)))
                if not relax_shift_window and not _block_within_window([slot for slot in candidate_slots if slot], preferred_shift_window):
                    return False

            if any(
                int(candidate_slots[idx + 1].get("slot_order") or 0) - int(candidate_slots[idx].get("slot_order") or 0) != 1
                for idx in range(len(candidate_slots) - 1)
            ):
                return False

            full_div_keys = [(task.division_id, day_id, slot_id) for slot_id in slot_ids]
            batch_div_keys = [(task.division_id, str(task.batch_id), day_id, slot_id) for slot_id in slot_ids]
            fac_keys = [(task.faculty_id, day_id, slot_id) for slot_id in slot_ids]

            if task.batch_id:
                if any(div_key in used_division_full_slot for div_key in full_div_keys):
                    return False
                if any(batch_key in used_division_batch_slot for batch_key in batch_div_keys):
                    return False
            else:
                if any(div_key in used_division_full_slot for div_key in full_div_keys):
                    return False
                if any(div_key in used_division_any_batch_slot for div_key in full_div_keys):
                    return False

            if any(fac_key in used_faculty_slot for fac_key in fac_keys):
                return False
            if any((room_id, day_id, slot_id) in used_room_slot for slot_id in slot_ids):
                return False

            day_key = (task.division_id, day_id)
            occupied = division_day_slots.setdefault(day_key, set())
            occupied_orders = division_day_slot_orders.setdefault(day_key, set())
            if task.session_type != "TUTORIAL":
                new_slot_count = sum(1 for slot_id in slot_ids if slot_id not in occupied)
                daily_slot_cap = max_sessions_per_day + 2 if relax_daily_slot_cap else max_sessions_per_day
                if len(occupied) + new_slot_count > daily_slot_cap:
                    return False

                proposed_orders = set(occupied_orders)
                proposed_orders.update(slot_order_by_id.get(slot_id, 0) for slot_id in slot_ids)
                shift_name, _ = division_shift_assignments.get(task.division_id, ("SHIFT_08_15", (8 * 60, 15 * 60)))
                lunch_slot = shift_lunch_slot_order.get(shift_name)
                if not relax_gapless and not _is_gapless_day_pattern(proposed_orders, lunch_slot):
                    return False

            if task.session_type in ("THEORY", "LAB"):
                division_limit = division_daily_hard_limit + 2 if relax_division_daily else division_daily_hard_limit
                if division_day_theory_lab_hours.get((task.division_id, day_id), 0) + len(slot_ids) > division_limit:
                    return False
                faculty_limit = 999 if relax_faculty_daily else faculty_daily_hard_limit
                if faculty_day_theory_lab_hours.get((task.faculty_id, day_id), 0) + len(slot_ids) > faculty_limit:
                    return False

            if task.session_type == "LAB" and task.batch_id:
                required_parallel = required_parallel_labs_by_division.get(task.division_id)
                if required_parallel:
                    opening_new_parallel_window = True
                    for slot_id in slot_ids:
                        parallel_key = (task.division_id, day_id, slot_id)
                        current_entries = division_slot_parallel_labs.get(parallel_key, [])
                        current_batches = {entry[0] for entry in current_entries}
                        if str(task.batch_id) in current_batches:
                            return False
                        if len(current_entries) >= required_parallel:
                            return False
                        if current_entries:
                            opening_new_parallel_window = False

                    incomplete_window_exists = any(
                        key[0] == task.division_id and key[1] == day_id and 0 < len(entries) < required_parallel
                        for key, entries in division_slot_parallel_labs.items()
                    )
                    if not relax_parallel_gate and incomplete_window_exists and opening_new_parallel_window:
                        return False

            if task.group_id and task.group_id in strict_parallel_lab_groups:
                bound_slot = lab_group_slot_binding.get(task.group_id)
                if bound_slot:
                    bound_day_id, bound_slot_ids = bound_slot
                    if not relax_parallel_binding and day_id != bound_day_id:
                        return False
                    if not relax_parallel_binding and tuple(slot_ids) != tuple(bound_slot_ids):
                        return False

            return True

        def _apply_assignment(task: _SessionTask, day_id: int, slot_ids: list[str], room_id: str) -> None:
            for slot_id in slot_ids:
                used_room_slot.add((room_id, day_id, slot_id))
                used_faculty_slot.add((task.faculty_id, day_id, slot_id))
                if task.batch_id:
                    used_division_batch_slot.add((task.division_id, str(task.batch_id), day_id, slot_id))
                    used_division_any_batch_slot.add((task.division_id, day_id, slot_id))
                    if task.session_type == "LAB":
                        subject_key = (task.division_id, day_id, slot_id)
                        division_slot_lab_subjects.setdefault(subject_key, set()).add(task.subject_id)
                        parallel_key = (task.division_id, day_id, slot_id)
                        division_slot_parallel_labs.setdefault(parallel_key, []).append((str(task.batch_id), task.subject_id))
                else:
                    used_division_full_slot.add((task.division_id, day_id, slot_id))

                if task.session_type != "TUTORIAL":
                    day_key = (task.division_id, day_id)
                    division_day_slots.setdefault(day_key, set()).add(slot_id)
                    division_day_slot_orders.setdefault(day_key, set()).add(slot_order_by_id.get(slot_id, 0))

            room_usage_counter[room_id] = room_usage_counter.get(room_id, 0) + len(slot_ids)
            faculty_load_counter[task.faculty_id] = faculty_load_counter.get(task.faculty_id, 0) + len(slot_ids)
            if task.session_type in ("THEORY", "LAB"):
                division_day_theory_lab_hours[(task.division_id, day_id)] = division_day_theory_lab_hours.get((task.division_id, day_id), 0) + len(slot_ids)
                faculty_day_theory_lab_hours[(task.faculty_id, day_id)] = faculty_day_theory_lab_hours.get((task.faculty_id, day_id), 0) + len(slot_ids)

            if task.group_id and task.group_id in strict_parallel_lab_groups:
                lab_group_slot_binding.setdefault(task.group_id, (day_id, tuple(slot_ids)))

            scheduled_task_assignments[task_key(task)] = {
                "task": task,
                "day_id": day_id,
                "slot_ids": list(slot_ids),
                "room_id": room_id,
            }

        def _candidate_options(
            task: _SessionTask,
            max_options: int = 32,
            seed: int = 0,
            *,
            relax_gapless: bool = False,
            relax_parallel_gate: bool = False,
            relax_division_daily: bool = False,
            relax_shift_window: bool = False,
            relax_parallel_binding: bool = False,
            relax_room_pool: bool = False,
            relax_faculty_daily: bool = False,
            relax_daily_slot_cap: bool = False,
        ) -> list[tuple[int, list[str], str]]:
            options: list[tuple[int, list[str], str]] = []
            if relax_room_pool:
                room_pool = list({str(room["room_id"]): room for room in (lab_rooms + theory_rooms)}.values())
            else:
                room_pool = lab_rooms if task.session_type == "LAB" else theory_rooms
            _, preferred_shift_window = division_shift_assignments.get(task.division_id, ("SHIFT_08_15", (8 * 60, 15 * 60)))
            task_duration = max(task.duration_slots, 1)
            for day in day_rows:
                day_id = int(day["day_id"])
                for start_index in range(len(slot_rows_ordered) - task_duration + 1):
                    candidate_slots = slot_rows_ordered[start_index : start_index + task_duration]
                    slot_ids = [str(item["slot_id"]) for item in candidate_slots]
                    if task.session_type != "TUTORIAL" and not _block_within_window(candidate_slots, preferred_shift_window):
                        continue

                    room_ids = select_rooms_for_block(room_pool, day_id, slot_ids, 1)
                    for room_id in room_ids:
                        if _can_place(
                            task,
                            day_id,
                            slot_ids,
                            room_id,
                            relax_gapless=relax_gapless,
                            relax_parallel_gate=relax_parallel_gate,
                            relax_division_daily=relax_division_daily,
                            relax_shift_window=relax_shift_window,
                            relax_parallel_binding=relax_parallel_binding,
                            relax_faculty_daily=relax_faculty_daily,
                            relax_daily_slot_cap=relax_daily_slot_cap,
                        ):
                            options.append((day_id, slot_ids, room_id))

            def option_rank(option: tuple[int, list[str], str]) -> tuple[int, int, int, int]:
                option_day, option_slots, option_room = option
                # Prefer completing existing parallel-lab windows to reduce deadlocks.
                parallel_fill = 0
                if task.session_type == "LAB" and task.batch_id:
                    required_parallel = required_parallel_labs_by_division.get(task.division_id)
                    if required_parallel:
                        for option_slot in option_slots:
                            entries = division_slot_parallel_labs.get((task.division_id, option_day, option_slot), [])
                            if 0 < len(entries) < required_parallel:
                                parallel_fill += 1

                day_load = len(division_day_slots.get((task.division_id, option_day), set()))
                first_order = slot_order_by_id.get(str(option_slots[0]), 9999)
                tie = seeded_rank(task_key(task), option_day, ",".join(option_slots), option_room, seed)
                return (-parallel_fill, day_load, first_order, tie)

            options.sort(key=option_rank)
            return options[:max_options]

        def _repair_parallel_deadlocks() -> int:
            repaired = 0
            deadlock_keys = [
                key
                for key, entries in division_slot_parallel_labs.items()
                if 0 < len(entries) < required_parallel_labs_by_division.get(key[0], 0)
            ]

            for division_id, day_id, slot_id in deadlock_keys:
                affected_assignments = [
                    assignment
                    for assignment in list(scheduled_task_assignments.values())
                    if assignment["task"].division_id == division_id
                    and assignment["task"].session_type == "LAB"
                    and int(assignment["day_id"]) == int(day_id)
                    and slot_id in assignment["slot_ids"]
                ]
                if not affected_assignments:
                    continue

                original_payload = [
                    {
                        "task": entry["task"],
                        "day_id": entry["day_id"],
                        "slot_ids": list(entry["slot_ids"]),
                        "room_id": entry["room_id"],
                    }
                    for entry in affected_assignments
                ]

                for entry in affected_assignments:
                    _remove_assignment(entry)

                resolved = True
                for entry in sorted(original_payload, key=lambda item: item["task"].faculty_id):
                    options = _candidate_options(entry["task"], max_options=10)
                    if not options:
                        resolved = False
                        break
                    selected_day, selected_slots, selected_room = options[0]
                    _apply_assignment(entry["task"], selected_day, selected_slots, selected_room)

                if resolved:
                    repaired += len(original_payload)
                    continue

                for entry in original_payload:
                    if task_key(entry["task"]) in scheduled_task_assignments:
                        _remove_assignment(scheduled_task_assignments[task_key(entry["task"])])
                for entry in original_payload:
                    _apply_assignment(entry["task"], int(entry["day_id"]), list(entry["slot_ids"]), str(entry["room_id"]))

            return repaired

        def _place_unresolved_backtracking(
            pending: list[_SessionTask],
            depth: int = 0,
            limit: int = 96,
            option_cap: int = 24,
            seed: int = 0,
            relax_gapless: bool = False,
            relax_parallel_gate: bool = False,
            relax_division_daily: bool = False,
            relax_shift_window: bool = False,
            relax_parallel_binding: bool = False,
            relax_room_pool: bool = False,
            relax_faculty_daily: bool = False,
            relax_daily_slot_cap: bool = False,
        ) -> bool:
            if not pending:
                return True
            if depth >= limit:
                return False

            scheduled_by_division: dict[str, int] = {}
            requested_by_division: dict[str, int] = {}
            for requested_task in tasks:
                requested_by_division[requested_task.division_id] = requested_by_division.get(requested_task.division_id, 0) + 1
            for assignment in scheduled_task_assignments.values():
                div_id = assignment["task"].division_id
                scheduled_by_division[div_id] = scheduled_by_division.get(div_id, 0) + 1

            def pending_rank(item: _SessionTask) -> tuple[int, int, int]:
                candidate_count = len(
                    _candidate_options(
                        item,
                        max_options=option_cap,
                        seed=seed + depth,
                        relax_gapless=relax_gapless,
                        relax_parallel_gate=relax_parallel_gate,
                        relax_division_daily=relax_division_daily,
                        relax_shift_window=relax_shift_window,
                        relax_parallel_binding=relax_parallel_binding,
                        relax_room_pool=relax_room_pool,
                        relax_faculty_daily=relax_faculty_daily,
                        relax_daily_slot_cap=relax_daily_slot_cap,
                    )
                )
                division_deficit = requested_by_division.get(item.division_id, 0) - scheduled_by_division.get(item.division_id, 0)
                year_priority = 0 if item.year_level == "TY" else 1
                return (year_priority, -division_deficit, candidate_count)

            pending_sorted = sorted(pending, key=pending_rank)
            current = pending_sorted[0]
            remainder = pending_sorted[1:]
            options = _candidate_options(
                current,
                max_options=option_cap,
                seed=seed + depth,
                relax_gapless=relax_gapless,
                relax_parallel_gate=relax_parallel_gate,
                relax_division_daily=relax_division_daily,
                relax_shift_window=relax_shift_window,
                relax_parallel_binding=relax_parallel_binding,
                relax_room_pool=relax_room_pool,
                relax_faculty_daily=relax_faculty_daily,
                relax_daily_slot_cap=relax_daily_slot_cap,
            )
            if not options:
                return False

            for day_id, slot_ids, room_id in options:
                _apply_assignment(current, day_id, slot_ids, room_id)
                if _place_unresolved_backtracking(
                    remainder,
                    depth + 1,
                    limit,
                    option_cap,
                    seed,
                    relax_gapless=relax_gapless,
                    relax_parallel_gate=relax_parallel_gate,
                    relax_division_daily=relax_division_daily,
                    relax_shift_window=relax_shift_window,
                    relax_parallel_binding=relax_parallel_binding,
                    relax_room_pool=relax_room_pool,
                    relax_faculty_daily=relax_faculty_daily,
                    relax_daily_slot_cap=relax_daily_slot_cap,
                ):
                    return True
                current_assignment = scheduled_task_assignments.get(task_key(current))
                if current_assignment:
                    _remove_assignment(current_assignment)
            return False

        def _multi_attempt_backtracking(
            pending: list[_SessionTask],
            attempts: int,
            limit: int,
            option_cap: int,
            *,
            relax_gapless: bool = False,
            relax_parallel_gate: bool = False,
            relax_division_daily: bool = False,
            relax_shift_window: bool = False,
            relax_parallel_binding: bool = False,
            relax_room_pool: bool = False,
            relax_faculty_daily: bool = False,
            relax_daily_slot_cap: bool = False,
        ) -> bool:
            if not pending:
                return True
            for attempt in range(attempts):
                if _place_unresolved_backtracking(
                    pending,
                    depth=0,
                    limit=limit,
                    option_cap=option_cap,
                    seed=attempt + 1,
                    relax_gapless=relax_gapless,
                    relax_parallel_gate=relax_parallel_gate,
                    relax_division_daily=relax_division_daily,
                    relax_shift_window=relax_shift_window,
                    relax_parallel_binding=relax_parallel_binding,
                    relax_room_pool=relax_room_pool,
                    relax_faculty_daily=relax_faculty_daily,
                    relax_daily_slot_cap=relax_daily_slot_cap,
                ):
                    return True
            return False

        def _snapshot_assignment(entry: dict[str, Any]) -> dict[str, Any]:
            return {
                "task": entry["task"],
                "day_id": int(entry["day_id"]),
                "slot_ids": [str(slot_id) for slot_id in entry["slot_ids"]],
                "room_id": str(entry["room_id"]),
            }

        def _repack_with_movable(max_movable: int, include_theory: bool, include_labs: bool) -> int:
            unresolved_now = [task for task in tasks if task_key(task) not in scheduled_task_assignments]
            if not unresolved_now:
                return 0

            before_count = len(scheduled_task_assignments)

            movable_candidates = []
            for assignment in scheduled_task_assignments.values():
                task = assignment["task"]
                if task.session_type == "TUTORIAL":
                    movable_candidates.append(assignment)
                elif include_theory and task.session_type == "THEORY":
                    movable_candidates.append(assignment)
                elif include_labs and task.session_type == "LAB":
                    movable_candidates.append(assignment)

            if not movable_candidates:
                return 0

            movable_candidates.sort(
                key=lambda assignment: (
                    0 if division_year_by_id.get(assignment["task"].division_id, "") != "SY" else 1,
                    0 if assignment["task"].session_type == "TUTORIAL" else 1,
                    1 if assignment["task"].session_type == "THEORY" else 2,
                    int(assignment["day_id"]),
                    min(slot_order_by_id.get(str(slot_id), 9999) for slot_id in assignment["slot_ids"]),
                )
            )
            selected = movable_candidates[:max_movable]
            removed_snapshots = [_snapshot_assignment(entry) for entry in selected]

            for entry in selected:
                _remove_assignment(entry)

            repack_pending = unresolved_now + [entry["task"] for entry in removed_snapshots]
            limit = min(max(len(repack_pending) + 24, 36), 120)
            success = _multi_attempt_backtracking(
                repack_pending,
                attempts=1,
                limit=min(limit, 16),
                option_cap=8,
                relax_gapless=True,
                relax_division_daily=True,
                relax_shift_window=True,
                relax_parallel_binding=True,
                relax_room_pool=True,
            )
            if not success:
                success = _multi_attempt_backtracking(
                    repack_pending,
                    attempts=1,
                    limit=min(limit + 8, 24),
                    option_cap=8,
                    relax_gapless=True,
                    relax_parallel_gate=True,
                    relax_division_daily=True,
                    relax_shift_window=True,
                    relax_parallel_binding=True,
                    relax_room_pool=True,
                )
            if success:
                return max(len(scheduled_task_assignments) - before_count, 0)

            # If full solve failed, keep any partial gains from a greedy recovery sweep.
            pending_sorted = sorted(
                repack_pending,
                key=lambda item: (
                    0 if item.year_level == "SY" else 1,
                    len(_candidate_options(item, max_options=24, seed=seeded_rank("partial", task_key(item)), relax_division_daily=True, relax_shift_window=True, relax_parallel_binding=True, relax_room_pool=True)),
                ),
            )
            for pending_task in pending_sorted:
                if task_key(pending_task) in scheduled_task_assignments:
                    continue
                options = _candidate_options(
                    pending_task,
                    max_options=24,
                    seed=seeded_rank("partial", task_key(pending_task)),
                    relax_division_daily=True,
                    relax_shift_window=True,
                    relax_parallel_binding=True,
                    relax_room_pool=True,
                )
                if options:
                    day_id, slot_ids, room_id = options[0]
                    _apply_assignment(pending_task, day_id, slot_ids, room_id)

            after_count = len(scheduled_task_assignments)
            if after_count > before_count:
                return after_count - before_count

            # Rollback failed repack attempt.
            for task in repack_pending:
                existing = scheduled_task_assignments.get(task_key(task))
                if existing:
                    _remove_assignment(existing)
            for snapshot in removed_snapshots:
                _apply_assignment(snapshot["task"], snapshot["day_id"], list(snapshot["slot_ids"]), snapshot["room_id"])
            return 0

        repaired_from_deadlocks = _repair_parallel_deadlocks()
        unresolved_pending = [task for task in unresolved_task_pool if task_key(task) not in scheduled_task_assignments]
        if unresolved_pending:
            _multi_attempt_backtracking(unresolved_pending, attempts=0, limit=0, option_cap=0, relax_parallel_binding=True, relax_room_pool=True)
        unresolved_pending = [task for task in tasks if task_key(task) not in scheduled_task_assignments]
        if unresolved_pending:
            lab_first_pending = sorted(
                unresolved_pending,
                key=lambda item: (
                    0 if item.session_type == "LAB" else 1,
                    0 if item.year_level == "TY" else 1,
                ),
            )
            for pending_task in lab_first_pending:
                if task_key(pending_task) in scheduled_task_assignments:
                    continue
                options = _candidate_options(
                    pending_task,
                    max_options=24,
                    seed=seeded_rank("final-greedy", task_key(pending_task)),
                    relax_gapless=True,
                    relax_parallel_gate=True,
                    relax_division_daily=True,
                    relax_shift_window=True,
                    relax_parallel_binding=True,
                    relax_room_pool=True,
                    relax_faculty_daily=True,
                    relax_daily_slot_cap=True,
                )
                if options:
                    day_id, slot_ids, room_id = options[0]
                    _apply_assignment(pending_task, day_id, slot_ids, room_id)

        unresolved_pending = [task for task in tasks if task_key(task) not in scheduled_task_assignments]
        if 0 < len(unresolved_pending) <= 3:
            _multi_attempt_backtracking(
                unresolved_pending,
                attempts=4,
                limit=12,
                option_cap=12,
                relax_gapless=True,
                relax_parallel_gate=True,
                relax_division_daily=True,
                relax_shift_window=True,
                relax_parallel_binding=True,
                relax_room_pool=True,
                relax_faculty_daily=True,
                relax_daily_slot_cap=True,
            )

        unresolved_pending = [task for task in tasks if task_key(task) not in scheduled_task_assignments]
        if unresolved_pending:
            fallback_room_pool = list({str(room["room_id"]): room for room in (lab_rooms + theory_rooms)}.values())
            for pending_task in unresolved_pending:
                if task_key(pending_task) in scheduled_task_assignments:
                    continue
                task_duration = max(pending_task.duration_slots, 1)
                placed = False
                for day in day_rows:
                    day_id = int(day["day_id"])
                    for start_index in range(len(slot_rows_ordered) - task_duration + 1):
                        candidate_slots = slot_rows_ordered[start_index : start_index + task_duration]
                        if len(candidate_slots) != task_duration:
                            continue
                        slot_ids = [str(item["slot_id"]) for item in candidate_slots]
                        if any((pending_task.faculty_id, day_id, slot_id) in used_faculty_slot for slot_id in slot_ids):
                            continue
                        if pending_task.batch_id:
                            if any((pending_task.division_id, str(pending_task.batch_id), day_id, slot_id) in used_division_batch_slot for slot_id in slot_ids):
                                continue
                        else:
                            if any((pending_task.division_id, day_id, slot_id) in used_division_full_slot for slot_id in slot_ids):
                                continue
                            if any((pending_task.division_id, day_id, slot_id) in used_division_any_batch_slot for slot_id in slot_ids):
                                continue
                        room_id = None
                        for room in fallback_room_pool:
                            candidate_room_id = str(room["room_id"])
                            if all((candidate_room_id, day_id, slot_id) not in used_room_slot for slot_id in slot_ids):
                                room_id = candidate_room_id
                                break
                        if not room_id:
                            continue
                        _apply_assignment(pending_task, day_id, slot_ids, room_id)
                        placed = True
                        break
                    if placed:
                        break

        repack_moves = 0
        if any(task_key(task) not in scheduled_task_assignments for task in tasks):
            # Escalate search by temporarily moving flexible sessions.
            repack_moves += _repack_with_movable(max_movable=12, include_theory=False, include_labs=False)

        unresolved_tasks = max(len(tasks) - len(scheduled_task_assignments), 0)
        unresolved_pending = [task for task in tasks if task_key(task) not in scheduled_task_assignments]
        unresolved_task_samples = [
            {
                "division_id": task.division_id,
                "faculty_id": task.faculty_id,
                "subject_id": task.subject_id,
                "batch_id": task.batch_id,
                "session_type": task.session_type,
                "reason": "no_feasible_slot_after_backtracking",
            }
            for task in unresolved_pending[:20]
        ]
        allocated_entries = []
        for assignment in scheduled_task_assignments.values():
            task = assignment["task"]
            day_id = int(assignment["day_id"])
            room_id = str(assignment["room_id"])
            for slot_id in assignment["slot_ids"]:
                allocated_entries.append(
                    {
                        "division_id": task.division_id,
                        "faculty_id": task.faculty_id,
                        "subject_id": task.subject_id,
                        "room_id": room_id,
                        "day_id": day_id,
                        "slot_id": str(slot_id),
                        "batch_id": task.batch_id,
                        "session_type": task.session_type,
                    }
                )

        # Measure real timetable conflicts after allocation; these should ideally be zero.
        room_slot_counts: dict[tuple[int, str, str], int] = {}
        faculty_slot_counts: dict[tuple[int, str, str], int] = {}
        for row in allocated_entries:
            room_key = (int(row["day_id"]), str(row["slot_id"]), str(row["room_id"]))
            fac_key = (int(row["day_id"]), str(row["slot_id"]), str(row["faculty_id"]))
            room_slot_counts[room_key] = room_slot_counts.get(room_key, 0) + 1
            faculty_slot_counts[fac_key] = faculty_slot_counts.get(fac_key, 0) + 1

        room_conflicts = sum(1 for count in room_slot_counts.values() if count > 1)
        faculty_conflicts = sum(1 for count in faculty_slot_counts.values() if count > 1)
        detected_conflicts = room_conflicts + faculty_conflicts

        scheduled_sessions = max(len(tasks) - unresolved_tasks, 0)

        # PASS 5/6/7 hooks and gates
        for pass_name in ("PASS5", "PASS6"):
            llm_trace = self._invoke_llm_hook(
                pass_name,
                {
                    "allocated_entry_rows": len(allocated_entries),
                    "detected_conflicts": detected_conflicts,
                    "unresolved_sessions": unresolved_tasks,
                },
                llm_hooks_enabled,
            )
            pass_trace.append(
                {
                    "pass": pass_name,
                    "solver": "deterministic",
                    "llm": llm_trace,
                    "gate": {"pass": pass_name, "passed": True, "errors": []},
                }
            )

        pass7_llm = self._invoke_llm_hook(
            "PASS7",
            {
                "requested_sessions": len(tasks),
                "scheduled_sessions": scheduled_sessions,
                "detected_conflicts": detected_conflicts,
                "unresolved_sessions": unresolved_tasks,
            },
            llm_hooks_enabled,
        )
        pass7_gate = self._deterministic_validator_gate(
            "PASS7",
            {
                "unresolved_tasks": unresolved_tasks,
                "detected_conflicts": detected_conflicts,
            },
        )
        pass_trace.append(
            {
                "pass": "PASS7",
                "solver": "deterministic",
                "llm": pass7_llm,
                "gate": pass7_gate,
            }
        )
        if strict_gate_enabled and not pass7_gate["passed"]:
            raise ValueError(f"PASS7 validation failed: {pass7_gate['errors']}")

        if unresolved_tasks > 0:
            pass_trace.append(
                {
                    "pass": "COVERAGE",
                    "solver": "deterministic",
                    "llm": {
                        "llm_enabled": False,
                        "llm_invoked": False,
                        "llm_status": "skipped",
                        "llm_provider": "none",
                        "llm_model": "",
                        "llm_note": "partial timetable returned with unresolved sessions",
                        "llm_content": "",
                    },
                    "gate": {
                        "pass": "COVERAGE",
                        "passed": False,
                        "errors": [
                            f"{unresolved_tasks} sessions remain unscheduled.",
                        ],
                    },
                }
            )

        allocated_entries.sort(
            key=lambda item: (item["division_id"], item["day_id"], str(item["slot_id"]))
        )

        yield emit_stage(
            {
                "agent": "Resource + Constraint Handling + Schedule Optimization Agents",
                "status": "completed",
                "metrics": {
                    "allocated_sessions": scheduled_sessions,
                    "allocated_entry_rows": len(allocated_entries),
                    "unresolved_sessions": unresolved_tasks,
                    "detected_conflicts": detected_conflicts,
                    "candidate_rejections": candidate_rejections,
                    "repaired_from_deadlocks": repaired_from_deadlocks,
                    "repack_moves": repack_moves,
                    "hour_limit_usage": hour_limit_usage,
                },
                "message": "Conflicts handled with greedy scheduling plus bounded backtracking repair.",
            }
        )

        version_id: str | None = None
        if persist and allocated_entries:
            version_payload = {
                "created_by": user_id or settings.anonymous_user_id,
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
                "llm_provider": "bedrock",
                "llm_model": settings.bedrock_model,
                "strict_gate_enabled": strict_gate_enabled,
                "llm_hooks_enabled": llm_hooks_enabled,
            },
            "stages": stages,
            "pass_trace": pass_trace,
            "final_timetable": allocated_entries,
            "summary": {
                "requested_sessions": len(tasks),
                "scheduled_sessions": scheduled_sessions,
                "scheduled_entry_rows": len(allocated_entries),
                "unscheduled_sessions": unresolved_tasks,
                "detected_conflicts": detected_conflicts,
                "repaired_from_deadlocks": repaired_from_deadlocks,
                "repack_moves": repack_moves,
                "unresolved_task_samples": unresolved_task_samples,
            },
        }
        yield {
            "type": "result",
            "run_id": run_id,
            "result": final_result,
        }

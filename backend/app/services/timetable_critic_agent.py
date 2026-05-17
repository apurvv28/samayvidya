"""Special AI critic agent for timetable quality analysis."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.config import settings
from app.services.timetable_constraint_validator import TimetableConstraintValidator, TimetableSnapshot
from app.services.timetable_conflict_audit import audit_timetable_conflicts
from app.services.timetable_orchestrator import _division_level_from_name, _normalize_year_level
from app.services.timetable_scheduling_types import MasterData, SHIFT_WINDOWS, TimetableEntry


class TimetableCriticAgent:
    """Hybrid critic: deterministic checks + Nova Pro narrative critique."""

    def __init__(self, supabase: Any) -> None:
        self.supabase = supabase

    def analyze(
        self,
        *,
        version_id: str,
        stress_hour_threshold: int = 4,
    ) -> dict[str, Any]:
        version_row = (
            self.supabase.table("timetable_versions")
            .select("version_id, department_id")
            .eq("version_id", version_id)
            .single()
            .execute()
            .data
        ) or {}
        department_id = version_row.get("department_id")

        entries = (
            self.supabase.table("timetable_entries")
            .select(
                "entry_id, version_id, day_id, slot_id, faculty_id, room_id, division_id, "
                "subject_id, session_type, batch_id"
            )
            .eq("version_id", version_id)
            .execute()
            .data
            or []
        )
        if not entries:
            raise ValueError("No timetable entries found for this version.")

        days = self.supabase.table("days").select("day_id, day_name").execute().data or []
        slots = (
            self.supabase.table("time_slots")
            .select("slot_id, slot_order, start_time, end_time, is_break")
            .order("slot_order")
            .execute()
            .data
            or []
        )
        faculty = self.supabase.table("faculty").select("faculty_id, faculty_name").execute().data or []
        rooms = self.supabase.table("rooms").select("room_id, room_number").execute().data or []
        divisions = self.supabase.table("divisions").select("division_id, division_name").execute().data or []
        subjects = self.supabase.table("subjects").select("subject_id, subject_name").execute().data or []
        batches = self.supabase.table("batches").select("batch_id, batch_code").execute().data or []

        days_by_id = {str(row["day_id"]): row for row in days}
        faculty_by_id = {str(row["faculty_id"]): row for row in faculty}
        rooms_by_id = {str(row["room_id"]): row for row in rooms}
        divisions_by_id = {str(row["division_id"]): row for row in divisions}
        subjects_by_id = {str(row["subject_id"]): row for row in subjects}
        batch_code_by_id = {str(row["batch_id"]): str(row.get("batch_code") or "") for row in batches}

        conflict_report = audit_timetable_conflicts(
            entries=entries,
            slot_rows=slots,
            days_by_id=days_by_id,
            rooms_by_id=rooms_by_id,
            faculty_by_id=faculty_by_id,
            divisions_by_id=divisions_by_id,
            subjects_by_id=subjects_by_id,
            batch_code_by_id=batch_code_by_id,
        )

        master = self._build_master_data(department_id=str(department_id) if department_id else None)
        typed_entries = [TimetableEntry.from_row(row) for row in entries]
        snapshot = TimetableSnapshot(entries={e.entry_id: e for e in typed_entries}, master=master)
        validator = TimetableConstraintValidator(snapshot)
        strict_violations = validator.validate_all_strict()
        constraint_findings = self._constraint_findings(strict_violations, snapshot)

        slot_order_by_id = {str(slot["slot_id"]): int(slot.get("slot_order") or 0) for slot in slots}

        faculty_stress = self._continuous_stress_findings(
            entries=entries,
            key_name="faculty_id",
            key_to_name={k: str(v.get("faculty_name") or k) for k, v in faculty_by_id.items()},
            days_by_id=days_by_id,
            slot_order_by_id=slot_order_by_id,
            threshold=stress_hour_threshold,
            finding_type="faculty_continuous_stress",
            title_prefix="Faculty stress",
        )
        student_stress = self._continuous_stress_findings(
            entries=entries,
            key_name="division_id",
            key_to_name={k: str(v.get("division_name") or k) for k, v in divisions_by_id.items()},
            days_by_id=days_by_id,
            slot_order_by_id=slot_order_by_id,
            threshold=stress_hour_threshold,
            finding_type="student_continuous_stress",
            title_prefix="Student stress",
        )

        conflict_findings = self._conflict_findings(conflict_report)
        all_findings = conflict_findings + constraint_findings + faculty_stress + student_stress
        all_findings.sort(
            key=lambda item: (self._severity_rank(item.get("severity", "low")), item.get("title", ""))
        )

        summary = {
            "total_issues": len(all_findings),
            "critical": sum(1 for item in all_findings if item.get("severity") == "critical"),
            "high": sum(1 for item in all_findings if item.get("severity") == "high"),
            "medium": sum(1 for item in all_findings if item.get("severity") == "medium"),
            "low": sum(1 for item in all_findings if item.get("severity") == "low"),
            "has_conflicts": bool(conflict_findings),
            "strict_constraint_violations": len(strict_violations),
            "stress_threshold_hours": stress_hour_threshold,
        }

        return {
            "version_id": version_id,
            "summary": summary,
            "issues": all_findings,
            "conflict_report": conflict_report,
            "constraint_violations": [{"entry_id": v.entry_id, "reason": v.reason} for v in strict_violations],
        }

    @staticmethod
    def _severity_rank(severity: str) -> int:
        order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        return order.get(str(severity).lower(), 4)

    def _build_master_data(self, department_id: str | None) -> MasterData:
        """Build MasterData consistent with generator/validator expectations."""
        slot_rows = (
            self.supabase.table("time_slots")
            .select("slot_id, slot_order, is_break, start_time, end_time")
            .order("slot_order")
            .execute()
            .data
            or []
        )
        day_rows = (
            self.supabase.table("days")
            .select("day_id, day_name, is_working_day")
            .eq("is_working_day", True)
            .order("day_id")
            .execute()
            .data
            or []
        )

        room_query = self.supabase.table("rooms").select("room_id, room_type, is_active, room_number")
        if department_id:
            room_query = room_query.eq("department_id", department_id)
        room_rows = [r for r in (room_query.execute().data or []) if r.get("is_active", True)]

        division_query = self.supabase.table("divisions").select("division_id, division_name, year")
        if department_id:
            division_query = division_query.eq("department_id", department_id)
        division_rows = division_query.execute().data or []

        subject_query = self.supabase.table("subjects").select("subject_id, subject_name")
        if department_id:
            subject_query = subject_query.eq("department_id", department_id)
        subject_rows = subject_query.execute().data or []

        faculty_query = self.supabase.table("faculty").select("faculty_id, faculty_name")
        if department_id:
            faculty_query = faculty_query.eq("department_id", department_id)
        faculty_rows = faculty_query.execute().data or []

        batch_query = self.supabase.table("batches").select("batch_id, division_id, is_active")
        batch_rows = [b for b in (batch_query.execute().data or []) if b.get("is_active", True)]

        slot_order_by_id = {str(s["slot_id"]): int(s.get("slot_order") or 0) for s in slot_rows if s.get("slot_id")}
        slot_id_by_order = {int(s.get("slot_order") or 0): str(s["slot_id"]) for s in slot_rows if s.get("slot_id")}

        def slot_order_for_window(start_hhmm: str, end_hhmm: str) -> int | None:
            for slot in slot_rows:
                if str(slot.get("start_time") or "")[:5] == start_hhmm and str(slot.get("end_time") or "")[:5] == end_hhmm:
                    return int(slot.get("slot_order") or 0)
            return None

        from app.services.timetable_scheduling_types import SHIFT_LUNCH_SLOT_TIMES

        lunch_slot_order_by_shift = {
            shift: slot_order_for_window(start, end)
            for shift, (start, end) in SHIFT_LUNCH_SLOT_TIMES.items()
        }

        break_slot_ids: set[str] = set()
        for s in slot_rows:
            if s.get("is_break") and s.get("slot_id"):
                break_slot_ids.add(str(s["slot_id"]))

        division_year_by_id: dict[str, str] = {}
        for row in division_rows:
            did = str(row.get("division_id") or "")
            if not did:
                continue
            year = _division_level_from_name(row.get("division_name")) or _normalize_year_level(row.get("year")) or "FY"
            division_year_by_id[did] = year

        # Shift assignment should match orchestrator distribution (cyclic across divisions).
        division_shift_by_id: dict[str, tuple[str, tuple[int, int]]] = {}
        ordered_division_ids = [
            str(row.get("division_id"))
            for row in sorted(
                division_rows,
                key=lambda row: (
                    {"FY": 0, "SY": 1, "TY": 2, "LY": 3}.get(_normalize_year_level(row.get("year")), 4),
                    str(row.get("division_name") or ""),
                    str(row.get("division_id") or ""),
                ),
            )
            if row.get("division_id")
        ]
        shift_keys = list(SHIFT_WINDOWS.keys())
        for idx, did in enumerate(ordered_division_ids):
            division_shift_by_id[did] = SHIFT_WINDOWS[shift_keys[idx % len(shift_keys)]]

        batches_by_division: dict[str, list[str]] = defaultdict(list)
        for row in batch_rows:
            did = str(row.get("division_id") or "")
            bid = str(row.get("batch_id") or "")
            if did and bid:
                batches_by_division[did].append(bid)

        required_parallel: dict[str, int] = {}
        for did, bids in batches_by_division.items():
            if len(bids) >= 2:
                required_parallel[did] = len(bids)

        lab_rooms = [r for r in room_rows if str(r.get("room_type", "")).upper() == "LAB"]
        theory_rooms = [r for r in room_rows if str(r.get("room_type", "")).upper() != "LAB"]
        if not theory_rooms:
            theory_rooms = room_rows
        if not lab_rooms:
            lab_rooms = room_rows

        slot_label_by_id = {
            str(s["slot_id"]): f"{str(s.get('start_time') or '')[:5]}-{str(s.get('end_time') or '')[:5]}"
            for s in slot_rows
            if s.get("slot_id")
        }

        subject_name_by_id = {str(s["subject_id"]): str(s.get("subject_name") or s["subject_id"]) for s in subject_rows if s.get("subject_id")}
        faculty_name_by_id = {str(f["faculty_id"]): str(f.get("faculty_name") or f["faculty_id"]) for f in faculty_rows if f.get("faculty_id")}
        division_name_by_id = {str(d["division_id"]): str(d.get("division_name") or d["division_id"]) for d in division_rows if d.get("division_id")}
        day_name_by_id = {str(d["day_id"]): str(d.get("day_name") or d["day_id"]) for d in day_rows if d.get("day_id")}

        return MasterData(
            slot_rows=slot_rows,
            day_rows=day_rows,
            room_rows=room_rows,
            division_rows=division_rows,
            subject_rows=subject_rows,
            faculty_rows=faculty_rows,
            batch_rows=batch_rows,
            slot_order_by_id=slot_order_by_id,
            slot_id_by_order=slot_id_by_order,
            division_year_by_id=division_year_by_id,
            division_shift_by_id=division_shift_by_id,
            lunch_slot_order_by_shift=lunch_slot_order_by_shift,
            batches_by_division=dict(batches_by_division),
            required_parallel_labs_by_division=required_parallel,
            lab_rooms=lab_rooms,
            theory_rooms=theory_rooms,
            subject_name_by_id=subject_name_by_id,
            faculty_name_by_id=faculty_name_by_id,
            division_name_by_id=division_name_by_id,
            day_name_by_id=day_name_by_id,
            slot_label_by_id=slot_label_by_id,
            break_slot_ids=break_slot_ids,
        )

    def _constraint_findings(self, violations: list[Any], snapshot: TimetableSnapshot) -> list[dict[str, Any]]:
        """Convert strict validator violations into critic findings."""
        if not violations:
            return []

        meta: dict[str, dict[str, str]] = {
            "break_slot": {
                "severity": "critical",
                "title": "Scheduled during break slot",
                "description": "One or more sessions are placed in a global break slot (time_slots.is_break = true).",
            },
            "lunch_slot": {
                "severity": "critical",
                "title": "Scheduled during lunch slot",
                "description": "One or more sessions are placed in the division's shift-specific lunch slot.",
            },
            "shift_window_violation": {
                "severity": "high",
                "title": "Shift window violation",
                "description": "A session is scheduled outside the division's allowed shift hours.",
            },
            "gapless_violation": {
                "severity": "medium",
                "title": "Gapless day rule violation",
                "description": "A division day contains avoidable gaps (excluding lunch) that violate the gapless-day policy.",
            },
            "division_daily_cap": {
                "severity": "high",
                "title": "Division daily cap exceeded",
                "description": "A division exceeds the strict daily cap for THEORY/LAB sessions.",
            },
            "faculty_daily_cap": {
                "severity": "high",
                "title": "Faculty daily cap exceeded",
                "description": "A faculty exceeds the strict daily cap for THEORY/LAB sessions.",
            },
            "parallel_lab_window_broken": {
                "severity": "high",
                "title": "Parallel lab window broken",
                "description": "A lab placement breaks required parallel-lab gating for a division with multiple batches.",
            },
            "division_batch_mutex": {
                "severity": "high",
                "title": "Division batch mutex violation",
                "description": "A division has an invalid overlap between full-division sessions and batch sessions in the same slot.",
            },
            "block_contiguity_broken": {
                "severity": "high",
                "title": "2-slot block contiguity broken",
                "description": "A 2-slot block (e.g., LAB) is not contiguous or crosses invalid boundaries.",
            },
            "unknown_slot": {
                "severity": "high",
                "title": "Unknown time slot referenced",
                "description": "An entry references a slot_id that does not exist in time_slots.",
            },
            "parallel_lab_group_bound": {
                "severity": "high",
                "title": "Parallel lab group bound",
                "description": "A detected parallel lab group (multiple batches/faculties) is bound and should be moved as a unit.",
            },
            "faculty_conflict": {
                "severity": "critical",
                "title": "Faculty conflict (double booking)",
                "description": "A faculty is assigned to multiple sessions in the same day/slot.",
            },
            "room_conflict": {
                "severity": "critical",
                "title": "Room conflict (double booking)",
                "description": "A room is assigned to multiple sessions in the same day/slot.",
            },
        }

        by_reason: dict[str, list[str]] = defaultdict(list)
        for v in violations:
            reason = str(getattr(v, "reason", "") or "unknown")
            entry_id = str(getattr(v, "entry_id", "") or "")
            if entry_id:
                by_reason[reason].append(entry_id)

        findings: list[dict[str, Any]] = []
        m = snapshot.master
        for reason, entry_ids in sorted(by_reason.items(), key=lambda item: (-len(item[1]), item[0])):
            info = meta.get(
                reason,
                {"severity": "medium", "title": f"Constraint violation: {reason}", "description": "A strict constraint was violated."},
            )
            evidence = []
            for eid in entry_ids[:4]:
                entry = snapshot.entries.get(eid)
                if not entry:
                    continue
                evidence.append(
                    {
                        "entry_id": eid,
                        "division": m.division_name_by_id.get(entry.division_id, entry.division_id),
                        "faculty": m.faculty_name_by_id.get(entry.faculty_id, entry.faculty_id),
                        "subject": m.subject_name_by_id.get(entry.subject_id, entry.subject_id),
                        "day": m.day_name_by_id.get(str(entry.day_id), str(entry.day_id)),
                        "slot": m.slot_label_by_id.get(entry.slot_id, entry.slot_id),
                        "room": next((r.get("room_number") for r in m.room_rows if str(r.get("room_id")) == entry.room_id), entry.room_id),
                        "session_type": entry.session_type,
                        "batch_id": entry.batch_id,
                    }
                )

            findings.append(
                {
                    "type": f"constraint_{reason}",
                    "severity": info["severity"],
                    "title": info["title"],
                    "description": f"{info['description']} ({len(entry_ids)} occurrence(s)).",
                    "evidence": evidence,
                }
            )

        return findings

    def _conflict_findings(self, conflict_report: dict[str, Any]) -> list[dict[str, Any]]:
        findings: list[dict[str, Any]] = []
        room_slot = conflict_report.get("slot_level_room_conflicts") or []
        faculty_slot = conflict_report.get("slot_level_faculty_conflicts") or []
        room_interval = conflict_report.get("interval_room_overlaps") or []
        faculty_interval = conflict_report.get("interval_faculty_overlaps") or []

        if room_slot:
            findings.append(
                {
                    "type": "room_double_booking",
                    "severity": "critical",
                    "title": "Room double booking detected",
                    "description": f"{len(room_slot)} slot-level room conflicts found.",
                    "evidence": [c.get("labels", [])[:2] for c in room_slot[:3]],
                }
            )
        if faculty_slot:
            findings.append(
                {
                    "type": "faculty_double_booking",
                    "severity": "critical",
                    "title": "Faculty double booking detected",
                    "description": f"{len(faculty_slot)} slot-level faculty conflicts found.",
                    "evidence": [c.get("labels", [])[:2] for c in faculty_slot[:3]],
                }
            )
        if room_interval:
            findings.append(
                {
                    "type": "room_overlap",
                    "severity": "high",
                    "title": "Room interval overlap detected",
                    "description": f"{len(room_interval)} merged-interval room overlaps found.",
                    "evidence": [f"{c['a']['label']} || {c['b']['label']}" for c in room_interval[:3]],
                }
            )
        if faculty_interval:
            findings.append(
                {
                    "type": "faculty_overlap",
                    "severity": "high",
                    "title": "Faculty interval overlap detected",
                    "description": f"{len(faculty_interval)} merged-interval faculty overlaps found.",
                    "evidence": [f"{c['a']['label']} || {c['b']['label']}" for c in faculty_interval[:3]],
                }
            )
        return findings

    def _continuous_stress_findings(
        self,
        *,
        entries: list[dict[str, Any]],
        key_name: str,
        key_to_name: dict[str, str],
        days_by_id: dict[str, dict[str, Any]],
        slot_order_by_id: dict[str, int],
        threshold: int,
        finding_type: str,
        title_prefix: str,
    ) -> list[dict[str, Any]]:
        grouped: dict[tuple[str, str], set[int]] = defaultdict(set)
        for row in entries:
            entity_id = str(row.get(key_name) or "")
            day_id = str(row.get("day_id") or "")
            slot_id = str(row.get("slot_id") or "")
            order = slot_order_by_id.get(slot_id)
            if entity_id and day_id and order:
                grouped[(entity_id, day_id)].add(order)

        findings: list[dict[str, Any]] = []
        for (entity_id, day_id), slot_orders in grouped.items():
            streak_len, streak_start, streak_end = self._longest_consecutive_run(sorted(slot_orders))
            # "4+" from coordinator policy means strictly more than threshold baseline.
            # Example: threshold=4 flags 5 or more continuous slots.
            if streak_len > threshold:
                entity_name = key_to_name.get(entity_id, entity_id)
                day_name = str(days_by_id.get(day_id, {}).get("day_name") or day_id)
                findings.append(
                    {
                        "type": finding_type,
                        "severity": "high" if streak_len >= threshold + 2 else "medium",
                        "title": f"{title_prefix}: {entity_name}",
                        "description": (
                            f"{entity_name} has {streak_len} continuous teaching slots on {day_name} "
                            f"(slot order {streak_start} to {streak_end})."
                        ),
                        "evidence": [
                            {
                                "entity_id": entity_id,
                                "entity_name": entity_name,
                                "day_id": day_id,
                                "day_name": day_name,
                                "continuous_slots": streak_len,
                                "slot_order_start": streak_start,
                                "slot_order_end": streak_end,
                            }
                        ],
                    }
                )
        return findings

    @staticmethod
    def _longest_consecutive_run(values: list[int]) -> tuple[int, int, int]:
        if not values:
            return (0, 0, 0)
        best_len = 1
        best_start = values[0]
        best_end = values[0]
        cur_start = values[0]
        cur_end = values[0]
        for current in values[1:]:
            if current == cur_end + 1:
                cur_end = current
            else:
                cur_len = cur_end - cur_start + 1
                if cur_len > best_len:
                    best_len = cur_len
                    best_start = cur_start
                    best_end = cur_end
                cur_start = current
                cur_end = current
        cur_len = cur_end - cur_start + 1
        if cur_len > best_len:
            best_len = cur_len
            best_start = cur_start
            best_end = cur_end
        return (best_len, best_start, best_end)

"""Constraint-aware timetable issue resolver."""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
from typing import Any

from app.config import settings
from app.services.timetable_constraint_validator import TimetableConstraintValidator, TimetableSnapshot
from app.services.timetable_critic_agent import TimetableCriticAgent
from app.services.timetable_orchestrator import (
    _division_level_from_name,
    _normalize_year_level,
)
from app.services.timetable_resolution_snapshot import ResolutionSnapshot
from app.services.timetable_scheduling_types import (
    PASS_LAST,
    PASS_RELAX_1,
    PASS_RELAX_2,
    PASS_STRICT,
    RELAX_PASSES,
    MasterData,
    MoveResult,
    Placement,
    RelaxFlags,
    ResolverIntegrityError,
    TimetableEntry,
    ViolationReport,
)

SUGGESTED_ACTIONS: dict[str, str] = {
    "parallel_lab_group_bound": "Parallel lab groups cannot be moved automatically; adjust all batches together in the editor.",
    "faculty_fully_loaded": "Faculty has no free slot under current constraints; swap faculty or reduce load.",
    "no_free_room": "No free room in this slot; pick another slot or room manually.",
    "shift_window_exhausted": "No valid slot within the division shift window; extend hours or move to another day.",
    "daily_cap_exceeded": "Division or faculty daily hour cap is full; use another day.",
    "block_no_joint_slot": "No contiguous 2-slot block available; reschedule the full lab/theory block manually.",
    "no_feasible_slot_stress": "Cannot break stress streak automatically; redistribute sessions across days.",
    # Strict constraint violations (validator reasons)
    "break_slot": "Entry is in a global break slot; move it to a teaching slot.",
    "lunch_slot": "Entry is in the division lunch slot; move it to a non-lunch slot.",
    "shift_window_violation": "Entry is outside the division shift window; move within allowed hours.",
    "gapless_violation": "Day has gaps; shift sessions to form a gapless pattern (excluding lunch).",
    "division_daily_cap": "Division daily cap exceeded; move sessions to another day.",
    "faculty_daily_cap": "Faculty daily cap exceeded; move sessions to another day or swap faculty.",
    "division_batch_mutex": "Invalid overlap between division-wide and batch sessions; move one of the sessions.",
    "parallel_lab_window_broken": "Parallel lab gating broken; schedule all batches in a consistent parallel window.",
    "block_contiguity_broken": "2-slot block is not contiguous; schedule the full block together.",
    "unknown_slot": "Entry references an unknown slot; fix slot_id mapping or regenerate.",
}


def build_master_data(supabase: Any, *, department_id: str | None) -> MasterData:
    slot_rows = (
        supabase.table("time_slots")
        .select("slot_id, slot_order, is_break, start_time, end_time")
        .order("slot_order")
        .execute()
        .data
        or []
    )
    day_result = (
        supabase.table("days")
        .select("day_id, day_name, is_working_day")
        .eq("is_working_day", True)
        .order("day_id")
        .execute()
    )
    day_rows = day_result.data if day_result and day_result.data else []
    # Ensure day_rows is a flat list of dicts, not nested
    if day_rows and isinstance(day_rows, list) and len(day_rows) > 0:
        if isinstance(day_rows[0], list):
            # Flatten if nested
            day_rows = [item for sublist in day_rows for item in (sublist if isinstance(sublist, list) else [sublist])]
    room_query = supabase.table("rooms").select("room_id, room_type, is_active, room_number")
    if department_id:
        room_query = room_query.eq("department_id", department_id)
    room_rows = [r for r in (room_query.execute().data or []) if r.get("is_active", True)]

    division_query = supabase.table("divisions").select("division_id, division_name, year")
    if department_id:
        division_query = division_query.eq("department_id", department_id)
    division_rows = division_query.execute().data or []

    subject_query = supabase.table("subjects").select("subject_id, subject_name")
    if department_id:
        subject_query = subject_query.eq("department_id", department_id)
    subject_rows = subject_query.execute().data or []

    faculty_query = supabase.table("faculty").select("faculty_id, faculty_name")
    if department_id:
        faculty_query = faculty_query.eq("department_id", department_id)
    faculty_rows = faculty_query.execute().data or []

    batch_query = supabase.table("batches").select("batch_id, division_id, is_active")
    batch_rows = [b for b in (batch_query.execute().data or []) if b.get("is_active", True)]

    slot_order_by_id = {str(s["slot_id"]): int(s.get("slot_order") or 0) for s in slot_rows}
    slot_id_by_order = {int(s.get("slot_order") or 0): str(s["slot_id"]) for s in slot_rows if s.get("slot_id")}

    def slot_order_for_window(start_hhmm: str, end_hhmm: str) -> int | None:
        for slot in slot_rows:
            if str(slot.get("start_time") or "")[:5] == start_hhmm and str(slot.get("end_time") or "")[:5] == end_hhmm:
                return int(slot.get("slot_order") or 0)
        return None

    from app.services.timetable_scheduling_types import SHIFT_LUNCH_SLOT_TIMES, SHIFT_WINDOWS

    lunch_slot_order_by_shift = {
        shift: slot_order_for_window(start, end)
        for shift, (start, end) in SHIFT_LUNCH_SLOT_TIMES.items()
    }

    # Build set of slot IDs that are globally blocked (is_break=True in DB).
    # Shift-specific lunch slots are handled per-division via lunch_slot_order_by_shift.
    break_slot_ids: set[str] = set()
    for s in slot_rows:
        if s.get("is_break"):
            break_slot_ids.add(str(s["slot_id"]))

    division_year_by_id: dict[str, str] = {}
    for row in division_rows:
        did = str(row.get("division_id") or "")
        if not did:
            continue
        year = _division_level_from_name(row.get("division_name")) or _normalize_year_level(row.get("year")) or "FY"
        division_year_by_id[did] = year

    division_shift_by_id: dict[str, tuple[str, tuple[int, int]]] = {}
    
    # We must distribute the shifts to match the orchestrator
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
    }

    # Build lookup dictionaries with error handling
    try:
        subject_name_by_id = {str(s["subject_id"]): str(s.get("subject_name") or s["subject_id"]) for s in subject_rows}
        faculty_name_by_id = {str(f["faculty_id"]): str(f.get("faculty_name") or f["faculty_id"]) for f in faculty_rows}
        division_name_by_id = {str(d["division_id"]): str(d.get("division_name") or d["division_id"]) for d in division_rows}
        
        # Special handling for day_name_by_id with better error reporting
        day_name_by_id = {}
        for idx, d in enumerate(day_rows):
            if not isinstance(d, dict):
                raise TypeError(f"day_rows[{idx}] is not a dict, it's a {type(d).__name__}: {d}")
            day_id_key = str(d.get("day_id", ""))
            if day_id_key:
                day_name_by_id[day_id_key] = str(d.get("day_name") or day_id_key)
    except (KeyError, TypeError) as e:
        raise ValueError(f"Error building master data lookups: {e}. day_rows type: {type(day_rows)}, content: {day_rows[:3] if day_rows else 'empty'}")

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


class TimetableIssueResolver:
    """Repairs timetable issues using shared constraint validation."""

    def __init__(self, supabase: Any) -> None:
        self.supabase = supabase
        self.critic = TimetableCriticAgent(supabase)

    def resolve(
        self,
        *,
        version_id: str,
        user_id: str | None,
        stress_hour_threshold: int = 4,
        max_iterations: int = 6,
        allow_relax: bool = True,
        dry_run: bool = False,
        department_id: str | None = None,
    ) -> dict[str, Any]:
        source_version = (
            self.supabase.table("timetable_versions").select("*").eq("version_id", version_id).single().execute().data
        ) or {}
        if source_version.get("is_frozen"):
            raise ValueError("Cannot resolve issues on a frozen timetable version.")

        baseline = self.critic.analyze(version_id=version_id, stress_hour_threshold=stress_hour_threshold)
        baseline_issues = int((baseline.get("summary") or {}).get("total_issues") or 0)

        raw_rows = (
            self.supabase.table("timetable_entries").select("*").eq("version_id", version_id).execute().data or []
        )
        if not raw_rows:
            raise ValueError("No timetable entries found for this version.")

        dept_id = department_id or source_version.get("department_id")
        master = build_master_data(self.supabase, department_id=str(dept_id) if dept_id else None)
        entries = [TimetableEntry.from_row(r) for r in raw_rows]
        snapshot = ResolutionSnapshot(entries, master)

        # Capture pre-existing strict violations BEFORE resolution so we only
        # abort if the resolver introduces NEW violations, not pre-existing ones
        # (the original timetable may have been generated with relaxed constraints).
        baseline_violations = snapshot.pre_persist_integrity_check()
        baseline_violation_ids = {v.entry_id for v in baseline_violations}

        unresolvable: list[dict[str, Any]] = []
        self._relax_moves = 0
        total_moves = 0

        stages: list[dict[str, Any]] = [
            {
                "name": "Issue Intake",
                "status": "done",
                "metrics": {"baseline_issues": baseline_issues, "entries": len(entries)},
            }
        ]

        # Keep the resolver conservative: either strict-only, or a single safe relaxation pass.
        # (Coordinator preference: minimal manual work, but do not relax shift/caps automatically.)
        relax_sequence = (
            (("strict", PASS_STRICT), ("gapless_only", PASS_RELAX_1))
            if allow_relax
            else (("strict", PASS_STRICT),)
        )

        for _ in range(max_iterations):
            iteration_moves = 0
            iteration_moves += self._round_room_conflicts(snapshot, master, relax_sequence, unresolvable)
            iteration_moves += self._round_faculty_conflicts(snapshot, master, relax_sequence, unresolvable)
            iteration_moves += self._round_stress(
                snapshot, master, relax_sequence, unresolvable, stress_hour_threshold
            )
            iteration_moves += self._round_strict_violations(snapshot, master, unresolvable)
            total_moves += iteration_moves
            if iteration_moves == 0:
                break

        stages.append(
            {
                "name": "Conflict Resolver",
                "status": "done",
                "metrics": {"entry_moves": total_moves},
            }
        )
        stages.append(
            {
                "name": "Stress Balancer",
                "status": "done",
                "metrics": {"stress_threshold_hours": stress_hour_threshold},
            }
        )

        post_violations = snapshot.pre_persist_integrity_check()
        # Guardrail: resolver must NOT introduce new strict violations.
        # Pre-existing strict violations (from relaxed generation) may remain, but must not spread to new entries.
        allowed_new_reasons = {"gapless_violation"} if allow_relax else set()
        new_violation_ids = {v.entry_id for v in post_violations} - baseline_violation_ids
        truly_new = [
            v
            for v in post_violations
            if v.entry_id in new_violation_ids and v.reason not in allowed_new_reasons
        ]
        if truly_new:
            raise ResolverIntegrityError(
                "Issue resolver introduced new strict constraint violations; refusing to persist changes.",
                violations=truly_new,
            )

        new_version_id: str | None = None
        if not dry_run:
            self.supabase.table("timetable_versions").update({"is_active": False}).eq("is_active", True).execute()
            inserted = (
                self.supabase.table("timetable_versions")
                .insert(
                    {
                        "created_by": user_id or settings.anonymous_user_id,
                        "reason": f"Issue resolver run from source version {version_id}",
                        "is_active": True,
                        "department_id": dept_id,
                    }
                )
                .execute()
                .data
                or []
            )
            if not inserted:
                raise ValueError("Failed to create resolved timetable version.")
            new_version_id = str(inserted[0].get("version_id"))
            rows = []
            for row in snapshot.commit_to_db_batch():
                clean = {k: v for k, v in row.items() if k not in {"entry_id", "created_at", "updated_at"}}
                clean["version_id"] = new_version_id
                rows.append(clean)
            self.supabase.table("timetable_entries").insert(rows).execute()

        post = (
            self.critic.analyze(version_id=str(new_version_id), stress_hour_threshold=stress_hour_threshold)
            if new_version_id
            else baseline
        )
        final_issues = int((post.get("summary") or {}).get("total_issues") or 0)
        resolved = max(0, baseline_issues - final_issues)
        rate = 1.0 if baseline_issues == 0 else float(resolved) / float(max(1, baseline_issues))

        stages.append(
            {
                "name": "Validation",
                "status": "done",
                "metrics": {
                    "baseline_issues": baseline_issues,
                    "remaining_issues": final_issues,
                    "resolved_issues": resolved,
                    "resolution_rate": round(rate, 4),
                },
            }
        )

        return {
            "version_id": new_version_id,
            "source_version_id": version_id,
            "resolved_version_id": new_version_id,
            "dry_run": dry_run,
            "baseline_issues": baseline_issues,
            "resolved_issues": resolved,
            "resolved_with_relaxation": self._relax_moves,
            "remaining_issues": final_issues,
            "resolution_rate": round(rate, 4),
            "resolution_rate_percent": round(rate * 100, 2),
            "target_met_90_percent": rate >= 0.90,
            "target_met_95_percent": rate >= 0.95,
            "unresolvable": unresolvable,
            "stages": stages,
            "post_critique": post,
            "resolution_summary": {
                "baseline_issues": baseline_issues,
                "remaining_issues": final_issues,
                "resolved_issues": resolved,
                "resolution_rate_percent": round(rate * 100, 2),
                "target_met_90_percent": rate >= 0.90,
                "target_met_95_percent": rate >= 0.95,
                "resolved_with_relaxation": self._relax_moves,
            },
        }

    def _round_room_conflicts(
        self,
        snapshot: ResolutionSnapshot,
        master: MasterData,
        relax_sequence: tuple[tuple[str, RelaxFlags], ...],
        unresolvable: list[dict[str, Any]],
    ) -> int:
        moves = 0
        by_room: dict[tuple[str, int, str], list[str]] = defaultdict(list)
        for eid, entry in snapshot.entries.items():
            by_room[(entry.room_id, entry.day_id, entry.slot_id)].append(eid)

        for (room_id, day_id, slot_id), entry_ids in by_room.items():
            if len(entry_ids) <= 1:
                continue
            for eid in entry_ids[1:]:
                entry = snapshot.get(eid)
                if not entry:
                    continue
                if self._try_same_slot_room_swap(snapshot, entry, master):
                    moves += 1
                    continue
                result = self._move_entry(snapshot, entry, relax_sequence)
                if result.ok:
                    moves += 1
                    continue
                self._record_unresolvable(snapshot, entry, "room_conflict", result.reason or "no_free_room", unresolvable)
        return moves

    def _round_faculty_conflicts(
        self,
        snapshot: ResolutionSnapshot,
        master: MasterData,
        relax_sequence: tuple[tuple[str, RelaxFlags], ...],
        unresolvable: list[dict[str, Any]],
    ) -> int:
        moves = 0
        by_fac: dict[tuple[str, int, str], list[str]] = defaultdict(list)
        for eid, entry in snapshot.entries.items():
            by_fac[(entry.faculty_id, entry.day_id, entry.slot_id)].append(eid)

        priority = {"TUTORIAL": 0, "THEORY": 1, "LAB": 2}

        for (_, _, _), entry_ids in by_fac.items():
            if len(entry_ids) <= 1:
                continue
            sorted_ids = sorted(
                entry_ids,
                key=lambda eid: priority.get(snapshot.entries[eid].session_type.upper(), 3),
            )
            for eid in sorted_ids[1:]:
                entry = snapshot.get(eid)
                if not entry:
                    continue
                result = self._move_entry(snapshot, entry, relax_sequence)
                if result.ok:
                    moves += 1
                else:
                    self._record_unresolvable(
                        snapshot, entry, "faculty_conflict", result.reason or "faculty_fully_loaded", unresolvable
                    )
        return moves

    def _round_stress(
        self,
        snapshot: ResolutionSnapshot,
        master: MasterData,
        relax_sequence: tuple[tuple[str, RelaxFlags], ...],
        unresolvable: list[dict[str, Any]],
        threshold: int,
    ) -> int:
        moves = 0
        # Stress balancing is allowed to use the same relaxation policy as the main resolver.
        stress_passes = relax_sequence

        for key_name in ("faculty_id", "division_id"):
            grouped: dict[tuple[str, int], list[TimetableEntry]] = defaultdict(list)
            for entry in snapshot.entries.values():
                grouped[(str(getattr(entry, key_name)), entry.day_id)].append(entry)

            for (_, day_id), rows in grouped.items():
                rows.sort(key=lambda r: master.slot_order_by_id.get(r.slot_id, 0))
                streak = self._longest_streak(rows, master, threshold)
                if not streak:
                    continue
                candidate = streak[-1]
                result = self._move_entry(snapshot, candidate, stress_passes, prefer_low_load_day=True)
                if result.ok:
                    moves += 1
                else:
                    self._record_unresolvable(
                        snapshot,
                        candidate,
                        "stress",
                        result.reason or "no_feasible_slot_stress",
                        unresolvable,
                    )
        return moves

    def _try_same_slot_room_swap(
        self, snapshot: ResolutionSnapshot, entry: TimetableEntry, master: MasterData
    ) -> bool:
        if snapshot.validator.is_lab_group_bound(entry.entry_id):
            return False
        pool = master.lab_rooms if entry.session_type == "LAB" else master.theory_rooms
        old = entry.placement
        for room in pool:
            candidate_room = str(room["room_id"])
            if candidate_room == entry.room_id:
                continue
            trial = deepcopy(entry)
            trial.room_id = candidate_room
            ok, _ = snapshot.validator.can_place(trial, exclude_entry_id=entry.entry_id, allow_relax=PASS_STRICT)
            if ok:
                snapshot.apply_move(entry.entry_id, Placement(day_id=old.day_id, slot_id=old.slot_id, room_id=candidate_room))
                return True
        return False

    def _move_entry(
        self,
        snapshot: ResolutionSnapshot,
        entry: TimetableEntry,
        relax_sequence: tuple[tuple[str, RelaxFlags], ...],
        *,
        prefer_low_load_day: bool = False,
    ) -> MoveResult:
        if snapshot.validator.is_lab_group_bound(entry.entry_id):
            return self._move_lab_group(snapshot, entry, relax_sequence, prefer_low_load_day=prefer_low_load_day)

        siblings = self._get_block_siblings(entry, snapshot)
        last_reason: str | None = None
        for pass_name, flags in relax_sequence:
            if siblings:
                placement = self._find_joint_candidate(entry, siblings[0], snapshot, flags, prefer_low_load_day)
                if placement:
                    old = entry.placement
                    old_sib = siblings[0].placement
                    snapshot.apply_move(entry.entry_id, placement[0])
                    snapshot.apply_move(siblings[0].entry_id, placement[1])
                    used_last = pass_name == "last"
                    result = MoveResult(
                        ok=True,
                        resolved_with_relaxation=used_last or pass_name != "strict",
                        relax_pass=pass_name,
                    )
                    if result.resolved_with_relaxation:
                        self._relax_moves += 1
                    return result
                last_reason = "block_no_joint_slot"
            else:
                placement = self._find_single_candidate(entry, snapshot, flags, prefer_low_load_day)
                if placement:
                    snapshot.apply_move(entry.entry_id, placement)
                    used_last = pass_name == "last"
                    result = MoveResult(
                        ok=True,
                        resolved_with_relaxation=used_last or pass_name != "strict",
                        relax_pass=pass_name,
                    )
                    if result.resolved_with_relaxation:
                        self._relax_moves += 1
                    return result
                ok, reason = snapshot.validator.can_place(
                    entry, exclude_entry_id=entry.entry_id, allow_relax=flags
                )
                last_reason = reason or "no_feasible_slot"
        return MoveResult(ok=False, unresolvable=True, reason=last_reason)

    def _get_block_siblings(self, entry: TimetableEntry, snapshot: ResolutionSnapshot) -> list[TimetableEntry]:
        order = snapshot.master.slot_order_by_id.get(entry.slot_id, 0)
        siblings: list[TimetableEntry] = []
        for other in snapshot.entries.values():
            if other.entry_id == entry.entry_id:
                continue
            if (
                other.subject_id == entry.subject_id
                and other.faculty_id == entry.faculty_id
                and other.division_id == entry.division_id
                and other.day_id == entry.day_id
                and abs(snapshot.master.slot_order_by_id.get(other.slot_id, 0) - order) == 1
            ):
                siblings.append(other)
        return siblings[:1]

    @staticmethod
    def _is_lunch_slot_for_entry(entry: TimetableEntry, slot_order: int, master: MasterData) -> bool:
        """Check if a slot order is the lunch slot for this entry's division shift."""
        shift_name, _ = master.division_shift_by_id.get(
            entry.division_id, ("SHIFT_08_14", (8 * 60, 14 * 60))
        )
        lunch_order = master.lunch_slot_order_by_shift.get(shift_name)
        return lunch_order is not None and slot_order == lunch_order

    def _find_single_candidate(
        self,
        entry: TimetableEntry,
        snapshot: ResolutionSnapshot,
        relax: RelaxFlags,
        prefer_low_load_day: bool,
    ) -> Placement | None:
        master = snapshot.master
        pool = master.lab_rooms if entry.session_type == "LAB" else master.theory_rooms
        days = sorted(
            master.day_rows,
            key=lambda d: self._day_load_rank(entry, int(d["day_id"]), snapshot, prefer_low_load_day),
        )
        orders = sorted(master.slot_id_by_order.keys())
        last_reason = None
        for day in days:
            day_id = int(day["day_id"])
            for order in orders:
                slot_id = master.slot_id_by_order.get(order)
                if not slot_id:
                    continue
                # Never place entries in global break slots or division-specific lunch slots
                if slot_id in master.break_slot_ids:
                    continue
                if self._is_lunch_slot_for_entry(entry, order, master):
                    continue
                for room in pool:
                    trial = deepcopy(entry)
                    trial.day_id = day_id
                    trial.slot_id = slot_id
                    trial.room_id = str(room["room_id"])
                    ok, reason = snapshot.validator.can_place(
                        trial, exclude_entry_id=entry.entry_id, allow_relax=relax
                    )
                    if ok:
                        return Placement(day_id=day_id, slot_id=slot_id, room_id=trial.room_id)
                    last_reason = reason
        return None

    def _find_joint_candidate(
        self,
        entry: TimetableEntry,
        sibling: TimetableEntry,
        snapshot: ResolutionSnapshot,
        relax: RelaxFlags,
        prefer_low_load_day: bool,
    ) -> tuple[Placement, Placement] | None:
        master = snapshot.master
        pool = master.lab_rooms if entry.session_type == "LAB" else master.theory_rooms
        orders = sorted(master.slot_id_by_order.keys())
        days = sorted(
            master.day_rows,
            key=lambda d: self._day_load_rank(entry, int(d["day_id"]), snapshot, prefer_low_load_day),
        )
        for day in days:
            day_id = int(day["day_id"])
            for order in orders:
                if order + 1 not in master.slot_id_by_order:
                    continue
                slot_a = master.slot_id_by_order[order]
                slot_b = master.slot_id_by_order[order + 1]
                # Never place entries in global break slots or division-specific lunch slots
                if slot_a in master.break_slot_ids or slot_b in master.break_slot_ids:
                    continue
                if self._is_lunch_slot_for_entry(entry, order, master) or self._is_lunch_slot_for_entry(entry, order + 1, master):
                    continue
                for room in pool:
                    trial = deepcopy(entry)
                    trial_sib = deepcopy(sibling)
                    trial.day_id = day_id
                    trial.slot_id = slot_a
                    trial.room_id = str(room["room_id"])
                    trial_sib.day_id = day_id
                    trial_sib.slot_id = slot_b
                    trial_sib.room_id = str(room["room_id"])
                    orig_entry = deepcopy(entry)
                    orig_sib = deepcopy(sibling)
                    snapshot.validator.remove_entry(orig_entry)
                    snapshot.validator.remove_entry(orig_sib)
                    ok_a, _ = snapshot.validator.can_place(trial, exclude_entry_id=entry.entry_id, allow_relax=relax)
                    ok_b, _ = snapshot.validator.can_place(
                        trial_sib, exclude_entry_id=sibling.entry_id, allow_relax=relax
                    )
                    snapshot.validator.apply_entry(orig_entry)
                    snapshot.validator.apply_entry(orig_sib)
                    if ok_a and ok_b:
                        return (
                            Placement(day_id=day_id, slot_id=slot_a, room_id=trial.room_id),
                            Placement(day_id=day_id, slot_id=slot_b, room_id=trial_sib.room_id),
                        )
        return None

    def _move_lab_group(
        self,
        snapshot: ResolutionSnapshot,
        entry: TimetableEntry,
        relax_sequence: tuple[tuple[str, RelaxFlags], ...],
        *,
        prefer_low_load_day: bool = False,
    ) -> MoveResult:
        """
        Move a bound parallel-lab group as a unit to reduce manual coordinator work.
        This is strict-first, with optional gapless-only relaxation.
        """
        group_key = entry.lab_group_key
        if not group_key:
            return MoveResult(ok=False, unresolvable=True, reason="parallel_lab_group_bound")

        group_entries = [e for e in snapshot.entries.values() if e.lab_group_key == group_key]
        if len(group_entries) < 2:
            return MoveResult(ok=False, unresolvable=True, reason="parallel_lab_group_bound")

        master = snapshot.master
        orders = sorted({master.slot_order_by_id.get(e.slot_id, 0) for e in group_entries if e.slot_id})
        orders = [o for o in orders if o > 0]
        if not orders:
            return MoveResult(ok=False, unresolvable=True, reason="unknown_slot")

        min_order = min(orders)
        max_order = max(orders)
        span = max_order - min_order
        # Support 1-slot or contiguous 2-slot groups (common lab blocks).
        if span not in (0, 1):
            return MoveResult(ok=False, unresolvable=True, reason="block_contiguity_broken")

        # Map each entry to its offset (0 or 1) relative to group start.
        offsets: dict[str, int] = {}
        for e in group_entries:
            o = master.slot_order_by_id.get(e.slot_id, 0)
            offsets[e.entry_id] = 0 if span == 0 else max(0, min(1, o - min_order))

        days = sorted(
            master.day_rows,
            key=lambda d: self._day_load_rank(entry, int(d["day_id"]), snapshot, prefer_low_load_day),
        )
        all_orders = sorted(master.slot_id_by_order.keys())

        last_reason: str | None = None
        for pass_name, flags in relax_sequence:
            for day in days:
                day_id = int(day["day_id"])
                for start_order in all_orders:
                    if span == 1 and (start_order + 1) not in master.slot_id_by_order:
                        continue

                    # Quick reject: break/lunch for this division.
                    slot_a = master.slot_id_by_order.get(start_order)
                    slot_b = master.slot_id_by_order.get(start_order + 1) if span == 1 else None
                    if not slot_a:
                        continue
                    if slot_a in master.break_slot_ids or (slot_b and slot_b in master.break_slot_ids):
                        continue
                    if self._is_lunch_slot_for_entry(entry, start_order, master):
                        continue
                    if span == 1 and self._is_lunch_slot_for_entry(entry, start_order + 1, master):
                        continue

                    ok, reason = self._try_apply_lab_group_move(
                        snapshot,
                        group_entries,
                        offsets=offsets,
                        day_id=day_id,
                        start_order=start_order,
                        relax=flags,
                    )
                    if ok:
                        used_last = pass_name == "last"
                        result = MoveResult(
                            ok=True,
                            resolved_with_relaxation=used_last or pass_name != "strict",
                            relax_pass=pass_name,
                        )
                        if result.resolved_with_relaxation:
                            self._relax_moves += 1
                        return result
                    last_reason = reason or last_reason

        return MoveResult(ok=False, unresolvable=True, reason=last_reason or "parallel_lab_group_bound")

    def _try_apply_lab_group_move(
        self,
        snapshot: ResolutionSnapshot,
        group_entries: list[TimetableEntry],
        *,
        offsets: dict[str, int],
        day_id: int,
        start_order: int,
        relax: RelaxFlags,
    ) -> tuple[bool, str | None]:
        """
        Atomically apply a group move (rollback on failure).
        Returns (ok, failure_reason).
        """
        master = snapshot.master

        # Remove all group entries first so they don't block each other during placement checks.
        old_positions: dict[str, Placement] = {}
        for e in group_entries:
            old_positions[e.entry_id] = e.placement
            snapshot.validator.remove_entry(deepcopy(e))

        moved: list[str] = []
        used_rooms_by_offset: dict[int, set[str]] = defaultdict(set)
        last_reason: str | None = None

        try:
            # Place offset-0 first, then offset-1 (if any) for stability.
            ordered = sorted(group_entries, key=lambda e: (offsets.get(e.entry_id, 0), e.entry_id))
            for e in ordered:
                off = offsets.get(e.entry_id, 0)
                target_order = start_order + off
                slot_id = master.slot_id_by_order.get(target_order)
                if not slot_id:
                    last_reason = "unknown_slot"
                    raise ValueError("missing_slot")

                # Prefer keeping the same room if possible, otherwise pick any LAB room not used in this parallel slot.
                room_candidates: list[str] = []
                if e.room_id:
                    room_candidates.append(e.room_id)
                room_candidates.extend([str(r["room_id"]) for r in master.lab_rooms if str(r.get("room_id"))])

                placed = False
                for room_id in room_candidates:
                    if room_id in used_rooms_by_offset[off]:
                        continue
                    trial = deepcopy(e)
                    trial.day_id = day_id
                    trial.slot_id = slot_id
                    trial.room_id = room_id
                    ok, reason = snapshot.validator.can_place(
                        trial,
                        exclude_entry_id=e.entry_id,
                        allow_relax=relax,
                        ignore_lab_group_bound=True,
                    )
                    if ok:
                        snapshot.apply_move(e.entry_id, Placement(day_id=day_id, slot_id=slot_id, room_id=room_id))
                        moved.append(e.entry_id)
                        used_rooms_by_offset[off].add(room_id)
                        placed = True
                        break
                    last_reason = reason or last_reason

                if not placed:
                    raise ValueError("unplaced")

            return True, None
        except Exception:
            # Roll back moved entries and restore those not yet moved.
            for eid in moved:
                snapshot.rollback_move(eid, old_positions[eid])
            for e in group_entries:
                if e.entry_id in moved:
                    continue
                # Validator entry was removed above; re-apply the still-old snapshot entry.
                snapshot.validator.apply_entry(snapshot.entries[e.entry_id])
            return False, last_reason

    def _round_strict_violations(
        self,
        snapshot: ResolutionSnapshot,
        master: MasterData,
        unresolvable: list[dict[str, Any]],
    ) -> int:
        """
        Attempt to repair strict constraint violations beyond direct room/faculty conflicts/stress.
        This pass is strict-only (no relaxation), to avoid creating new violations.
        """
        moves = 0
        violations = snapshot.validator.validate_all_strict()
        if not violations:
            return 0

        skip_reasons = {"room_conflict", "faculty_conflict"}  # handled in dedicated rounds
        priority = {
            "break_slot": 0,
            "lunch_slot": 0,
            "shift_window_violation": 1,
            "division_batch_mutex": 1,
            "parallel_lab_window_broken": 2,
            "block_contiguity_broken": 2,
            "division_daily_cap": 3,
            "faculty_daily_cap": 3,
            "gapless_violation": 4,
            "unknown_slot": 5,
        }
        ordered = sorted(
            [v for v in violations if v.reason not in skip_reasons],
            key=lambda v: (priority.get(v.reason, 9), v.reason, v.entry_id),
        )

        strict_only = (("strict", PASS_STRICT),)
        for v in ordered[:20]:  # cap per iteration to avoid thrashing
            entry = snapshot.get(v.entry_id)
            if not entry:
                continue
            result = self._move_entry(snapshot, entry, strict_only)
            if result.ok:
                moves += 1
            else:
                self._record_unresolvable(snapshot, entry, "constraint_violation", v.reason, unresolvable)
        return moves

    def _day_load_rank(
        self, entry: TimetableEntry, day_id: int, snapshot: ResolutionSnapshot, prefer_low: bool
    ) -> int:
        if not prefer_low:
            return day_id
        load = sum(
            1
            for e in snapshot.entries.values()
            if e.division_id == entry.division_id and e.day_id == day_id and e.session_type in ("THEORY", "LAB")
        )
        return load

    @staticmethod
    def _longest_streak(
        rows: list[TimetableEntry], master: MasterData, threshold: int
    ) -> list[TimetableEntry]:
        if not rows:
            return []
        best: list[TimetableEntry] = []
        current = [rows[0]]
        for row in rows[1:]:
            prev = master.slot_order_by_id.get(current[-1].slot_id, 0)
            curr = master.slot_order_by_id.get(row.slot_id, 0)
            if curr == prev + 1:
                current.append(row)
            else:
                if len(current) > len(best):
                    best = current
                current = [row]
        if len(current) > len(best):
            best = current
        return best if len(best) > threshold else []

    def _record_unresolvable(
        self,
        snapshot: ResolutionSnapshot,
        entry: TimetableEntry,
        conflict_type: str,
        reason: str,
        bucket: list[dict[str, Any]],
    ) -> None:
        m = snapshot.master
        record = {
            "entry_id": entry.entry_id,
            "subject": m.subject_name_by_id.get(entry.subject_id, entry.subject_id),
            "faculty": m.faculty_name_by_id.get(entry.faculty_id, entry.faculty_id),
            "division": m.division_name_by_id.get(entry.division_id, entry.division_id),
            "day": m.day_name_by_id.get(str(entry.day_id), str(entry.day_id)),
            "slot": m.slot_label_by_id.get(entry.slot_id, entry.slot_id),
            "session_type": entry.session_type,
            "conflict_type": conflict_type,
            "reason": reason,
            "resolved_with_relaxation": False,
            "suggested_manual_action": SUGGESTED_ACTIONS.get(
                reason, "Adjust this entry manually in the timetable editor."
            ),
        }
        if not any(item.get("entry_id") == entry.entry_id and item.get("reason") == reason for item in bucket):
            bucket.append(record)


def pre_persist_integrity_check(entries: list[TimetableEntry], master: MasterData) -> list[ViolationReport]:
    fresh = TimetableConstraintValidator(TimetableSnapshot(entries={e.entry_id: e for e in entries}, master=master))
    return fresh.validate_all_strict()

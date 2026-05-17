"""Shared constraint validation for generator-aligned timetable scheduling."""

from __future__ import annotations



from collections import defaultdict

from dataclasses import dataclass

from typing import Any



from app.services.timetable_orchestrator import _block_within_window, _is_gapless_day_pattern

from app.services.timetable_scheduling_types import (

    DIVISION_DAILY_CAP_RELAXED,

    DIVISION_DAILY_CAP_STRICT,

    FACULTY_DAILY_CAP_RELAXED,

    FACULTY_DAILY_CAP_STRICT,

    MasterData,

    RelaxFlags,

    TimetableEntry,

    ViolationReport,

)





@dataclass

class TimetableSnapshot:

    """Indexed view of entries for O(1) constraint checks."""



    entries: dict[str, TimetableEntry]

    master: MasterData





class TimetableConstraintValidator:

    """Validates placements against generator-aligned rules."""



    def __init__(self, snapshot: TimetableSnapshot) -> None:

        self.snapshot = snapshot

        self.master = snapshot.master

        self._rebuild_indexes()



    def _rebuild_indexes(self) -> None:

        entries = list(self.snapshot.entries.values())

        self._faculty_busy: dict[tuple[str, int, str], str] = {}

        self._room_busy: dict[tuple[str, int, str], str] = {}

        self._div_full_busy: dict[tuple[str, int, str], str] = {}

        self._div_any_batch_busy: dict[tuple[str, int, str], str] = {}

        self._div_batch_busy: dict[tuple[str, str, int, str], str] = {}

        self._div_daily_load: dict[tuple[str, int], int] = defaultdict(int)

        self._fac_daily_load: dict[tuple[str, int], int] = defaultdict(int)

        self._div_slot_orders: dict[tuple[str, int], set[int]] = defaultdict(set)

        self._parallel_labs: dict[tuple[str, int, str], list[str]] = defaultdict(list)

        self._lab_group_bindings: dict[str, tuple[int, tuple[str, ...]]] = {}

        self._entry_lab_group: dict[str, str] = {}



        for entry in entries:

            self._index_entry(entry)

        self._detect_strict_lab_groups(entries)



    def _index_entry(self, entry: TimetableEntry) -> None:

        day_id = entry.day_id

        slot_id = entry.slot_id

        order = self.master.slot_order_by_id.get(slot_id, 0)



        self._faculty_busy[(entry.faculty_id, day_id, slot_id)] = entry.entry_id

        self._room_busy[(entry.room_id, day_id, slot_id)] = entry.entry_id



        if entry.batch_id:

            self._div_batch_busy[(entry.division_id, entry.batch_id, day_id, slot_id)] = entry.entry_id

            self._div_any_batch_busy[(entry.division_id, day_id, slot_id)] = entry.entry_id

            if entry.session_type == "LAB" and entry.batch_id not in self._parallel_labs[(entry.division_id, day_id, slot_id)]:

                self._parallel_labs[(entry.division_id, day_id, slot_id)].append(entry.batch_id)

        else:

            self._div_full_busy[(entry.division_id, day_id, slot_id)] = entry.entry_id



        if entry.session_type != "TUTORIAL":

            self._div_slot_orders[(entry.division_id, day_id)].add(order)

            if entry.session_type in ("THEORY", "LAB"):

                self._div_daily_load[(entry.division_id, day_id)] += 1

                self._fac_daily_load[(entry.faculty_id, day_id)] += 1



    def _unindex_entry(self, entry: TimetableEntry) -> None:

        day_id = entry.day_id

        slot_id = entry.slot_id

        order = self.master.slot_order_by_id.get(slot_id, 0)



        self._faculty_busy.pop((entry.faculty_id, day_id, slot_id), None)

        self._room_busy.pop((entry.room_id, day_id, slot_id), None)



        if entry.batch_id:

            self._div_batch_busy.pop((entry.division_id, entry.batch_id, day_id, slot_id), None)

            key = (entry.division_id, day_id, slot_id)

            if self._div_any_batch_busy.get(key) == entry.entry_id:

                others = [

                    e.entry_id

                    for e in self.snapshot.entries.values()

                    if e.entry_id != entry.entry_id

                    and e.batch_id

                    and e.division_id == entry.division_id

                    and e.day_id == day_id

                    and e.slot_id == slot_id

                ]

                if others:

                    self._div_any_batch_busy[key] = others[0]

                else:

                    self._div_any_batch_busy.pop(key, None)

            parallel = self._parallel_labs.get((entry.division_id, day_id, slot_id), [])

            if entry.batch_id in parallel:

                parallel.remove(entry.batch_id)

                if not parallel:

                    self._parallel_labs.pop((entry.division_id, day_id, slot_id), None)

        else:

            self._div_full_busy.pop((entry.division_id, day_id, slot_id), None)



        if entry.session_type != "TUTORIAL":

            orders = self._div_slot_orders.get((entry.division_id, day_id))

            if orders is not None:

                orders.discard(order)

                if not orders:

                    self._div_slot_orders.pop((entry.division_id, day_id), None)

            if entry.session_type in ("THEORY", "LAB"):

                dk = (entry.division_id, day_id)

                fk = (entry.faculty_id, day_id)

                self._div_daily_load[dk] = max(self._div_daily_load.get(dk, 0) - 1, 0)

                self._fac_daily_load[fk] = max(self._fac_daily_load.get(fk, 0) - 1, 0)



    def apply_entry(self, entry: TimetableEntry) -> None:

        self._index_entry(entry)



    def remove_entry(self, entry: TimetableEntry) -> None:

        self._unindex_entry(entry)



    def _detect_strict_lab_groups(self, entries: list[TimetableEntry]) -> None:

        block_groups: dict[tuple[str, int, tuple[str, ...]], list[TimetableEntry]] = defaultdict(list)

        for entry in entries:

            if entry.session_type != "LAB" or not entry.batch_id:

                continue

            order = self.master.slot_order_by_id.get(entry.slot_id, 0)

            sibling_slot = self.master.slot_id_by_order.get(order - 1)

            slot_tuple = tuple(sorted([entry.slot_id, sibling_slot] if sibling_slot else [entry.slot_id]))

            block_groups[(entry.division_id, entry.day_id, slot_tuple)].append(entry)



        for (division_id, day_id, slot_tuple), group in block_groups.items():

            batches = {e.batch_id for e in group if e.batch_id}

            faculties = {e.faculty_id for e in group}

            if len(batches) < 3 or len(faculties) < 3:

                continue

            group_key = f"{division_id}|{day_id}|{'-'.join(slot_tuple)}"

            self._lab_group_bindings[group_key] = (day_id, slot_tuple)

            for entry in group:

                self._entry_lab_group[entry.entry_id] = group_key

                entry.lab_group_key = group_key



    def is_lab_group_bound(self, entry_id: str) -> bool:

        return entry_id in self._entry_lab_group



    def can_place(

        self,

        entry: TimetableEntry,

        *,

        exclude_entry_id: str | None = None,

        allow_relax: RelaxFlags | None = None,

        also_place: TimetableEntry | None = None,

        ignore_lab_group_bound: bool = False,

    ) -> tuple[bool, str | None]:

        relax = allow_relax or RelaxFlags()

        exclude = exclude_entry_id or entry.entry_id



        if self.is_lab_group_bound(entry.entry_id) and not ignore_lab_group_bound:

            return False, "parallel_lab_group_bound"



        # Reject placement on global break slots

        if self.master.break_slot_ids and entry.slot_id in self.master.break_slot_ids:

            return False, "break_slot"



        # Reject placement on division-specific lunch slots

        slot_order = self.master.slot_order_by_id.get(entry.slot_id, 0)

        shift_name, _ = self.master.division_shift_by_id.get(

            entry.division_id, ("SHIFT_08_14", (8 * 60, 14 * 60))

        )

        div_lunch_order = self.master.lunch_slot_order_by_shift.get(shift_name)

        if div_lunch_order is not None and slot_order == div_lunch_order:

            return False, "lunch_slot"



        session = entry.session_type.upper()

        day_id = entry.day_id

        shift_name, shift_window = self.master.division_shift_by_id.get(

            entry.division_id, ("SHIFT_08_14", (8 * 60, 14 * 60))

        )

        lunch_order = self.master.lunch_slot_order_by_shift.get(shift_name)



        block_slots = self._block_slot_rows(entry, exclude)

        slot_rows = block_slots if len(block_slots) > 1 else [

            next((s for s in self.master.slot_rows if str(s.get("slot_id")) == entry.slot_id), None)

        ]

        slot_rows = [s for s in slot_rows if s]

        if not slot_rows:

            return False, "unknown_slot"



        if len(block_slots) > 1 and not self._validate_block_contiguity(slot_rows, shift_window, relax):

            return False, "block_contiguity_broken"



        slot_ids = [str(s["slot_id"]) for s in slot_rows]



        if session != "TUTORIAL" and not relax.shift and not _block_within_window(slot_rows, shift_window):

            return False, "shift_window_violation"



        for sid in slot_ids:

            if self._faculty_busy.get((entry.faculty_id, day_id, sid)) not in (None, exclude):

                return False, "faculty_conflict"

            if self._room_busy.get((entry.room_id, day_id, sid)) not in (None, exclude):

                return False, "room_conflict"

            if not self._division_mutex_ok(entry, day_id, sid, exclude):

                return False, "division_batch_mutex"



        if session != "TUTORIAL" and not relax.gapless:

            if not self._gapless_ok(entry, slot_ids, exclude, lunch_order):

                return False, "gapless_violation"



        duration = len(slot_ids)

        if session != "TUTORIAL":

            div_cap = DIVISION_DAILY_CAP_RELAXED if relax.division_daily else DIVISION_DAILY_CAP_STRICT

            if self._simulated_div_daily_load(entry, exclude, slot_ids) > div_cap:

                return False, "division_daily_cap"



        if session in ("THEORY", "LAB"):

            fac_cap = FACULTY_DAILY_CAP_RELAXED if relax.faculty_daily else FACULTY_DAILY_CAP_STRICT

            if self._simulated_fac_daily_load(entry, exclude, slot_ids) > fac_cap:

                return False, "faculty_daily_cap"



        if session == "LAB" and entry.batch_id and not relax.parallel_gate:

            if not self._parallel_window_ok(entry, slot_ids, exclude):

                return False, "parallel_lab_window_broken"



        if also_place is not None:

            ok2, reason2 = self.can_place(

                also_place,

                exclude_entry_id=also_place.entry_id,

                allow_relax=relax,

            )

            if not ok2:

                return ok2, reason2

            occupant = self._faculty_busy.get((entry.faculty_id, day_id, entry.slot_id))

            if occupant not in (None, exclude, also_place.entry_id):

                return False, "faculty_conflict"



        return True, None



    def _block_slot_rows(self, entry: TimetableEntry, exclude: str) -> list[dict[str, Any]]:

        order = self.master.slot_order_by_id.get(entry.slot_id, 0)

        siblings = [

            e

            for e in self.snapshot.entries.values()

            if e.entry_id != exclude

            and e.subject_id == entry.subject_id

            and e.faculty_id == entry.faculty_id

            and e.division_id == entry.division_id

            and e.day_id == entry.day_id

            and abs(self.master.slot_order_by_id.get(e.slot_id, 0) - order) == 1

        ]

        if not siblings:

            row = next((s for s in self.master.slot_rows if str(s.get("slot_id")) == entry.slot_id), None)

            return [row] if row else []



        orders = sorted({order, self.master.slot_order_by_id.get(siblings[0].slot_id, 0)})

        rows: list[dict[str, Any]] = []

        for o in orders:

            sid = self.master.slot_id_by_order.get(o)

            row = next((s for s in self.master.slot_rows if str(s.get("slot_id")) == sid), None)

            if row:

                rows.append(row)

        current = next((s for s in self.master.slot_rows if str(s.get("slot_id")) == entry.slot_id), None)

        if current and all(str(current["slot_id"]) != str(r["slot_id"]) for r in rows):

            rows.append(current)

        rows.sort(key=lambda r: int(r.get("slot_order") or 0))

        return rows



    def _validate_block_contiguity(

        self,

        block_slots: list[dict[str, Any]],

        shift_window: tuple[int, int],

        relax: RelaxFlags,

    ) -> bool:

        orders = sorted(int(s.get("slot_order") or 0) for s in block_slots)

        if orders != list(range(orders[0], orders[-1] + 1)):

            return False

        if not relax.shift and not _block_within_window(block_slots, shift_window):

            return False

        return True



    def _division_mutex_ok(self, entry: TimetableEntry, day_id: int, slot_id: str, exclude: str) -> bool:

        div = entry.division_id

        batch = entry.batch_id

        if batch:

            full = self._div_full_busy.get((div, day_id, slot_id))

            if full and full != exclude:

                return False

            bat = self._div_batch_busy.get((div, batch, day_id, slot_id))

            if bat and bat != exclude:

                return False

        else:

            full = self._div_full_busy.get((div, day_id, slot_id))

            if full and full != exclude:

                return False

            any_b = self._div_any_batch_busy.get((div, day_id, slot_id))

            if any_b and any_b != exclude:

                return False

        return True



    def _gapless_ok(

        self,

        entry: TimetableEntry,

        slot_ids: list[str],

        exclude: str,

        lunch_order: int | None,

    ) -> bool:

        orders: set[int] = set()

        for e in self.snapshot.entries.values():

            if e.division_id != entry.division_id or e.day_id != entry.day_id:

                continue

            if e.entry_id == exclude or e.session_type == "TUTORIAL":

                continue

            orders.add(self.master.slot_order_by_id.get(e.slot_id, 0))

        for sid in slot_ids:

            orders.add(self.master.slot_order_by_id.get(sid, 0))

        return _is_gapless_day_pattern(orders, lunch_order)



    def _simulated_div_daily_load(self, entry: TimetableEntry, exclude: str, new_slot_ids: list[str]) -> int:

        total = 0

        counted_slots: set[str] = set()

        for e in self.snapshot.entries.values():

            if e.division_id == entry.division_id and e.day_id == entry.day_id and e.entry_id != exclude:

                if e.session_type in ("THEORY", "LAB"):

                    total += 1

                    counted_slots.add(e.slot_id)

        for sid in new_slot_ids:

            if sid not in counted_slots:

                total += 1

        return total



    def _simulated_fac_daily_load(self, entry: TimetableEntry, exclude: str, new_slot_ids: list[str]) -> int:

        total = 0

        counted_slots: set[str] = set()

        for e in self.snapshot.entries.values():

            if e.faculty_id == entry.faculty_id and e.day_id == entry.day_id and e.entry_id != exclude:

                if e.session_type in ("THEORY", "LAB"):

                    total += 1

                    counted_slots.add(e.slot_id)

        for sid in new_slot_ids:

            if sid not in counted_slots:

                total += 1

        return total



    def _parallel_window_ok(self, entry: TimetableEntry, slot_ids: list[str], exclude: str) -> bool:

        required = self.master.required_parallel_labs_by_division.get(entry.division_id, 0)

        if required < 2:

            return True

        day_id = entry.day_id

        opening_new = True

        for sid in slot_ids:

            batches = [

                b

                for eid, e in ((e.entry_id, e) for e in self.snapshot.entries.values())

                if e.division_id == entry.division_id

                and e.day_id == day_id

                and e.slot_id == sid

                and e.session_type == "LAB"

                and e.batch_id

                and e.entry_id != exclude

                for b in [e.batch_id]

            ]

            if entry.batch_id and entry.batch_id in batches:

                batches = [b for b in batches if b != entry.batch_id]

            if len(batches) >= required:

                return False

            if batches:

                opening_new = False

        if opening_new:

            for (div, d, _), batches in list(self._parallel_labs.items()):

                if div == entry.division_id and d == day_id and 0 < len(batches) < required:

                    return False

        return True



    def validate_all_strict(self) -> list[ViolationReport]:

        violations: list[ViolationReport] = []

        for entry in self.snapshot.entries.values():

            ok, reason = self.can_place(entry, exclude_entry_id=entry.entry_id, allow_relax=RelaxFlags())

            if not ok:

                violations.append(ViolationReport(entry_id=entry.entry_id, reason=reason or "unknown"))

        return violations


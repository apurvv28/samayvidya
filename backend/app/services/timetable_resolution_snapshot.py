"""Mutable resolution snapshot with incremental constraint index updates."""
from __future__ import annotations

from copy import deepcopy

from app.services.timetable_constraint_validator import TimetableConstraintValidator, TimetableSnapshot
from app.services.timetable_scheduling_types import MasterData, Placement, TimetableEntry


class ResolutionSnapshot:
    """Live in-memory timetable state for resolver iterations."""

    def __init__(self, entries: list[TimetableEntry], master: MasterData) -> None:
        self.master = master
        self.entries: dict[str, TimetableEntry] = {e.entry_id: deepcopy(e) for e in entries if e.entry_id}
        self._validator = TimetableConstraintValidator(
            TimetableSnapshot(entries=self.entries, master=self.master)
        )

    @property
    def validator(self) -> TimetableConstraintValidator:
        return self._validator

    def get(self, entry_id: str) -> TimetableEntry | None:
        return self.entries.get(entry_id)

    def apply_move(self, entry_id: str, new: Placement) -> None:
        entry = self.entries[entry_id]
        old_copy = deepcopy(entry)
        self._validator.remove_entry(old_copy)
        entry.day_id = new.day_id
        entry.slot_id = new.slot_id
        entry.room_id = new.room_id
        self._validator.apply_entry(entry)

    def rollback_move(self, entry_id: str, old: Placement) -> None:
        entry = self.entries[entry_id]
        current = deepcopy(entry)
        self._validator.remove_entry(current)
        entry.day_id = old.day_id
        entry.slot_id = old.slot_id
        entry.room_id = old.room_id
        self._validator.apply_entry(entry)

    def commit_to_db_batch(self) -> list[dict]:
        return [entry.to_row() for entry in self.entries.values()]

    def pre_persist_integrity_check(self) -> list:
        fresh = TimetableConstraintValidator(
            TimetableSnapshot(entries=deepcopy(self.entries), master=self.master)
        )
        return fresh.validate_all_strict()

"""Shared types for timetable constraint validation and resolution."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

SHIFT_WINDOWS: dict[str, tuple[str, tuple[int, int]]] = {
    "SHIFT_08_14": ("SHIFT_08_14", (8 * 60, 14 * 60)),
    "SHIFT_10_16": ("SHIFT_10_16", (10 * 60, 16 * 60)),
    "SHIFT_12_18": ("SHIFT_12_18", (12 * 60, 18 * 60)),
}

SHIFT_LUNCH_SLOT_TIMES: dict[str, tuple[str, str]] = {
    "SHIFT_08_14": ("12:00", "13:00"),
    # Coordinators use a single common lunch break across shifts (see PDF export + timetable UI).
    # If this changes in the future, update the mapping and ensure time_slots includes the slot window.
    "SHIFT_10_16": ("12:00", "13:00"),
    "SHIFT_12_18": ("12:00", "13:00"),
}

DIVISION_DAILY_CAP_STRICT = 8
DIVISION_DAILY_CAP_RELAXED = 10
FACULTY_DAILY_CAP_STRICT = 6
FACULTY_DAILY_CAP_RELAXED = 8
MAX_SESSIONS_PER_DAY_STRICT = 8


@dataclass
class RelaxFlags:
    gapless: bool = False
    division_daily: bool = False
    faculty_daily: bool = False
    shift: bool = False
    parallel_gate: bool = False


PASS_STRICT = RelaxFlags()
PASS_RELAX_1 = RelaxFlags(gapless=True)
PASS_RELAX_2 = RelaxFlags(gapless=True, division_daily=True, faculty_daily=True)
PASS_LAST = RelaxFlags(
    gapless=True,
    division_daily=True,
    faculty_daily=True,
    shift=True,
    parallel_gate=True,
)

RELAX_PASSES: tuple[tuple[str, RelaxFlags], ...] = (
    ("strict", PASS_STRICT),
    ("relax_1", PASS_RELAX_1),
    ("relax_2", PASS_RELAX_2),
    ("last", PASS_LAST),
)


@dataclass
class Placement:
    day_id: int
    slot_id: str
    room_id: str

    def as_key(self) -> tuple[int, str, str]:
        return (self.day_id, self.slot_id, self.room_id)


@dataclass
class TimetableEntry:
    entry_id: str
    version_id: str | None
    division_id: str
    subject_id: str
    faculty_id: str
    room_id: str
    day_id: int
    slot_id: str
    batch_id: str | None
    session_type: str
    group_id: str | None = None
    lab_group_key: str | None = None

    @property
    def placement(self) -> Placement:
        return Placement(day_id=self.day_id, slot_id=self.slot_id, room_id=self.room_id)

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> TimetableEntry:
        batch_raw = row.get("batch_id")
        return cls(
            entry_id=str(row.get("entry_id") or ""),
            version_id=str(row["version_id"]) if row.get("version_id") else None,
            division_id=str(row.get("division_id") or ""),
            subject_id=str(row.get("subject_id") or ""),
            faculty_id=str(row.get("faculty_id") or ""),
            room_id=str(row.get("room_id") or ""),
            day_id=int(row.get("day_id") or 0),
            slot_id=str(row.get("slot_id") or ""),
            batch_id=str(batch_raw) if batch_raw not in (None, "") else None,
            session_type=str(row.get("session_type") or "THEORY").upper(),
        )

    def to_row(self) -> dict[str, Any]:
        return {
            "entry_id": self.entry_id,
            "version_id": self.version_id,
            "division_id": self.division_id,
            "subject_id": self.subject_id,
            "faculty_id": self.faculty_id,
            "room_id": self.room_id,
            "day_id": self.day_id,
            "slot_id": self.slot_id,
            "batch_id": self.batch_id,
            "session_type": self.session_type,
        }


@dataclass
class MasterData:
    slot_rows: list[dict[str, Any]]
    day_rows: list[dict[str, Any]]
    room_rows: list[dict[str, Any]]
    division_rows: list[dict[str, Any]]
    subject_rows: list[dict[str, Any]]
    faculty_rows: list[dict[str, Any]]
    batch_rows: list[dict[str, Any]]
    slot_order_by_id: dict[str, int] = field(default_factory=dict)
    slot_id_by_order: dict[int, str] = field(default_factory=dict)
    division_year_by_id: dict[str, str] = field(default_factory=dict)
    division_shift_by_id: dict[str, tuple[str, tuple[int, int]]] = field(default_factory=dict)
    lunch_slot_order_by_shift: dict[str, int | None] = field(default_factory=dict)
    batches_by_division: dict[str, list[str]] = field(default_factory=dict)
    required_parallel_labs_by_division: dict[str, int] = field(default_factory=dict)
    lab_rooms: list[dict[str, Any]] = field(default_factory=list)
    theory_rooms: list[dict[str, Any]] = field(default_factory=list)
    subject_name_by_id: dict[str, str] = field(default_factory=dict)
    faculty_name_by_id: dict[str, str] = field(default_factory=dict)
    division_name_by_id: dict[str, str] = field(default_factory=dict)
    day_name_by_id: dict[str, str] = field(default_factory=dict)
    slot_label_by_id: dict[str, str] = field(default_factory=dict)
    break_slot_ids: set[str] = field(default_factory=set)


@dataclass
class ViolationReport:
    entry_id: str
    reason: str


@dataclass
class MoveResult:
    ok: bool
    unresolvable: bool = False
    reason: str | None = None
    resolved_with_relaxation: bool = False
    relax_pass: str | None = None


class ResolverIntegrityError(Exception):
    def __init__(self, message: str, violations: list[ViolationReport] | None = None) -> None:
        super().__init__(message)
        self.violations = violations or []

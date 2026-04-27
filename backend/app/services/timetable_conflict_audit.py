"""Timetable conflict audit: slot-level and merged interval overlaps for rooms and faculty."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any


def fetch_timetable_entries_for_version(supabase: Any, version_id: str) -> list[dict]:
    """Paginated fetch of all rows for a version (PostgREST range limit safe)."""
    rows: list[dict] = []
    start = 0
    page = 1000
    while True:
        chunk = (
            supabase.table("timetable_entries")
            .select("*")
            .eq("version_id", version_id)
            .range(start, start + page - 1)
            .execute()
            .data
            or []
        )
        rows.extend(chunk)
        if len(chunk) < page:
            break
        start += page
    return rows


def _parse_minutes(t: object) -> int:
    s = str(t or "")[:8]
    parts = s.split(":")
    h = int(parts[0]) if parts and str(parts[0]).isdigit() else 0
    m = int(parts[1]) if len(parts) > 1 and str(parts[1]).isdigit() else 0
    return h * 60 + m


@dataclass(frozen=True)
class TimetableBlock:
    entry_ids: tuple[str, ...]
    day_id: int
    start_m: int
    end_m: int
    room_id: str
    faculty_id: str
    division_id: str
    batch_id: str | None
    session_type: str
    subject_id: str


def merge_entry_blocks(entries: list[dict], slot_rows: list[dict]) -> list[TimetableBlock]:
    """Merge consecutive slots with identical scheduling keys into one time interval."""
    slot_by_id = {str(s["slot_id"]): s for s in slot_rows}
    slot_order = {str(s["slot_id"]): int(s.get("slot_order") or 0) for s in slot_rows}

    def grp_key(e: dict) -> tuple:
        return (
            str(e["division_id"]),
            str(e["subject_id"]),
            str(e["faculty_id"]),
            str(e["room_id"]),
            str(e.get("batch_id") or ""),
            str(e.get("session_type") or ""),
            int(e["day_id"]),
        )

    groups: dict[tuple, list[dict]] = defaultdict(list)
    for e in entries:
        groups[grp_key(e)].append(e)

    blocks: list[TimetableBlock] = []
    for gkey, lst in groups.items():
        lst.sort(key=lambda row: slot_order.get(str(row["slot_id"]), 0))
        run: list[dict] = []
        for e in lst:
            if not run:
                run = [e]
                continue
            prev = run[-1]
            po = slot_order.get(str(prev["slot_id"]), 0)
            co = slot_order.get(str(e["slot_id"]), 0)
            if co == po + 1:
                run.append(e)
            else:
                blocks.append(_run_to_block(run, slot_by_id, gkey))
                run = [e]
        if run:
            blocks.append(_run_to_block(run, slot_by_id, gkey))
    return blocks


def _run_to_block(run: list[dict], slot_by_id: dict, gkey: tuple) -> TimetableBlock:
    division_id, subject_id, faculty_id, room_id, batch_id, session_type, day_id = gkey
    first = slot_by_id[str(run[0]["slot_id"])]
    last = slot_by_id[str(run[-1]["slot_id"])]
    start_m = _parse_minutes(first.get("start_time"))
    end_m = _parse_minutes(last.get("end_time"))
    bid = batch_id or None
    return TimetableBlock(
        entry_ids=tuple(str(r["entry_id"]) for r in run),
        day_id=int(day_id),
        start_m=start_m,
        end_m=end_m,
        room_id=room_id,
        faculty_id=faculty_id,
        division_id=division_id,
        batch_id=bid,
        session_type=session_type,
        subject_id=subject_id,
    )


def _intervals_overlap(a: TimetableBlock, b: TimetableBlock) -> bool:
    if a.day_id != b.day_id:
        return False
    return not (a.end_m <= b.start_m or b.end_m <= a.start_m)


def block_label(
    block: TimetableBlock,
    *,
    days: dict[str, dict],
    rooms: dict[str, dict],
    faculty: dict[str, dict],
    divisions: dict[str, dict],
    subjects: dict[str, dict],
    batch_code_by_id: dict[str, str] | None = None,
) -> str:
    dn = days.get(str(block.day_id), {}).get("day_name", "?")
    rn = rooms.get(block.room_id, {}).get("room_number", "?")
    fn = faculty.get(block.faculty_id, {}).get("faculty_name", "?")
    div = divisions.get(block.division_id, {}).get("division_name", "?")
    sn = subjects.get(block.subject_id, {}).get("subject_name", "?")
    t0 = f"{block.start_m // 60:02d}:{block.start_m % 60:02d}"
    t1 = f"{block.end_m // 60:02d}:{block.end_m % 60:02d}"
    bc = ""
    if block.batch_id and batch_code_by_id:
        code = batch_code_by_id.get(str(block.batch_id), "")
        if code:
            bc = f" [{code}]"
    elif block.batch_id:
        bc = " [batch]"
    return f"{dn} {t0}-{t1} | {div}{bc} | {block.session_type} | {sn} | {fn} | {rn}"


def entry_row_label(
    e: dict,
    *,
    slot_by_id: dict[str, dict],
    days: dict[str, dict],
    rooms: dict[str, dict],
    faculty: dict[str, dict],
    divisions: dict[str, dict],
    subjects: dict[str, dict],
    batch_code_by_id: dict[str, str] | None = None,
) -> str:
    s = slot_by_id.get(str(e["slot_id"]), {})
    st = _parse_minutes(s.get("start_time"))
    en = _parse_minutes(s.get("end_time"))
    t0 = f"{st // 60:02d}:{st % 60:02d}"
    t1 = f"{en // 60:02d}:{en % 60:02d}"
    dn = days.get(str(e["day_id"]), {}).get("day_name", "?")
    rn = rooms.get(str(e["room_id"]), {}).get("room_number", "?")
    fn = faculty.get(str(e["faculty_id"]), {}).get("faculty_name", "?")
    div = divisions.get(str(e["division_id"]), {}).get("division_name", "?")
    sn = subjects.get(str(e["subject_id"]), {}).get("subject_name", "?")
    bc = ""
    if e.get("batch_id") and batch_code_by_id:
        code = batch_code_by_id.get(str(e["batch_id"]), "")
        if code:
            bc = f" [{code}]"
    elif e.get("batch_id"):
        bc = " [batch]"
    return f"{dn} {t0}-{t1} | {div}{bc} | {e.get('session_type')} | {sn} | {fn} | {rn}"


def audit_timetable_conflicts(
    *,
    entries: list[dict],
    slot_rows: list[dict],
    days_by_id: dict[str, dict],
    rooms_by_id: dict[str, dict],
    faculty_by_id: dict[str, dict],
    divisions_by_id: dict[str, dict],
    subjects_by_id: dict[str, dict],
    batch_code_by_id: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Return structured conflict lists (empty when timetable is clean)."""
    slot_by_id = {str(s["slot_id"]): s for s in slot_rows}

    by_room_slot: dict[tuple, list[dict]] = defaultdict(list)
    by_fac_slot: dict[tuple, list[dict]] = defaultdict(list)
    for e in entries:
        by_room_slot[(e["day_id"], e["slot_id"], e["room_id"])].append(e)
        by_fac_slot[(e["day_id"], e["slot_id"], e["faculty_id"])].append(e)

    slot_room_conflicts: list[dict[str, Any]] = []
    for (day_id, slot_id, room_id), lst in by_room_slot.items():
        divs_here = {str(x["division_id"]) for x in lst}
        if len(lst) > 1 and len(divs_here) > 1:
            slot_room_conflicts.append(
                {
                    "day_id": day_id,
                    "slot_id": str(slot_id),
                    "room_id": str(room_id),
                    "division_ids": sorted(divs_here),
                    "entry_ids": [str(x["entry_id"]) for x in lst],
                    "labels": [
                        entry_row_label(
                            x,
                            slot_by_id=slot_by_id,
                            days=days_by_id,
                            rooms=rooms_by_id,
                            faculty=faculty_by_id,
                            divisions=divisions_by_id,
                            subjects=subjects_by_id,
                            batch_code_by_id=batch_code_by_id,
                        )
                        for x in lst
                    ],
                }
            )

    slot_faculty_conflicts: list[dict[str, Any]] = []
    for (day_id, slot_id, fac_id), lst in by_fac_slot.items():
        rooms_here = {str(x["room_id"]) for x in lst}
        divs_here = {str(x["division_id"]) for x in lst}
        if len(lst) > 1 and (len(rooms_here) > 1 or len(divs_here) > 1):
            slot_faculty_conflicts.append(
                {
                    "day_id": day_id,
                    "slot_id": str(slot_id),
                    "faculty_id": str(fac_id),
                    "entry_ids": [str(x["entry_id"]) for x in lst],
                    "labels": [
                        entry_row_label(
                            x,
                            slot_by_id=slot_by_id,
                            days=days_by_id,
                            rooms=rooms_by_id,
                            faculty=faculty_by_id,
                            divisions=divisions_by_id,
                            subjects=subjects_by_id,
                            batch_code_by_id=batch_code_by_id,
                        )
                        for x in lst
                    ],
                }
            )

    blocks = merge_entry_blocks(entries, slot_rows)
    interval_room: list[dict[str, Any]] = []
    interval_faculty: list[dict[str, Any]] = []
    for i, a in enumerate(blocks):
        for b in blocks[i + 1 :]:
            if a.room_id == b.room_id and a.division_id != b.division_id and _intervals_overlap(a, b):
                interval_room.append(
                    {
                        "room_id": a.room_id,
                        "a": {
                            "entry_ids": list(a.entry_ids),
                            "label": block_label(
                                a,
                                days=days_by_id,
                                rooms=rooms_by_id,
                                faculty=faculty_by_id,
                                divisions=divisions_by_id,
                                subjects=subjects_by_id,
                                batch_code_by_id=batch_code_by_id,
                            ),
                        },
                        "b": {
                            "entry_ids": list(b.entry_ids),
                            "label": block_label(
                                b,
                                days=days_by_id,
                                rooms=rooms_by_id,
                                faculty=faculty_by_id,
                                divisions=divisions_by_id,
                                subjects=subjects_by_id,
                                batch_code_by_id=batch_code_by_id,
                            ),
                        },
                    }
                )
            if a.faculty_id == b.faculty_id and _intervals_overlap(a, b):
                if a.division_id == b.division_id and a.room_id == b.room_id and a.batch_id != b.batch_id:
                    continue
                interval_faculty.append(
                    {
                        "faculty_id": a.faculty_id,
                        "a": {
                            "entry_ids": list(a.entry_ids),
                            "label": block_label(
                                a,
                                days=days_by_id,
                                rooms=rooms_by_id,
                                faculty=faculty_by_id,
                                divisions=divisions_by_id,
                                subjects=subjects_by_id,
                                batch_code_by_id=batch_code_by_id,
                            ),
                        },
                        "b": {
                            "entry_ids": list(b.entry_ids),
                            "label": block_label(
                                b,
                                days=days_by_id,
                                rooms=rooms_by_id,
                                faculty=faculty_by_id,
                                divisions=divisions_by_id,
                                subjects=subjects_by_id,
                                batch_code_by_id=batch_code_by_id,
                            ),
                        },
                    }
                )

    return {
        "entry_count": len(entries),
        "block_count": len(blocks),
        "slot_level_room_conflicts": slot_room_conflicts,
        "slot_level_faculty_conflicts": slot_faculty_conflicts,
        "interval_room_overlaps": interval_room,
        "interval_faculty_overlaps": interval_faculty,
        "has_conflicts": bool(
            slot_room_conflicts or slot_faculty_conflicts or interval_room or interval_faculty
        ),
    }

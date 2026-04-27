"""CLI wrapper: run timetable conflict audit for a version_id (uses service role from .env)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from dotenv import load_dotenv

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))
load_dotenv(_BACKEND / ".env", override=True)

from app.supabase_client import get_service_supabase  # noqa: E402
from app.services.timetable_conflict_audit import (  # noqa: E402
    audit_timetable_conflicts,
    fetch_timetable_entries_for_version,
)


def main() -> None:
    version_id = sys.argv[1] if len(sys.argv) > 1 else "ac550ddf-ba8e-4246-8f43-562fc3e1b351"
    sb = get_service_supabase()
    entries = fetch_timetable_entries_for_version(sb, version_id)
    slot_rows = sb.table("time_slots").select("*").order("slot_order").execute().data or []
    days_by_id = {str(d["day_id"]): d for d in (sb.table("days").select("*").execute().data or [])}
    rooms_by_id = {str(r["room_id"]): r for r in (sb.table("rooms").select("*").execute().data or [])}
    faculty_by_id = {str(f["faculty_id"]): f for f in (sb.table("faculty").select("*").execute().data or [])}
    divisions_by_id = {str(d["division_id"]): d for d in (sb.table("divisions").select("*").execute().data or [])}
    subjects_by_id = {str(s["subject_id"]): s for s in (sb.table("subjects").select("*").execute().data or [])}
    batch_code_by_id = {
        str(b["batch_id"]): str(b.get("batch_code") or "")
        for b in (sb.table("batches").select("*").execute().data or [])
        if b.get("batch_id")
    }
    report = audit_timetable_conflicts(
        entries=entries,
        slot_rows=slot_rows,
        days_by_id=days_by_id,
        rooms_by_id=rooms_by_id,
        faculty_by_id=faculty_by_id,
        divisions_by_id=divisions_by_id,
        subjects_by_id=subjects_by_id,
        batch_code_by_id=batch_code_by_id,
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

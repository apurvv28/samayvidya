"""Export per-slot timetable rows for SY-CSAI divisions (Sem 2) as TSV: Day, Slot, Type, Subject, Faculty, Room, Batch."""
from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

from dotenv import load_dotenv

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))
load_dotenv(_BACKEND / ".env", override=True)

from app.supabase_client import get_service_supabase  # noqa: E402
from app.services.timetable_conflict_audit import fetch_timetable_entries_for_version  # noqa: E402

TARGET_DIVISIONS = frozenset(
    {
        "SY-CSAI-A",
        "SY-CSAI-B",
        "SY-CSAI-C",
        "SY-CSAI-D",
        "SY-CSAI-E",
        "SY-CSAI-SEDA",
    }
)


def main() -> None:
    version_id = sys.argv[1] if len(sys.argv) > 1 else "ac550ddf-ba8e-4246-8f43-562fc3e1b351"
    sb = get_service_supabase()
    entries = fetch_timetable_entries_for_version(sb, version_id)
    slot_by_id = {
        str(s["slot_id"]): s
        for s in (sb.table("time_slots").select("*").order("slot_order").execute().data or [])
    }
    days = {str(d["day_id"]): d for d in (sb.table("days").select("*").execute().data or [])}
    rooms = {str(r["room_id"]): r for r in (sb.table("rooms").select("*").execute().data or [])}
    faculty = {str(f["faculty_id"]): f for f in (sb.table("faculty").select("*").execute().data or [])}
    divisions = {str(d["division_id"]): d for d in (sb.table("divisions").select("*").execute().data or [])}
    subjects = {str(s["subject_id"]): s for s in (sb.table("subjects").select("*").execute().data or [])}
    batches = {str(b["batch_id"]): b for b in (sb.table("batches").select("*").execute().data or [])}

    by_div: dict[str, list[dict]] = {}
    for e in entries:
        dname = divisions.get(str(e["division_id"]), {}).get("division_name", "")
        if dname not in TARGET_DIVISIONS:
            continue
        by_div.setdefault(str(e["division_id"]), []).append(e)

    out = io.StringIO()
    for div_id in sorted(by_div.keys(), key=lambda did: divisions.get(did, {}).get("division_name", "")):
        div_name = divisions.get(div_id, {}).get("division_name", div_id)
        w = csv.writer(out, delimiter="\t", lineterminator="\n")
        out.write(f"# Division: {div_name}\n# version_id: {version_id}\n")
        w.writerow(["Day", "Slot (time)", "Type", "Subject", "Faculty", "Room", "Batch"])
        rows = sorted(
            by_div[div_id],
            key=lambda r: (
                int(days.get(str(r["day_id"]), {}).get("day_id", 0) or 0),
                int(slot_by_id.get(str(r["slot_id"]), {}).get("slot_order") or 0),
            ),
        )
        for r in rows:
            day_name = days.get(str(r["day_id"]), {}).get("day_name", "")
            s = slot_by_id.get(str(r["slot_id"]), {})
            slot_label = f"{str(s.get('start_time', ''))[:5]}-{str(s.get('end_time', ''))[:5]}"
            batch = ""
            if r.get("batch_id"):
                batch = batches.get(str(r["batch_id"]), {}).get("batch_code", "") or ""
            w.writerow(
                [
                    day_name,
                    slot_label,
                    r.get("session_type") or "",
                    subjects.get(str(r["subject_id"]), {}).get("subject_name", ""),
                    faculty.get(str(r["faculty_id"]), {}).get("faculty_name", ""),
                    rooms.get(str(r["room_id"]), {}).get("room_number", ""),
                    batch,
                ]
            )
        w.writerow([])

    print(out.getvalue())


if __name__ == "__main__":
    main()

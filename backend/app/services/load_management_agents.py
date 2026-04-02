import json
from collections import defaultdict
from typing import Any, Dict, List

from pydantic import BaseModel, Field


class LoadDistributionRowSummary(BaseModel):
    faculty_name: str
    year: str | None = None
    division: str | None = None
    normalized_division: str | None = None
    subject: str | None = None
    batch: str | None = None
    theory_hrs: float = 0
    lab_hrs: float = 0
    tutorial_hrs: float = 0
    total_hrs_per_week: float = 0
    effective_hours: float = 0


class FacultyLoadSummary(BaseModel):
    faculty_name: str
    total_rows: int
    total_theory_hours: float
    total_lab_hours: float
    total_tutorial_hours: float
    total_effective_hours: float
    divisions: List[str] = Field(default_factory=list)


class LoadAssignmentOutput(BaseModel):
    rows: List[LoadDistributionRowSummary]
    faculty_summaries: List[FacultyLoadSummary]
    validation_passed: bool
    notes: str = ""


def _normalize_division(value: Any) -> str:
    normalized = str(value or "").strip().upper()
    for prefix in ("FY-", "SY-", "TY-", "LY-"):
        if normalized.startswith(prefix):
            return normalized[len(prefix):]
    return normalized


def _as_float(value: Any) -> float:
    if value in (None, ""):
        return 0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0


def _effective_hours(row: Dict[str, Any]) -> float:
    total = _as_float(row.get("total_hrs_per_week"))
    if total:
        return total
    return _as_float(row.get("theory_hrs")) + _as_float(row.get("lab_hrs")) + _as_float(row.get("tutorial_hrs"))


class LoadManagementCrew:
    def calculate_and_validate_load(self, load_distribution_data: List[Dict[str, Any]]) -> str:
        """Summarize persisted load-distribution rows for timetable preparation."""
        row_summaries: List[LoadDistributionRowSummary] = []
        faculty_totals: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "total_rows": 0,
                "total_theory_hours": 0.0,
                "total_lab_hours": 0.0,
                "total_tutorial_hours": 0.0,
                "total_effective_hours": 0.0,
                "divisions": set(),
            }
        )

        for row in load_distribution_data:
            faculty_name = str(row.get("faculty_name") or "").strip()
            if not faculty_name:
                continue

            theory_hrs = _as_float(row.get("theory_hrs"))
            lab_hrs = _as_float(row.get("lab_hrs"))
            tutorial_hrs = _as_float(row.get("tutorial_hrs"))
            effective_hours = _effective_hours(row)
            division = str(row.get("division") or "").strip()
            normalized_division = _normalize_division(division)

            row_summaries.append(
                LoadDistributionRowSummary(
                    faculty_name=faculty_name,
                    year=str(row.get("year") or "").strip() or None,
                    division=division or None,
                    normalized_division=normalized_division or None,
                    subject=str(row.get("subject") or "").strip() or None,
                    batch=str(row.get("batch") or "").strip() or None,
                    theory_hrs=theory_hrs,
                    lab_hrs=lab_hrs,
                    tutorial_hrs=tutorial_hrs,
                    total_hrs_per_week=_as_float(row.get("total_hrs_per_week")),
                    effective_hours=effective_hours,
                )
            )

            faculty_summary = faculty_totals[faculty_name]
            faculty_summary["total_rows"] += 1
            faculty_summary["total_theory_hours"] += theory_hrs
            faculty_summary["total_lab_hours"] += lab_hrs
            faculty_summary["total_tutorial_hours"] += tutorial_hrs
            faculty_summary["total_effective_hours"] += effective_hours
            if normalized_division:
                faculty_summary["divisions"].add(normalized_division)

        faculty_summaries = [
            FacultyLoadSummary(
                faculty_name=faculty_name,
                total_rows=summary["total_rows"],
                total_theory_hours=summary["total_theory_hours"],
                total_lab_hours=summary["total_lab_hours"],
                total_tutorial_hours=summary["total_tutorial_hours"],
                total_effective_hours=summary["total_effective_hours"],
                divisions=sorted(summary["divisions"]),
            )
            for faculty_name, summary in sorted(faculty_totals.items(), key=lambda item: item[0].lower())
        ]

        return LoadAssignmentOutput(
            rows=row_summaries,
            faculty_summaries=faculty_summaries,
            validation_passed=bool(row_summaries),
            notes="Load distribution summarized from persisted rows. Faculty table is no longer required for this flow.",
        ).model_dump_json()

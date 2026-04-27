"""PDF generation routes for timetables."""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response, HTMLResponse
import html
import io
import re
from datetime import datetime
from urllib.parse import quote
from xml.sax.saxutils import escape

from app.supabase_client import get_service_supabase
from app.routers.timetable_versions import _hydrate_version_row

_REPORTLAB_IMPORT_ERROR: str | None = None
try:
    from reportlab.lib.pagesizes import landscape, A3, A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
except ImportError as exc:
    _REPORTLAB_IMPORT_ERROR = str(exc)
    landscape = A4 = colors = getSampleStyleSheet = ParagraphStyle = None
    TA_CENTER = TA_LEFT = TA_RIGHT = None
    SimpleDocTemplate = Table = TableStyle = Paragraph = Spacer = PageBreak = None

router = APIRouter(prefix="/pdf", tags=["pdf"])


def _norm_day_id(value: object) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _norm_slot_id(value: object) -> str:
    return str(value) if value is not None else ""


def _para_escape(value: object) -> str:
    """Escape text embedded in ReportLab Paragraph markup (&, <, > break the mini-HTML parser)."""
    return escape(str(value if value is not None else ""), entities={'"': "&quot;", "'": "&apos;"})


def _safe_filename_part(value: object) -> str:
    s = str(value or "").strip() or "export"
    s = re.sub(r'[<>:"/\\|?*]', "-", s)
    return s.replace(" ", "_")[:120]


def _html_session_badge_style(session_type: str | None) -> str:
    """Inline CSS for session-type chip in HTML timetable preview."""
    t = (session_type or "THEORY").upper().strip()
    palette = {
        "THEORY": ("#E3F2FD", "#0D47A1", "#1565C0"),
        "LAB": ("#E0F2F1", "#004D40", "#00897B"),
        "PRACTICAL": ("#E0F2F1", "#004D40", "#00897B"),
        "TUTORIAL": ("#EDE7F6", "#4A148C", "#6A1B9A"),
    }
    bg, fg, brd = palette.get(t, ("#ECEFF1", "#37474F", "#546E7A"))
    return (
        f"display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;"
        f"letter-spacing:0.02em;background-color:{bg};color:{fg};border:1px solid {brd};"
    )


def _timetable_division_names_caption(entries: list, divisions: list) -> str:
    """Unique division names that actually appear in these timetable entries (not the full department list)."""
    seen: set[str] = set()
    order: list[str] = []
    for entry in entries or []:
        did = entry.get("division_id")
        if not did:
            continue
        sid = str(did)
        if sid not in seen:
            seen.add(sid)
            order.append(sid)
    if not order:
        return ""
    name_by_id = {
        str(d.get("division_id")): str(d.get("division_name") or d.get("division_id") or "")
        for d in (divisions or [])
        if d.get("division_id")
    }
    labels = [name_by_id.get(i, i) for i in order]
    labels.sort(key=str.casefold)
    return ", ".join(labels)


def _content_disposition_attachment(filename: str) -> str:
    """Build a Content-Disposition value safe for Latin-1 header encoding (non-ASCII via RFC 5987 filename*)."""
    raw = (filename or "timetable.pdf").strip() or "timetable.pdf"
    if not raw.lower().endswith(".pdf"):
        raw = f"{raw}.pdf"
    ascii_fallback = raw.encode("ascii", "replace").decode("ascii")
    ascii_fallback = re.sub(r'[\x00-\x1f\r\n"\\]', "_", ascii_fallback).strip() or "timetable.pdf"
    encoded = quote(raw, safe="")
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"


def generate_timetable_pdf(entries, days, slots, version_meta, divisions, faculty, subjects, rooms, batches):
    """Generate readable PDF bytes for a timetable using ReportLab."""

    if not landscape or not SimpleDocTemplate:
        raise Exception("ReportLab not properly installed")

    # Build lookups (normalize ids so timetable_entries match reference rows)
    day_map = {_norm_day_id(d.get("day_id")): d.get("day_name", f"Day {d.get('day_id')}") for d in days if _norm_day_id(d.get("day_id")) is not None}
    slot_map: dict[str, str] = {}
    for s in slots:
        sid = _norm_slot_id(s.get("slot_id"))
        if sid:
            slot_map[sid] = f"{s.get('start_time')}-{s.get('end_time')}"
    div_map = {str(d.get("division_id")): d.get("division_name", d.get("division_id")) for d in divisions if d.get("division_id")}
    fac_map = {str(f.get("faculty_id")): f.get("faculty_name", f.get("faculty_id")) for f in faculty if f.get("faculty_id")}
    subj_map = {
        str(s.get("subject_id")): s.get("short_code", s.get("subject_name", s.get("subject_id")))
        for s in subjects
        if s.get("subject_id")
    }
    room_map = {str(r.get("room_id")): r.get("room_name", r.get("room_number", r.get("room_id"))) for r in rooms if r.get("room_id")}
    batch_map = {str(b.get("batch_id")): b.get("batch_code", b.get("batch_name", "")) for b in batches if b.get("batch_id")}

    sorted_days = sorted(days, key=lambda d: d.get("day_id", 0))
    sorted_slots = sorted(slots, key=lambda s: s.get("slot_order", 0))

    # Group entries by division first to avoid unreadable overlap in each cell.
    division_entries: dict[str, list[dict]] = {}
    for entry in entries:
        division_id = entry.get("division_id")
        if not division_id:
            continue
        division_entries.setdefault(str(division_id), []).append(entry)

    if not division_entries:
        raise Exception("No timetable entries available for PDF generation")

    pdf_buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=landscape(A3),
        topMargin=0.52 * inch,
        bottomMargin=0.42 * inch,
        leftMargin=0.38 * inch,
        rightMargin=0.38 * inch,
    )
    story = []
    styles = getSampleStyleSheet()

    generated_timestamp = datetime.now().strftime("%d %b %Y, %I:%M %p")

    # Brand palette (print-friendly, high contrast)
    brand_primary = colors.HexColor("#0B1F3A")
    brand_secondary = colors.HexColor("#1565C0")
    brand_accent = colors.HexColor("#00A896")
    brand_accent_soft = colors.HexColor("#B2DFDB")
    bg_soft = colors.HexColor("#E3F2FD")
    bg_page = colors.HexColor("#EEF3FA")
    meta_card_bg = colors.HexColor("#F0F7FF")
    session_type_colors = {
        "THEORY": "#1565C0",
        "LAB": "#00897B",
        "TUTORIAL": "#6A1B9A",
        "PRACTICAL": "#00897B",
    }

    title_style = ParagraphStyle(
        "PdfTitle",
        parent=styles["Heading1"],
        fontSize=17,
        leading=20,
        textColor=brand_primary,
        alignment=TA_LEFT,
        spaceAfter=6,
        fontName="Helvetica-Bold",
    )
    brand_style = ParagraphStyle(
        "PdfBrand",
        parent=styles["Normal"],
        fontSize=9,
        leading=10,
        textColor=brand_secondary,
        alignment=TA_LEFT,
        fontName="Helvetica-Bold",
        spaceAfter=2,
    )
    meta_style = ParagraphStyle(
        "PdfMeta",
        parent=styles["Normal"],
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#1E293B"),
        alignment=TA_LEFT,
        spaceAfter=2,
    )
    meta_card_style = ParagraphStyle(
        "PdfMetaCard",
        parent=styles["Normal"],
        fontSize=8.6,
        leading=11,
        textColor=colors.HexColor("#334155"),
        alignment=TA_LEFT,
        spaceAfter=0,
    )
    cell_style = ParagraphStyle(
        "PdfCell",
        parent=styles["Normal"],
        fontSize=7.6,
        leading=9,
        textColor=colors.HexColor("#0F172A"),
    )
    footer_style = ParagraphStyle(
        "PdfFooter",
        parent=styles["Normal"],
        fontSize=8.2,
        textColor=colors.HexColor("#475569"),
        alignment=TA_CENTER,
        spaceBefore=5,
    )

    def _draw_page_chrome(canvas, doc_obj):
        """Paint branded page frame and vector motifs for a polished export look."""
        canvas.saveState()
        page_width, page_height = landscape(A3)

        # Soft page wash
        canvas.setFillColor(bg_page)
        canvas.rect(0, 0, page_width, page_height, stroke=0, fill=1)

        # Top brand ribbon + accent strip
        canvas.setFillColor(brand_primary)
        canvas.rect(0, page_height - 30, page_width, 30, stroke=0, fill=1)
        canvas.setFillColor(brand_accent)
        canvas.rect(0, page_height - 34, page_width, 4, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 11)
        canvas.drawString(doc_obj.leftMargin, page_height - 22, "SamayVidya")
        canvas.setFont("Helvetica", 8.5)
        canvas.setFillColor(colors.Color(1, 1, 1, alpha=0.88))
        canvas.drawRightString(page_width - doc_obj.rightMargin, page_height - 21, "Academic timetable")

        # Decorative accents
        canvas.setFillColor(colors.Color(0, 0.66, 0.59, alpha=0.12))
        canvas.circle(page_width - 56, page_height - 54, 26, stroke=0, fill=1)
        canvas.setFillColor(colors.Color(0.08, 0.4, 0.75, alpha=0.1))
        canvas.circle(page_width - 18, page_height - 36, 18, stroke=0, fill=1)
        canvas.setStrokeColor(colors.Color(0.09, 0.41, 0.67, alpha=0.28))
        canvas.setLineWidth(1.0)
        canvas.line(doc_obj.leftMargin, page_height - 32, page_width - doc_obj.rightMargin, page_height - 32)

        # Footer
        footer_y = doc_obj.bottomMargin - 12
        canvas.setStrokeColor(brand_accent_soft)
        canvas.setLineWidth(1.2)
        canvas.line(doc_obj.leftMargin, footer_y + 18, page_width - doc_obj.rightMargin, footer_y + 18)
        canvas.setStrokeColor(colors.HexColor("#94A3B8"))
        canvas.setLineWidth(0.5)
        canvas.line(doc_obj.leftMargin, footer_y + 16, page_width - doc_obj.rightMargin, footer_y + 16)
        canvas.setFillColor(colors.HexColor("#475569"))
        canvas.setFont("Helvetica", 8.2)
        canvas.drawString(doc_obj.leftMargin, footer_y + 2, f"Generated by SamayVidya on {generated_timestamp}")
        canvas.drawRightString(page_width - doc_obj.rightMargin, footer_y + 2, f"Page {canvas.getPageNumber()}")

        canvas.restoreState()

    def _safe_meta(value):
        if value is None:
            return "-"
        text = str(value).strip()
        return text if text else "-"

    division_ids_sorted = sorted(
        division_entries.keys(),
        key=lambda division_id: div_map.get(division_id, division_id),
    )
    timetable_div_names_all = _timetable_division_names_caption(entries, divisions)
    content_width = landscape(A3)[0] - doc.leftMargin - doc.rightMargin

    for page_index, division_id in enumerate(division_ids_sorted):
        division_name = div_map.get(division_id, division_id)
        version_name = _safe_meta((version_meta or {}).get("version_name"))
        academic_year = _safe_meta((version_meta or {}).get("academic_year"))
        semester = _safe_meta((version_meta or {}).get("semester"))
        wef_date = _safe_meta((version_meta or {}).get("wef_date"))
        to_date = _safe_meta((version_meta or {}).get("to_date"))

        story.append(Paragraph("SAMAYVIDYA · TIMETABLE EXPORT", brand_style))
        story.append(Paragraph(f"Division timetable: {_para_escape(division_name)}", title_style))
        story.append(
            Paragraph(
                f"<font color='#1565C0'><b>Version</b></font> "
                f"<font color='#334155'>{_para_escape(version_name)}</font>",
                meta_style,
            )
        )
        meta_rows = [
            [
                Paragraph(
                    f"<b><font color='#0B1F3A'>Academic year</font></b><br/>"
                    f"<font color='#475569'>{_para_escape(academic_year)}</font>",
                    meta_card_style,
                ),
                Paragraph(
                    f"<b><font color='#0B1F3A'>Semester</font></b><br/>"
                    f"<font color='#475569'>{_para_escape(semester)}</font>",
                    meta_card_style,
                ),
            ],
            [
                Paragraph(
                    f"<b><font color='#0B1F3A'>Valid from</font></b><br/>"
                    f"<font color='#475569'>{_para_escape(wef_date)}</font>",
                    meta_card_style,
                ),
                Paragraph(
                    f"<b><font color='#0B1F3A'>Valid to</font></b><br/>"
                    f"<font color='#475569'>{_para_escape(to_date)}</font>",
                    meta_card_style,
                ),
            ],
        ]
        meta_table = Table(meta_rows, colWidths=[content_width / 2.0] * 2, hAlign="LEFT")
        meta_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), meta_card_bg),
                    ("BOX", (0, 0), (-1, -1), 1.0, brand_secondary),
                    ("LINEABOVE", (0, 1), (-1, 1), 0.55, colors.HexColor("#90CAF9")),
                    ("LINEBEFORE", (1, 0), (1, -1), 0.55, colors.HexColor("#90CAF9")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(meta_table)
        if page_index == 0 and timetable_div_names_all and len(division_ids_sorted) > 1:
            story.append(Spacer(1, 0.06 * inch))
            story.append(
                Paragraph(
                    f"<b><font color='#0B1F3A'>Timetable divisions</font></b> "
                    f"<font color='#475569'>{_para_escape(timetable_div_names_all)}</font>",
                    meta_style,
                )
            )
        story.append(Spacer(1, 0.14 * inch))

        # Build division-local map: (day_id, slot_id) -> entries
        cell_map: dict[tuple[int | None, str], list[dict]] = {}
        for entry in division_entries[division_id]:
            d_id = _norm_day_id(entry.get("day_id"))
            s_id = _norm_slot_id(entry.get("slot_id"))
            if d_id is None or not s_id:
                continue
            cell_map.setdefault((d_id, s_id), []).append(entry)

        table_data = []
        table_data.append(["Day / Slot"] + [slot_map.get(_norm_slot_id(slot.get("slot_id")), _norm_slot_id(slot.get("slot_id"))) for slot in sorted_slots])

        for day in sorted_days:
            day_id = _norm_day_id(day.get("day_id"))
            row = [day_map.get(day_id, f"Day {day.get('day_id')}")]

            for slot in sorted_slots:
                slot_id = _norm_slot_id(slot.get("slot_id"))
                cell_entries = cell_map.get((day_id, slot_id), []) if day_id is not None else []
                if not cell_entries:
                    row.append("")
                    continue

                lines = []
                # Keep cell compact and readable.
                for entry in cell_entries[:3]:
                    subj = _para_escape(subj_map.get(str(entry.get("subject_id")), "-"))
                    fac = _para_escape(fac_map.get(str(entry.get("faculty_id")), "-"))
                    room = _para_escape(room_map.get(str(entry.get("room_id")), "-"))
                    batch_id = entry.get("batch_id")
                    batch_code = _para_escape(batch_map.get(str(batch_id), "")) if batch_id else ""
                    batch_prefix = f"[{batch_code}] " if batch_code else ""
                    stype_raw = str(entry.get("session_type") or "THEORY").upper().strip()
                    stype = _para_escape(stype_raw)
                    stype_color = session_type_colors.get(stype_raw, "#475569")
                    lines.append(
                        f"<font size='6' color='{stype_color}'><b>{stype}</b></font> "
                        f"{batch_prefix}<font color='#0F172A'><b>{subj}</b></font><br/>"
                        f"<font size='6.5' color='#64748B'>{fac} · {room}</font>"
                    )

                if len(cell_entries) > 3:
                    lines.append("<font size='6.5' color='#666666'>+ more</font>")

                row.append(Paragraph("<br/>".join(lines), cell_style))

            table_data.append(row)

        page_width = content_width
        day_col_width = 1.05 * inch
        num_slot_cols = len(sorted_slots)
        slot_col_width = (page_width - day_col_width) / num_slot_cols if num_slot_cols > 0 else 1.2 * inch
        col_widths = [day_col_width] + [slot_col_width] * num_slot_cols

        # ReportLab requires repeatRows < number of table rows (header-only tables would assert).
        repeat_rows = 1 if len(table_data) > 1 else 0
        table = Table(table_data, colWidths=col_widths, repeatRows=repeat_rows)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), brand_primary),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 8.5),
                    ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                    ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
                    ("LINEBELOW", (0, 0), (-1, 0), 2.5, brand_accent),
                    ("BACKGROUND", (0, 1), (0, -1), bg_soft),
                    ("TEXTCOLOR", (0, 1), (0, -1), brand_primary),
                    ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 1), (0, -1), 8.2),
                    ("ALIGN", (0, 1), (0, -1), "CENTER"),
                    ("VALIGN", (0, 1), (0, -1), "MIDDLE"),
                    ("LINEAFTER", (0, 0), (0, -1), 1.0, brand_secondary),
                    ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#B0BEC5")),
                    ("ROWBACKGROUNDS", (1, 1), (-1, -1), [colors.white, colors.HexColor("#F5FAFF")]),
                    ("LINEBEFORE", (1, 1), (1, -1), 0.55, colors.HexColor("#CFD8DC")),
                    ("VALIGN", (1, 1), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, 0), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
                ]
            )
        )

        story.append(table)
        story.append(
            Paragraph(
                "<font color='#00A896'><b>—</b></font> "
                "<font color='#64748B'>Prepared by SamayVidya · Academic timetable engine</font>",
                footer_style,
            )
        )

        if page_index < len(division_ids_sorted) - 1:
            story.append(PageBreak())

    try:
        doc.build(story, onFirstPage=_draw_page_chrome, onLaterPages=_draw_page_chrome)
    except Exception as e:
        raise Exception(f"PDF build failed: {str(e)}")

    pdf_buffer.seek(0)
    return pdf_buffer.getvalue()


@router.get("/timetable/download/{version_id}")
async def download_timetable_pdf(
    version_id: str,
    section: str = Query("division", pattern="^(division|room|faculty)$"),
    entity_id: str | None = Query(None),
):
    """Generate and download timetable PDF for a specific version."""
    
    if not SimpleDocTemplate:
        hint = (
            "Run the API with backend/venv (ReportLab is listed in requirements.txt). "
            "Windows: double-click backend/run_dev.bat or: backend\\venv\\Scripts\\python.exe -m uvicorn app.main:app --reload"
        )
        detail = f"PDF generation library not available. {hint}"
        if _REPORTLAB_IMPORT_ERROR:
            detail = f"{detail} ({_REPORTLAB_IMPORT_ERROR})"
        raise HTTPException(status_code=500, detail=detail)
    
    try:
        supabase = get_service_supabase()
        
        # Fetch version with entries
        version_response = supabase.table("timetable_versions").select("*").eq("version_id", version_id).single().execute()
        version_data = version_response.data
        if not version_data:
            raise HTTPException(status_code=404, detail="Timetable version not found")
        
        # Hydrate metadata
        version_hydrated = _hydrate_version_row(version_data)
        
        # Fetch entries for this version
        entries_response = supabase.table("timetable_entries").select("*").eq("version_id", version_id).execute()
        entries = entries_response.data or []

        # Scope export to the selected modal entity when provided.
        if entity_id:
            if section == "division":
                entries = [row for row in entries if str(row.get("division_id")) == str(entity_id)]
            elif section == "room":
                entries = [row for row in entries if str(row.get("room_id")) == str(entity_id)]
            else:
                entries = [row for row in entries if str(row.get("faculty_id")) == str(entity_id)]

        if not entries:
            raise HTTPException(status_code=404, detail="No timetable entries found for the selected export scope")
        
        # Fetch reference data
        days_response = supabase.table("days").select("*").execute()
        days = days_response.data or []
        
        slots_response = supabase.table("time_slots").select("*").execute()
        slots = slots_response.data or []
        
        divisions_response = supabase.table("divisions").select("*").execute()
        divisions = divisions_response.data or []
        
        faculty_response = supabase.table("faculty").select("*").execute()
        faculty = faculty_response.data or []
        
        subjects_response = supabase.table("subjects").select("*").execute()
        subjects = subjects_response.data or []
        
        rooms_response = supabase.table("rooms").select("*").execute()
        rooms = rooms_response.data or []
        
        batches_response = supabase.table("batches").select("*").execute()
        batches = batches_response.data or []

        # If exporting a specific division, keep division metadata focused to that division.
        if entity_id and section == "division":
            divisions = [row for row in divisions if str(row.get("division_id")) == str(entity_id)]
        
        # Generate PDF
        pdf_bytes = generate_timetable_pdf(
            entries, days, slots, version_hydrated,
            divisions, faculty, subjects, rooms, batches
        )
        
        # Create file response (null-safe version name)
        raw_version_name = version_hydrated.get("version_name") if version_hydrated else None
        safe_version_name = _safe_filename_part(raw_version_name if raw_version_name is not None else "export")
        scope_label = section
        if entity_id:
            if section == "division":
                div_lookup = {str(item.get("division_id")): str(item.get("division_name") or item.get("division_id")) for item in divisions}
                scope_label = div_lookup.get(str(entity_id), str(entity_id))
            elif section == "room":
                room_lookup = {str(item.get("room_id")): str(item.get("room_number") or item.get("room_name") or item.get("room_id")) for item in rooms}
                scope_label = room_lookup.get(str(entity_id), str(entity_id))
            else:
                faculty_lookup = {str(item.get("faculty_id")): str(item.get("faculty_code") or item.get("faculty_name") or item.get("faculty_id")) for item in faculty}
                scope_label = faculty_lookup.get(str(entity_id), str(entity_id))

        safe_scope_label = _safe_filename_part(scope_label)
        if section == "division" and entity_id:
            filename = f"{safe_scope_label}_{safe_version_name}.pdf"
        elif section == "faculty" and entity_id:
            filename = f"{safe_scope_label}_{safe_version_name}.pdf"
        elif section == "room" and entity_id:
            filename = f"{safe_scope_label}_{safe_version_name}.pdf"
        else:
            filename = f"timetable_{safe_scope_label}_{safe_version_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": _content_disposition_attachment(filename)},
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")


@router.get("/timetable/preview/{version_id}")
async def preview_timetable_html(
    version_id: str,
    section: str = Query("division", pattern="^(division|room|faculty)$"),
    entity_id: str | None = Query(None),
):
    """Preview timetable as HTML (browser print / Save as PDF). Does not require ReportLab."""
    
    try:
        supabase = get_service_supabase()
        
        # Fetch version with entries
        version_response = supabase.table("timetable_versions").select("*").eq("version_id", version_id).single().execute()
        version_data = version_response.data
        if not version_data:
            raise HTTPException(status_code=404, detail="Timetable version not found")
        
        # Hydrate metadata
        version_hydrated = _hydrate_version_row(version_data)
        
        # Fetch entries for this version
        entries_response = supabase.table("timetable_entries").select("*").eq("version_id", version_id).execute()
        entries = entries_response.data or []

        if entity_id:
            if section == "division":
                entries = [row for row in entries if str(row.get("division_id")) == str(entity_id)]
            elif section == "room":
                entries = [row for row in entries if str(row.get("room_id")) == str(entity_id)]
            else:
                entries = [row for row in entries if str(row.get("faculty_id")) == str(entity_id)]

        if not entries:
            raise HTTPException(status_code=404, detail="No timetable entries found for the selected preview scope")
        
        # Fetch reference data
        days_response = supabase.table("days").select("*").execute()
        days = days_response.data or []
        
        slots_response = supabase.table("time_slots").select("*").execute()
        slots = slots_response.data or []
        
        divisions_response = supabase.table("divisions").select("*").execute()
        divisions = divisions_response.data or []
        
        faculty_response = supabase.table("faculty").select("*").execute()
        faculty = faculty_response.data or []
        
        subjects_response = supabase.table("subjects").select("*").execute()
        subjects = subjects_response.data or []
        
        rooms_response = supabase.table("rooms").select("*").execute()
        rooms = rooms_response.data or []
        
        batches_response = supabase.table("batches").select("*").execute()
        batches = batches_response.data or []
        
        # Build lookups (string keys; normalized day/slot for cell map)
        day_map = {_norm_day_id(d.get("day_id")): d.get("day_name", f"Day {d.get('day_id')}") for d in days if _norm_day_id(d.get("day_id")) is not None}
        slot_map: dict[str, str] = {}
        for s in slots:
            sid = _norm_slot_id(s.get("slot_id"))
            if sid:
                slot_map[sid] = f"{s.get('start_time')}-{s.get('end_time')}"
        fac_map = {str(f.get("faculty_id")): f.get("faculty_name", f.get("faculty_id")) for f in faculty if f.get("faculty_id")}
        subj_map = {
            str(s.get("subject_id")): s.get("short_code", s.get("subject_name", s.get("subject_id")))
            for s in subjects
            if s.get("subject_id")
        }
        room_map = {str(r.get("room_id")): r.get("room_name", r.get("room_number", r.get("room_id"))) for r in rooms if r.get("room_id")}
        batch_map = {str(b.get("batch_id")): b.get("batch_code", b.get("batch_name", "")) for b in batches if b.get("batch_id")}
        
        # Group entries
        cell_map: dict[tuple[int | None, str], list[dict]] = {}
        for entry in entries:
            d_id = _norm_day_id(entry.get("day_id"))
            s_id = _norm_slot_id(entry.get("slot_id"))
            if d_id is None or not s_id:
                continue
            cell_map.setdefault((d_id, s_id), []).append(entry)
        
        sorted_days = sorted(days, key=lambda d: d.get("day_id", 0))
        sorted_slots = sorted(slots, key=lambda s: s.get("slot_order", 0))
        
        # Build table rows
        rows = []
        for day in sorted_days:
            day_id = _norm_day_id(day.get("day_id"))
            day_name = html.escape(str(day_map.get(day_id, f"Day {day.get('day_id')}")))
            
            row_cells = [f"<td class='pdf-day'>{day_name}</td>"]

            for slot in sorted_slots:
                slot_id = _norm_slot_id(slot.get("slot_id"))
                cell_entries = cell_map.get((day_id, slot_id), []) if day_id is not None else []

                cell_html = "<td class='pdf-slot'>"

                if cell_entries:
                    for entry in cell_entries:
                        subj = html.escape(str(subj_map.get(str(entry.get("subject_id")), "")))
                        fac = html.escape(str(fac_map.get(str(entry.get("faculty_id")), "")))
                        session_type_raw = str(entry.get("session_type", "THEORY")).upper()
                        session_type = html.escape(session_type_raw)
                        room = html.escape(str(room_map.get(str(entry.get("room_id")), "")))
                        batch_id = entry.get("batch_id")
                        batch_code = html.escape(str(batch_map.get(str(batch_id), ""))) if batch_id else ""
                        batch_prefix = f"<span class='pdf-batch'>[{batch_code}]</span> " if batch_code else ""
                        st_style = _html_session_badge_style(session_type_raw)

                        cell_html += f"""
                        <div class='pdf-cell-block'>
                            <div class='pdf-cell-line1'><span style='{st_style}'>{session_type}</span> {batch_prefix}<span class='pdf-subj'>{subj}</span></div>
                            <div class='pdf-cell-line2'>{fac} · {room}</div>
                        </div>
                        """
                else:
                    cell_html += "<div class='pdf-empty-cell'></div>"

                cell_html += "</td>"
                row_cells.append(cell_html)
            
            rows.append(f"<tr>{''.join(row_cells)}</tr>")
        
        # Build header
        header_cells = ["<th class='pdf-th pdf-th-corner'>Day / Slot</th>"]
        for slot in sorted_slots:
            slot_label = html.escape(str(slot_map.get(_norm_slot_id(slot.get("slot_id")), _norm_slot_id(slot.get("slot_id")))))
            header_cells.append(f"<th class='pdf-th'>{slot_label}</th>")
        
        metadata_html = ""
        if version_hydrated:
            version_name = html.escape(str(version_hydrated.get("version_name", "") or "N/A"))
            academic_year = html.escape(str(version_hydrated.get("academic_year", "") or "N/A"))
            semester = html.escape(str(version_hydrated.get("semester", "") or "N/A"))
            wef_date = html.escape(str(version_hydrated.get("wef_date", "") or "N/A"))
            to_date = html.escape(str(version_hydrated.get("to_date", "") or "N/A"))
            timetable_divs_raw = _timetable_division_names_caption(entries, divisions)
            div_scope_html = (
                f"<p class='pdf-div-scope'><strong>Division(s) in this timetable</strong> "
                f"<span>{html.escape(timetable_divs_raw)}</span></p>"
                if timetable_divs_raw
                else ""
            )

            metadata_html = f"""
            <div class="pdf-meta-card">
                <div class="pdf-meta-grid">
                    <div><span class="pdf-meta-k">Version</span><span class="pdf-meta-v">{version_name}</span></div>
                    <div><span class="pdf-meta-k">Academic year</span><span class="pdf-meta-v">{academic_year}</span></div>
                    <div><span class="pdf-meta-k">Semester</span><span class="pdf-meta-v">{semester}</span></div>
                    <div><span class="pdf-meta-k">Valid</span><span class="pdf-meta-v">{wef_date} → {to_date}</span></div>
                </div>
                {div_scope_html}
            </div>
            """
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Timetable Preview</title>
            <style>
                :root {{
                    --brand: #0B1F3A;
                    --brand-mid: #1565C0;
                    --accent: #00A896;
                    --page: #EEF3FA;
                    --card: #F0F7FF;
                    --muted: #475569;
                }}
                body {{
                    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
                    margin: 0;
                    padding: 24px 20px 40px;
                    color: #1e293b;
                    background: linear-gradient(180deg, var(--page) 0%, #e2e8f0 100%);
                    min-height: 100vh;
                }}
                .pdf-banner {{
                    background: linear-gradient(90deg, var(--brand) 0%, var(--brand-mid) 100%);
                    color: #fff;
                    padding: 14px 18px;
                    border-radius: 12px;
                    margin-bottom: 18px;
                    border-bottom: 4px solid var(--accent);
                    box-shadow: 0 8px 24px rgba(11, 31, 58, 0.2);
                }}
                .pdf-banner h1 {{
                    margin: 0;
                    font-size: 1.35rem;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                }}
                .pdf-banner p {{ margin: 6px 0 0; font-size: 0.85rem; opacity: 0.92; }}
                .pdf-meta-card {{
                    background: var(--card);
                    border: 1px solid var(--brand-mid);
                    border-radius: 10px;
                    padding: 14px 16px;
                    margin-bottom: 22px;
                    box-shadow: 0 2px 12px rgba(21, 101, 192, 0.08);
                }}
                .pdf-meta-grid {{
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px 16px;
                }}
                .pdf-meta-k {{
                    display: block;
                    font-size: 0.72rem;
                    font-weight: 700;
                    color: var(--brand);
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }}
                .pdf-meta-v {{ font-size: 0.9rem; color: var(--muted); }}
                .pdf-div-scope {{ margin: 12px 0 0; font-size: 0.88rem; color: var(--muted); }}
                .pdf-div-scope strong {{ color: var(--brand); margin-right: 6px; }}
                table {{
                    border-collapse: collapse;
                    width: 100%;
                    background: #fff;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 4px 20px rgba(15, 23, 42, 0.08);
                }}
                .pdf-th {{
                    background: linear-gradient(90deg, var(--brand) 0%, var(--brand-mid) 100%);
                    color: #fff;
                    padding: 10px 8px;
                    font-size: 0.82rem;
                    font-weight: 600;
                    border-left: 1px solid rgba(255,255,255,0.12);
                    border-bottom: 3px solid var(--accent);
                    text-align: center;
                }}
                .pdf-th-corner {{ text-align: left; border-left: none; }}
                .pdf-day {{
                    background: #E3F2FD;
                    color: var(--brand);
                    font-weight: 700;
                    padding: 10px 8px;
                    border: 1px solid #90CAF9;
                    vertical-align: top;
                    white-space: nowrap;
                }}
                .pdf-slot {{
                    border: 1px solid #B0BEC5;
                    padding: 6px;
                    vertical-align: top;
                    background: #fafcff;
                }}
                tr:nth-child(even) .pdf-slot {{ background: #f5f9ff; }}
                .pdf-cell-block {{
                    border: 1px solid #cfd8dc;
                    border-radius: 6px;
                    padding: 6px 8px;
                    margin-bottom: 6px;
                    font-size: 10px;
                    background: linear-gradient(145deg, #fff 0%, #f0f7ff 100%);
                }}
                .pdf-cell-line1 {{ margin-bottom: 4px; line-height: 1.35; }}
                .pdf-cell-line2 {{ font-size: 9px; color: #64748b; }}
                .pdf-subj {{ font-weight: 700; color: #0f172a; }}
                .pdf-batch {{ color: #546e7a; font-weight: 600; }}
                .pdf-empty-cell {{ min-height: 52px; }}
                .no-print {{
                    margin: 12px 0 20px;
                    text-align: center;
                }}
                .no-print button {{
                    background: linear-gradient(90deg, #0d9488 0%, #0891b2 100%);
                    color: #fff;
                    border: none;
                    padding: 12px 22px;
                    font-size: 14px;
                    font-weight: 600;
                    border-radius: 10px;
                    cursor: pointer;
                    box-shadow: 0 4px 14px rgba(13, 148, 136, 0.35);
                }}
                .no-print button:hover {{ filter: brightness(1.06); }}
                @media print {{
                    .no-print {{ display: none; }}
                    body {{ background: #fff; padding: 0; }}
                }}
            </style>
        </head>
        <body>
            <div class="no-print">
                <button type="button" onclick="window.print()">Print / Save as PDF</button>
            </div>
            <div class="pdf-banner">
                <h1>SamayVidya · Timetable preview</h1>
                <p>Academic timetable overview — use Print to save as PDF.</p>
            </div>
            {metadata_html}
            <table>
                <thead>
                    <tr>{''.join(header_cells)}</tr>
                </thead>
                <tbody>
                    {''.join(rows)}
                </tbody>
            </table>
        </body>
        </html>
        """
        
        return HTMLResponse(content=html_content)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"HTML generation failed: {str(e)}")


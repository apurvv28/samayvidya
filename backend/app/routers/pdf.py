"""PDF generation routes for timetables."""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
import io
from datetime import datetime

from app.supabase_client import get_service_supabase
from app.routers.timetable_versions import _hydrate_version_row

try:
    from reportlab.lib.pagesizes import landscape, A3, A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
except ImportError:
    landscape = A4 = colors = getSampleStyleSheet = ParagraphStyle = None
    TA_CENTER = TA_LEFT = TA_RIGHT = None
    SimpleDocTemplate = Table = TableStyle = Paragraph = Spacer = PageBreak = None

router = APIRouter(prefix="/pdf", tags=["pdf"])


def generate_timetable_pdf(entries, days, slots, version_meta, divisions, faculty, subjects, rooms, batches):
    """Generate readable PDF bytes for a timetable using ReportLab."""

    if not landscape or not SimpleDocTemplate:
        raise Exception("ReportLab not properly installed")

    # Build lookups
    day_map = {d["day_id"]: d.get("day_name", f"Day {d['day_id']}") for d in days}
    slot_map = {s["slot_id"]: f"{s['start_time']}-{s['end_time']}" for s in slots}
    div_map = {d["division_id"]: d.get("division_name", d["division_id"]) for d in divisions}
    fac_map = {f["faculty_id"]: f.get("faculty_name", f["faculty_id"]) for f in faculty}
    subj_map = {s["subject_id"]: s.get("short_code", s.get("subject_name", s["subject_id"])) for s in subjects}
    room_map = {r["room_id"]: r.get("room_name", r.get("room_number", r["room_id"])) for r in rooms}
    batch_map = {b["batch_id"]: b.get("batch_code", b.get("batch_name", "")) for b in batches}

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
        topMargin=0.35 * inch,
        bottomMargin=0.35 * inch,
        leftMargin=0.35 * inch,
        rightMargin=0.35 * inch,
    )
    story = []
    styles = getSampleStyleSheet()

    generated_timestamp = datetime.now().strftime("%d %b %Y, %I:%M %p")

    # Brand palette
    brand_primary = colors.HexColor("#0F2747")
    brand_secondary = colors.HexColor("#1769AA")
    brand_accent = colors.HexColor("#21B6A8")
    bg_soft = colors.HexColor("#F5F8FC")

    title_style = ParagraphStyle(
        "PdfTitle",
        parent=styles["Heading1"],
        fontSize=14.5,
        leading=17,
        textColor=brand_primary,
        alignment=TA_LEFT,
        spaceAfter=4,
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
        textColor=colors.HexColor("#334155"),
        alignment=TA_LEFT,
        spaceAfter=2,
    )
    cell_style = ParagraphStyle(
        "PdfCell",
        parent=styles["Normal"],
        fontSize=7.2,
        leading=8.2,
        textColor=colors.HexColor("#111111"),
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

        # Top brand ribbon
        canvas.setFillColor(brand_primary)
        canvas.rect(0, page_height - 20, page_width, 20, stroke=0, fill=1)

        # Decorative geometric accent (SVG-like circles and lines)
        canvas.setFillColor(colors.Color(0.13, 0.71, 0.66, alpha=0.14))
        canvas.circle(page_width - 54, page_height - 52, 24, stroke=0, fill=1)
        canvas.setFillColor(colors.Color(0.09, 0.41, 0.67, alpha=0.12))
        canvas.circle(page_width - 20, page_height - 34, 16, stroke=0, fill=1)
        canvas.setStrokeColor(colors.Color(0.09, 0.41, 0.67, alpha=0.35))
        canvas.setLineWidth(1.1)
        canvas.line(doc_obj.leftMargin, page_height - 27, page_width - doc_obj.rightMargin, page_height - 27)

        # Footer line and generated text on every page
        footer_y = doc_obj.bottomMargin - 10
        canvas.setStrokeColor(colors.HexColor("#CBD5E1"))
        canvas.setLineWidth(0.8)
        canvas.line(doc_obj.leftMargin, footer_y + 16, page_width - doc_obj.rightMargin, footer_y + 16)
        canvas.setFillColor(colors.HexColor("#475569"))
        canvas.setFont("Helvetica", 8.2)
        canvas.drawString(doc_obj.leftMargin, footer_y + 3, f"Generated by SamayVidya on {generated_timestamp}")
        canvas.drawRightString(page_width - doc_obj.rightMargin, footer_y + 3, f"Page {canvas.getPageNumber()}")

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

    for page_index, division_id in enumerate(division_ids_sorted):
        division_name = div_map.get(division_id, division_id)
        version_name = _safe_meta((version_meta or {}).get("version_name"))
        academic_year = _safe_meta((version_meta or {}).get("academic_year"))
        semester = _safe_meta((version_meta or {}).get("semester"))
        wef_date = _safe_meta((version_meta or {}).get("wef_date"))
        to_date = _safe_meta((version_meta or {}).get("to_date"))

        story.append(Paragraph("SAMAYVIDYA TIMETABLE SYSTEM", brand_style))
        story.append(Paragraph(f"Division Timetable: {division_name}", title_style))
        story.append(Paragraph(f"Version: {version_name}", meta_style))
        story.append(Paragraph(f"Academic Year: {academic_year} | Semester: {semester}", meta_style))
        story.append(Paragraph(f"Valid From: {wef_date} | To: {to_date}", meta_style))
        story.append(Spacer(1, 0.11 * inch))

        # Build division-local map: (day_id, slot_id) -> entries
        cell_map: dict[tuple[int, str], list[dict]] = {}
        for entry in division_entries[division_id]:
            day_id = entry.get("day_id")
            slot_id = entry.get("slot_id")
            if day_id is None or slot_id is None:
                continue
            key = (day_id, slot_id)
            cell_map.setdefault(key, []).append(entry)

        table_data = []
        table_data.append(["Day / Slot"] + [slot_map.get(slot["slot_id"], slot["slot_id"]) for slot in sorted_slots])

        for day in sorted_days:
            day_id = day["day_id"]
            row = [day_map.get(day_id, f"Day {day_id}")]

            for slot in sorted_slots:
                slot_id = slot["slot_id"]
                cell_entries = cell_map.get((day_id, slot_id), [])
                if not cell_entries:
                    row.append("")
                    continue

                lines = []
                # Keep cell compact and readable.
                for entry in cell_entries[:3]:
                    subj = subj_map.get(entry.get("subject_id"), "-")
                    fac = fac_map.get(entry.get("faculty_id"), "-")
                    room = room_map.get(entry.get("room_id"), "-")
                    batch_id = entry.get("batch_id")
                    batch_code = batch_map.get(batch_id, "") if batch_id else ""
                    batch_prefix = f"[{batch_code}] " if batch_code else ""
                    lines.append(f"{batch_prefix}{subj}<br/><font size='6.5' color='#444444'>{fac} | {room}</font>")

                if len(cell_entries) > 3:
                    lines.append("<font size='6.5' color='#666666'>+ more</font>")

                row.append(Paragraph("<br/>".join(lines), cell_style))

            table_data.append(row)

        page_width = landscape(A3)[0] - (doc.leftMargin + doc.rightMargin)
        day_col_width = 1.0 * inch
        num_slot_cols = len(sorted_slots)
        slot_col_width = (page_width - day_col_width) / num_slot_cols if num_slot_cols > 0 else 1.2 * inch
        col_widths = [day_col_width] + [slot_col_width] * num_slot_cols

        table = Table(table_data, colWidths=col_widths, repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), brand_primary),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 8),
                    ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                    ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
                    ("BACKGROUND", (0, 1), (0, -1), bg_soft),
                    ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 1), (0, -1), 8),
                    ("ALIGN", (0, 1), (0, -1), "CENTER"),
                    ("VALIGN", (0, 1), (0, -1), "MIDDLE"),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C7D2E0")),
                    ("ROWBACKGROUNDS", (1, 1), (-1, -1), [colors.white, colors.HexColor("#F8FBFF")]),
                    ("LINEBEFORE", (1, 1), (1, -1), 0.4, colors.HexColor("#D6E2F0")),
                    ("VALIGN", (1, 1), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 3),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )

        story.append(table)
        story.append(Paragraph("Prepared by SamayVidya • Academic Timetable Engine", footer_style))

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
        raise HTTPException(status_code=500, detail="PDF generation library not available")
    
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
        safe_version_name = (str(raw_version_name).strip() if raw_version_name is not None else "") or "export"
        safe_version_name = safe_version_name.replace(" ", "_")
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

        safe_scope_label = scope_label.replace(" ", "_").replace("/", "-")
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
            headers={"Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{filename}"},
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")


@router.get("/timetable/preview/{version_id}")
async def preview_timetable_html(version_id: str):
    """Preview timetable as HTML (for browser viewing)."""
    
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
        
        # Build lookups and table
        day_map = {d["day_id"]: d.get("day_name", f"Day {d['day_id']}") for d in days}
        slot_map = {s["slot_id"]: f"{s['start_time']}-{s['end_time']}" for s in slots}
        fac_map = {f["faculty_id"]: f.get("faculty_name", f["faculty_id"]) for f in faculty}
        subj_map = {s["subject_id"]: s.get("short_code", s.get("subject_name", s["subject_id"])) for s in subjects}
        room_map = {r["room_id"]: r.get("room_name", r["room_id"]) for r in rooms}
        batch_map = {b["batch_id"]: b.get("batch_code", b.get("batch_name", "")) for b in batches}
        
        # Group entries
        cell_map = {}
        for entry in entries:
            key = (entry.get("day_id"), entry.get("slot_id"))
            if key not in cell_map:
                cell_map[key] = []
            cell_map[key].append(entry)
        
        sorted_days = sorted(days, key=lambda d: d.get("day_id", 0))
        sorted_slots = sorted(slots, key=lambda s: s.get("slot_order", 0))
        
        # Build table rows
        rows = []
        for day in sorted_days:
            day_id = day["day_id"]
            day_name = day_map.get(day_id, f"Day {day_id}")
            
            row_cells = [f"<td style='background-color: #f0f0f0; font-weight: bold; padding: 8px; border: 1px solid #ccc;'>{day_name}</td>"]
            
            for slot in sorted_slots:
                slot_id = slot["slot_id"]
                cell_entries = cell_map.get((day_id, slot_id), [])
                
                cell_html = "<td style='border: 1px solid #ccc; padding: 4px; vertical-align: top;'>"
                
                if cell_entries:
                    for entry in cell_entries:
                        subj = subj_map.get(entry.get("subject_id"), "")
                        fac = fac_map.get(entry.get("faculty_id"), "")
                        session_type = entry.get("session_type", "THEORY").upper()
                        room = room_map.get(entry.get("room_id"), "")
                        
                        cell_html += f"""
                        <div style='border: 1px solid #ddd; background-color: #fff; padding: 4px; margin-bottom: 4px; font-size: 10px;'>
                            <div style='font-weight: bold;'>{subj}</div>
                            <div>{fac}</div>
                            <div style='font-size: 9px;'>{session_type}</div>
                            <div style='font-size: 9px;'>{room}</div>
                        </div>
                        """
                else:
                    cell_html += "<div style='height: 60px;'></div>"
                
                cell_html += "</td>"
                row_cells.append(cell_html)
            
            rows.append(f"<tr>{''.join(row_cells)}</tr>")
        
        # Build header
        header_cells = ["<th style='background-color: #333; color: white; padding: 8px; border: 1px solid #ccc;'>Slot/Day</th>"]
        for slot in sorted_slots:
            slot_label = slot_map.get(slot["slot_id"], slot["slot_id"])
            header_cells.append(f"<th style='background-color: #333; color: white; padding: 8px; border: 1px solid #ccc;'>{slot_label}</th>")
        
        metadata_html = ""
        if version_hydrated:
            version_name = version_hydrated.get("version_name", "")
            academic_year = version_hydrated.get("academic_year", "")
            semester = version_hydrated.get("semester", "")
            wef_date = version_hydrated.get("wef_date", "")
            to_date = version_hydrated.get("to_date", "")
            
            metadata_html = f"""
            <div style='margin-bottom: 20px; padding: 12px; background-color: #f5f5f5;'>
                <p><strong>Version:</strong> {version_name or 'N/A'}</p>
                <p><strong>Academic Year:</strong> {academic_year or 'N/A'}</p>
                <p><strong>Semester:</strong> {semester or 'N/A'}</p>
                <p><strong>Effective From:</strong> {wef_date or 'N/A'}</p>
                <p><strong>To:</strong> {to_date or 'N/A'}</p>
            </div>
            """
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Timetable Preview</title>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    margin: 20px;
                    color: #333;
                }}
                h1 {{
                    text-align: center;
                }}
                table {{
                    border-collapse: collapse;
                    width: 100%;
                }}
            </style>
        </head>
        <body>
            <h1>Timetable Preview</h1>
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
        
        from fastapi.responses import HTMLResponse
        return HTMLResponse(content=html_content)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"HTML generation failed: {str(e)}")


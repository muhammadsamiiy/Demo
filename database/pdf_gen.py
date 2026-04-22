from backend.app.core.shared_imports import (
    BytesIO,
    HRFlowable,
    KeepTogether,
    Paragraph,
    ParagraphStyle,
    SimpleDocTemplate,
    Spacer,
    TA_CENTER,
    TA_LEFT,
    TA_RIGHT,
    Table,
    TableStyle,
    colors,
    datetime,
    inch,
    json,
    letter,
)
from database.database import Referral

# ── Colour palette (matches preview CSS) ─────────────────────────────────────
TEAL        = colors.HexColor("#0F766E")
TEAL_DARK   = colors.HexColor("#0D5C57")
TEAL_LIGHT  = colors.HexColor("#CCFBF1")
SECTION_BG  = colors.HexColor("#F1F5F9")
LIGHT_BG    = colors.HexColor("#F8FAFC")
BORDER      = colors.HexColor("#E2E8F0")
DARK        = colors.HexColor("#0F172A")
MUTED       = colors.HexColor("#64748B")
WHITE       = colors.white
CHECK_BG    = TEAL
COMMENT_BG  = colors.HexColor("#F0FDF4")
COMMENT_BORDER = colors.HexColor("#BBF7D0")

DOC_CHECKLIST_ITEMS = [
    "Birth Certificate",
    "Recent Bank Statement (Within 30 days)",
    "SSN Card",
    "Picture Valid ID",
    "No Insurance / Medicare/Medicaid Card",
    "Doctor's Name and Phone Number",
    "List of all Current Medications",
]


def _safe_json_loads(raw, fallback):
    try:
        return json.loads(raw or "")
    except Exception:
        return fallback


def _build_full_address(referral):
    line = ", ".join([x for x in [referral.address_line1, referral.address_line2] if x])
    city_line = " ".join([x for x in [referral.city, referral.state, referral.postal_code] if x])
    if line and city_line:
        return f"{line}\n{city_line}"
    return line or city_line or ""


def _comments_of_type(referral, comment_type_key: str) -> str:
    """Extract and format comments of a specific type."""
    comments = _safe_json_loads(referral.comments_timeline, [])
    if not comments:
        return ""
    filtered = [c for c in comments if isinstance(c, dict) and c.get("type") == comment_type_key]
    if not filtered:
        return ""
    lines = []
    for item in filtered:
        action = (item or {}).get("action", "").strip()
        if not action:
            continue
        person = (item or {}).get("person", "-").strip() or "-"
        date = (item or {}).get("date", "").strip()
        head = f"{person} ({date})" if date else person
        lines.append(f"- {head}: {action}")
    return "\n".join(lines) if lines else ""


def _comments_timeline_text(referral):
    comments = _safe_json_loads(referral.comments_timeline, [])
    if not comments:
        return ""
    lines = []
    for item in comments:
        action = (item or {}).get("action", "").strip()
        if not action:
            continue
        person = (item or {}).get("person", "-").strip() or "-"
        date = (item or {}).get("date", "").strip()
        head = f"{person} ({date})" if date else person
        lines.append(f"- {head}: {action}")
    return "\n".join(lines)


def _document_checklist_text(referral):
    checklists = _safe_json_loads(referral.checklists, {})
    docs = checklists.get("documents", []) if isinstance(checklists, dict) else []
    if not isinstance(docs, list):
        docs = []
    lines = []
    for idx, label in enumerate(DOC_CHECKLIST_ITEMS):
        item = docs[idx] if idx < len(docs) and isinstance(docs[idx], dict) else {}
        checked = bool(item.get("checked"))
        ts = (item.get("timestamp") or "").strip()
        mark = "[x]" if checked else "[ ]"
        suffix = f" - {ts}" if ts else ""
        lines.append(f"{mark} {label}{suffix}")
    return "\n".join(lines)


def _services_text(referral):
    services = _safe_json_loads(referral.services_required, [])
    if isinstance(services, list):
        return ", ".join([str(s) for s in services if s])
    return ""


def _label_for_column(column_name: str) -> str:
    special_labels = {
        "id": "Referral ID",
        "dob": "Date of Birth",
        "ssn_last": "SSN",
        "medicaid_last": "Medicaid ID",
        "pay_rate_municipality": "Pay Rate Municipality",
        "contact_phone2": "Alternate Phone",
        "ready_for_assessment": "Ready For Assessment",
        "created_at": "Created At",
        "updated_at": "Updated At",
        "home_visit_scheduled_date": "Home Visit Scheduled Date",
        "home_visit_completed_date": "Home Visit Completed Date",
        "home_visit_status": "Home Visit Status",
        "submitted_to_intermediary_date": "Submitted to Intermediary",
        "intermediary_assessment_date": "Intermediary Assessment Date",
        "intermediary_feedback": "Intermediary Feedback",
        "contract_received_date": "Contract Received Date",
        "closed_date": "Closed Date",
        "closure_reason": "Closure Reason",
        "status_category": "Status Category",
        "validation_errors": "Validation Errors",
        "archive_reason": "Archive Reason",
        "archive_restore_note": "Archive Restore Note",
        "archived_at": "Archived At",
        "email_sent_date": "Email Sent Date",
        "email_recipient": "Email Recipient",
        "email_history": "Email History",
        "include_in_follow_up": "Include in Follow Up",
        "last_follow_up_sent_date": "Last Follow Up Sent Date",
        "comments_timeline": "Comments Timeline",
        "is_archived": "Archived",
        "created_by": "Created By",
        "referral_date": "Referral Date",
        "referral_source": "Referral Source",
        "referral_type": "Referral Type",
        "address_line1": "Address Line 1",
        "address_line2": "Address Line 2",
        "postal_code": "Postal Code",
        "contact_name": "Contact Name",
        "contact_phone": "Contact Phone",
        "contact_email": "Contact Email",
        "contact_relationship": "Contact Relationship",
        "desired_caregiver": "Desired Caregiver",
        "start_of_care": "Start of Care",
        "client_type": "Client Type",
        "services_required": "Services Required",
        "assigned_to": "Assigned To",
        "veteran_status": "Veteran Status",
        "first_name": "First Name",
        "last_name": "Last Name",
        "intake_date": "Intake Date",
        "outreach_date": "Outreach Date",
        "checklist_review_date": "Checklist Review Date",
        "home_visit_date": "Home Visit Date",
    }
    if column_name in special_labels:
        return special_labels[column_name]
    return column_name.replace("_", " ").title()


def _section_for_column(column_name: str) -> str:
    patient = {"first_name", "last_name", "dob", "gender", "veteran_status", "ssn_last", "medicaid_last"}
    address = {"address_line1", "address_line2", "city", "state", "postal_code", "township"}
    referral_details = {
        "id", "referral_date", "referral_source", "referral_type", "intermediary", "branch", "marketer",
        "start_of_care", "pay_rate_municipality", "client_type", "desired_caregiver", "services_required",
        "assigned_to", "status",
    }
    home_visit = {"home_visit_scheduled_date", "home_visit_time", "home_visit_completed_date", "home_visit_status"}
    stage_dates = {
        "intake_date", "outreach_date", "checklist_review_date", "home_visit_date",
        "submitted_to_intermediary_date", "intermediary_assessment_date", "intermediary_feedback",
        "contract_received_date", "closed_date", "closure_reason", "status_category", "ready_for_assessment",
    }
    email = {"email_sent_date", "email_recipient", "email_history", "include_in_follow_up", "last_follow_up_sent_date"}
    contact = {"contact_name", "contact_phone", "contact_email", "contact_relationship", "contact_phone2"}
    notes = {"comments_timeline", "checklists", "validation_errors"}
    archive = {"is_archived", "archive_reason", "archive_restore_note", "archived_at"}
    meta = {"created_at", "updated_at", "created_by"}

    if column_name in patient:
        return "Patient Information"
    if column_name in address:
        return "Address"
    if column_name in referral_details:
        return "Referral Details"
    if column_name in home_visit:
        return "Home Visit"
    if column_name in stage_dates:
        return "Referral Details"
    if column_name in email:
        return "Email"
    if column_name in contact:
        return "Primary Contact"
    if column_name in notes:
        return "Notes & Checklist"
    if column_name in archive:
        return "Archive"
    if column_name in meta:
        return "Meta"
    return "Other"


def _dynamic_pdf_field_catalog(comment_templates=None):
    fields = []
    for column in Referral.__table__.columns:
        key = column.name
        # Build a getter function for this column
        def make_getter(col_name):
            def getter(r):
                val = getattr(r, col_name, None)
                if col_name == "created_at" or col_name == "updated_at" or col_name == "archived_at":
                    return val.isoformat() if val else ""
                if col_name == "is_archived":
                    return "Yes" if val else "No"
                return val
            return getter
        
        fields.append({
            "key": key,
            "label": _label_for_column(key),
            "section": _section_for_column(key),
            "getter": make_getter(key),
        })

    # Keep compatibility with existing UI key used for checklist rendering.
    if any(f["key"] == "checklists" for f in fields):
        fields.append({
            "key": "document_checklist",
            "label": "Document Checklist",
            "section": "Notes & Checklist",
            "getter": _document_checklist_text,
        })

    # Add comment type fields if templates provided
    if comment_templates:
        for template in comment_templates:
            if template.get("is_active", True):
                key = template.get("key", "").strip()
                label = template.get("label", "").strip()
                if key and label:
                    def make_comment_getter(comment_type_key):
                        def getter(r):
                            return _comments_of_type(r, comment_type_key)
                        return getter
                    
                    fields.append({
                        "key": f"comment_type__{key}",
                        "label": f"{label}",
                        "section": "Stages",
                        "getter": make_comment_getter(key),
                    })

    return fields


def get_available_pdf_fields(comment_templates=None):
    """
    Return available PDF fields including dynamic comment types.
    Note: This returns fields for admin UI (key/label/section only).
    
    Args:
        comment_templates: Optional list of comment template dicts with 'key' and 'label' fields
    """
    # Get full fields with getters (for internal use)
    full_fields = _dynamic_pdf_field_catalog(comment_templates=comment_templates)
    
    # Return only key/label/section for admin UI
    return [{"key": f["key"], "label": f["label"], "section": f["section"]} for f in full_fields]


def _resolve_selected_fields(selected_fields, comment_templates=None):
    """Get all valid field keys from dynamic catalog."""
    full_fields = _dynamic_pdf_field_catalog(comment_templates=comment_templates)
    all_keys = [f["key"] for f in full_fields]
    if not selected_fields:
        return all_keys
    selected = [key for key in selected_fields if key in all_keys]
    return selected or all_keys


def generate_referral_pdf(referral, selected_fields=None, comment_templates=None) -> bytes:
    selected_keys = set(_resolve_selected_fields(selected_fields, comment_templates=comment_templates))
    
    # Build a map of field keys to getter functions
    full_fields = _dynamic_pdf_field_catalog(comment_templates=comment_templates)
    field_map = {f["key"]: f.get("getter") for f in full_fields if "getter" in f}

    patient_full_name = " ".join([x for x in [referral.first_name, referral.last_name] if x]).strip() or "Referral"
    printed_date = datetime.now().strftime("%B %d, %Y")
    report_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.55 * inch,
        rightMargin=0.55 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
        title=f"{patient_full_name} – Patient Profile",
        author="CareReferral",
        subject="Home Health Management Referral Report",
        creator="CareReferral",
    )

    # ── Styles ───────────────────────────────────────────────────────────────
    logo_style   = ParagraphStyle("Logo",  fontSize=22, textColor=WHITE, fontName="Helvetica-Bold", leading=26)
    tagline_style= ParagraphStyle("Tag",   fontSize=9,  textColor=colors.HexColor("#CCFBF1"), leading=12, spaceBefore=2)
    meta_name_s  = ParagraphStyle("MName", fontSize=14, textColor=DARK, fontName="Helvetica-Bold", leading=18)
    meta_val_s   = ParagraphStyle("MVal",  fontSize=9,  textColor=MUTED, leading=13)
    sec_title_s  = ParagraphStyle("SecT",  fontSize=11, textColor=TEAL, fontName="Helvetica-Bold", leading=14, spaceBefore=0, spaceAfter=0)
    lbl_s        = ParagraphStyle("Lbl",   fontSize=7.5,textColor=MUTED, fontName="Helvetica-Bold", leading=10)
    val_s        = ParagraphStyle("Val",   fontSize=9.5,textColor=DARK,  leading=13)
    chk_lbl_s    = ParagraphStyle("ChkL",  fontSize=9.5,textColor=DARK,  leading=13)
    chk_sub_s    = ParagraphStyle("ChkS",  fontSize=8,  textColor=MUTED, leading=11)
    chk_file_s   = ParagraphStyle("ChkF",  fontSize=8,  textColor=TEAL,  leading=11)
    cm_meta_s    = ParagraphStyle("CmM",   fontSize=8,  textColor=MUTED, fontName="Helvetica-Bold", leading=11)
    cm_text_s    = ParagraphStyle("CmT",   fontSize=9.5,textColor=DARK,  leading=13)
    footer_s     = ParagraphStyle("Foot",  fontSize=7.5,textColor=MUTED, alignment=TA_CENTER)

    W = 7.4 * inch  # usable width

    story = []

    # ── Header card: logo left | patient meta right ───────────────────────────
    logo_cell = [
        Paragraph("CareReferral", logo_style),
        Paragraph("Home Health Management", tagline_style),
    ]
    status_val = str(referral.status or "").strip() or "—"
    meta_cell = [
        Paragraph(patient_full_name, meta_name_s),
        Paragraph(f"Referral ID: {referral.id}", meta_val_s),
        Paragraph(f"Status: <b>{status_val}</b>", meta_val_s),
        Paragraph(f"Printed: {printed_date}", meta_val_s),
    ]
    header_table = Table(
        [[logo_cell, meta_cell]],
        colWidths=[W * 0.42, W * 0.58],
    )
    header_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (0, 0), TEAL),
        ("BACKGROUND",   (1, 0), (1, 0), LIGHT_BG),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ("TOPPADDING",   (0, 0), (-1, -1), 18),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 18),
        ("ROUNDEDCORNERS", (0, 0), (-1, -1), [8, 8, 8, 8]),
        ("BOX",          (0, 0), (-1, -1), 0, BORDER),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 14))

    # ── Helper: draw a section ────────────────────────────────────────────────
    def _section_title(title):
        """Teal section heading with bottom rule — mirrors .pdf-section-title"""
        title_row = Table(
            [[Paragraph(title, sec_title_s)]],
            colWidths=[W],
        )
        title_row.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), SECTION_BG),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LINEBELOW",     (0, 0), (-1, -1), 1.5, TEAL),
            ("BOX",           (0, 0), (-1, -1), 0.5, BORDER),
        ]))
        return title_row

    def _fv(raw):
        v = str(raw or "").strip()
        return v if v else "—"

    def _field_cell(label, value):
        """One field: label (small muted) above value (dark) — mirrors .pdf-field"""
        return [Paragraph(label, lbl_s), Paragraph(_fv(value), val_s)]

    def _two_col_grid(pairs):
        """Render list of (label, value) tuples in a 2-column grid table."""
        cells = [_field_cell(lbl, val) for lbl, val in pairs]
        # Pad to even count
        if len(cells) % 2 != 0:
            cells.append([Paragraph("", lbl_s), Paragraph("", val_s)])
        rows = []
        for i in range(0, len(cells), 2):
            rows.append([cells[i], cells[i + 1]])
        col_w = W / 2 - 1
        t = Table(rows, colWidths=[col_w, col_w])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), WHITE),
            ("ROWBACKGROUNDS",(0, 0), (-1, -1), [WHITE, LIGHT_BG]),
            ("LINEBELOW",     (0, 0), (-1, -1), 0.4, BORDER),
            ("LINEAFTER",     (0, 0), (0, -1),  0.4, BORDER),
            ("BOX",           (0, 0), (-1, -1), 0.6, BORDER),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        return t

    def _three_col_grid(pairs):
        """3-column grid for date-heavy sections."""
        cells = [_field_cell(lbl, val) for lbl, val in pairs]
        while len(cells) % 3 != 0:
            cells.append([Paragraph("", lbl_s), Paragraph("", val_s)])
        rows = []
        for i in range(0, len(cells), 3):
            rows.append([cells[i], cells[i + 1], cells[i + 2]])
        col_w = W / 3 - 0.5
        t = Table(rows, colWidths=[col_w, col_w, col_w])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), WHITE),
            ("ROWBACKGROUNDS",(0, 0), (-1, -1), [WHITE, LIGHT_BG]),
            ("LINEBELOW",     (0, 0), (-1, -1), 0.4, BORDER),
            ("LINEAFTER",     (0, 0), (0, -1),  0.4, BORDER),
            ("LINEAFTER",     (0, 1), (1, -1),  0.4, BORDER),
            ("BOX",           (0, 0), (-1, -1), 0.6, BORDER),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        return t

    def _section(title, grid_fn, pairs):
        """Full section block kept together if possible."""
        elems = [_section_title(title), grid_fn(pairs), Spacer(1, 10)]
        return KeepTogether(elems)

    # ── Raw data helpers ──────────────────────────────────────────────────────
    checklists  = _safe_json_loads(referral.checklists, {}) if isinstance(referral.checklists, str) else (referral.checklists or {})
    docs_data   = checklists.get("documents", []) if isinstance(checklists, dict) else []
    comments    = _safe_json_loads(referral.comments_timeline, []) if isinstance(referral.comments_timeline, str) else (referral.comments_timeline or [])
    services    = _services_text(referral)

    # ── 1. Patient Information ────────────────────────────────────────────────
    if selected_keys & {"first_name","last_name","dob","gender","veteran_status","ssn_last","medicaid_last"}:
        story.append(_section("Patient Information", _two_col_grid, [
            ("First Name",      referral.first_name),
            ("Last Name",       referral.last_name),
            ("Date of Birth",   referral.dob),
            ("Gender",          referral.gender),
            ("Veteran Status",  referral.veteran_status),
            ("SSN",             referral.ssn_last),
            ("Medicaid ID",     referral.medicaid_last),
        ]))

    # ── 2. Address ────────────────────────────────────────────────────────────
    if selected_keys & {"address_line1","address_line2","city","state","postal_code","township"}:
        story.append(_section("Address", _two_col_grid, [
            ("Address Line 1",  referral.address_line1),
            ("Address Line 2",  referral.address_line2),
            ("City",            referral.city),
            ("State",           referral.state),
            ("Postal Code",     referral.postal_code),
            ("Township",        _fv(getattr(referral, "township", None))),
        ]))

    # ── 3. Referral Details ───────────────────────────────────────────────────
    if selected_keys & {"referral_type","referral_source","referral_date","start_of_care","branch","client_type","pay_rate_municipality","marketer","assigned_to","services_required"}:
        pairs = [
            ("Referral Type",         referral.referral_type),
            ("Referral Source",       referral.referral_source),
            ("Referral Date",         referral.referral_date),
            ("Start of Care",         referral.start_of_care),
            ("Branch / Agency",       referral.branch),
            ("Client Type",           referral.client_type),
            ("Pay Rate Municipality", referral.pay_rate_municipality),
            ("Marketer",              referral.marketer),
            ("Assigned To",           getattr(referral, "assigned_to_display", "") or referral.assigned_to),
        ]
        if services:
            pairs.append(("Services Required", services))
        story.append(_section("Referral Details", _two_col_grid, pairs))

    # ── 4. Primary Contact ────────────────────────────────────────────────────
    if selected_keys & {"contact_name","contact_phone","contact_phone2","contact_email","contact_relationship"}:
        story.append(_section("Primary Contact", _two_col_grid, [
            ("Contact Name",    referral.contact_name),
            ("Phone",           referral.contact_phone),
            ("Email",           referral.contact_email),
            ("Relationship",    referral.contact_relationship),
            ("Alternate Phone", referral.contact_phone2),
        ]))

    # ── 5. Stage Dates ────────────────────────────────────────────────────────
    stage_keys = {"intake_date","outreach_date","checklist_review_date","home_visit_date",
                  "submitted_to_intermediary_date","intermediary_assessment_date",
                  "contract_received_date","closed_date","closure_reason","ready_for_assessment"}
    if selected_keys & stage_keys:
        story.append(_section("Stage Dates", _three_col_grid, [
            ("Intake",                   referral.intake_date),
            ("Outreach",                 referral.outreach_date),
            ("Checklist Review",         referral.checklist_review_date),
            ("Home Visit",               referral.home_visit_date),
            ("Submitted to Intermediary",referral.submitted_to_intermediary_date),
            ("Assessment Date",          referral.intermediary_assessment_date),
            ("Contract Received",        referral.contract_received_date),
            ("Closed Date",              referral.closed_date),
            ("Closure Reason",           referral.closure_reason),
            ("Ready for Assessment",     referral.ready_for_assessment),
        ]))

    # ── 6. Document Checklist ─────────────────────────────────────────────────
    if "document_checklist" in selected_keys:
        story.append(_section_title("Document Checklist"))
        chk_rows = []
        for idx, label in enumerate(DOC_CHECKLIST_ITEMS):
            item = docs_data[idx] if idx < len(docs_data) and isinstance(docs_data[idx], dict) else {}
            checked  = bool(item.get("checked"))
            ts       = str(item.get("timestamp") or "").strip()
            fname    = str(item.get("fileName") or "").strip()

            # Checkbox cell (teal filled = checked, empty border = unchecked)
            chk_sym = Paragraph("✓" if checked else "", ParagraphStyle(
                "Sym", fontSize=10, textColor=WHITE, fontName="Helvetica-Bold",
                alignment=TA_CENTER, leading=13))
            chk_cell_tbl = Table([[chk_sym]], colWidths=[0.22 * inch], rowHeights=[0.22 * inch])
            chk_cell_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0,0), (-1,-1), CHECK_BG if checked else WHITE),
                ("BOX",           (0,0), (-1,-1), 1, TEAL),
                ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
                ("TOPPADDING",    (0,0), (-1,-1), 1),
                ("BOTTOMPADDING", (0,0), (-1,-1), 1),
                ("LEFTPADDING",   (0,0), (-1,-1), 1),
                ("RIGHTPADDING",  (0,0), (-1,-1), 1),
            ]))

            label_parts = [Paragraph(label, chk_lbl_s)]
            if fname:
                label_parts.append(Paragraph(f"📎 {fname}", chk_file_s))
            if ts and checked:
                try:
                    dt = datetime.fromisoformat(ts)
                    ts_fmt = dt.strftime("%m/%d/%Y")
                except Exception:
                    ts_fmt = ts
                label_parts.append(Paragraph(ts_fmt, chk_sub_s))

            chk_rows.append([chk_cell_tbl, label_parts])

        chk_table = Table(chk_rows, colWidths=[0.35 * inch, W - 0.35 * inch])
        chk_table.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), WHITE),
            ("ROWBACKGROUNDS",(0, 0), (-1, -1), [WHITE, LIGHT_BG]),
            ("LINEBELOW",     (0, 0), (-1, -1), 0.4, BORDER),
            ("BOX",           (0, 0), (-1, -1), 0.6, BORDER),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        story.append(chk_table)
        story.append(Spacer(1, 10))

    # ── 7. Comments Timeline ──────────────────────────────────────────────────
    if "comments_timeline" in selected_keys and comments:
        story.append(_section_title("Comments Timeline"))
        story.append(Spacer(1, 4))
        for c in comments:
            if not isinstance(c, dict):
                continue
            action = str(c.get("action") or "").strip()
            if not action:
                continue
            person = str(c.get("person") or "—").strip()
            date_v = str(c.get("date") or "").strip()
            meta_text = f"{person}  ·  {date_v}" if date_v else person
            comment_block = Table(
                [[Paragraph(meta_text, cm_meta_s)],
                 [Paragraph(action, cm_text_s)]],
                colWidths=[W],
            )
            comment_block.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), COMMENT_BG),
                ("LINEAFTER",     (0, 0), (0, -1),  2.5, TEAL),
                ("BOX",           (0, 0), (-1, -1), 0.5, COMMENT_BORDER),
                ("LEFTPADDING",   (0, 0), (-1, -1), 12),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
                ("TOPPADDING",    (0, 0), (0, 0),   7),
                ("BOTTOMPADDING", (0, 0), (0, 0),   2),
                ("TOPPADDING",    (0, 1), (0, 1),   2),
                ("BOTTOMPADDING", (0, 1), (0, 1),   8),
            ]))
            story.append(comment_block)
            story.append(Spacer(1, 5))

    # ── 7b. Individual Comment Types ──────────────────────────────────────────
    comment_type_keys = [k for k in selected_keys if k.startswith("comment_type__")]
    for ct_key in sorted(comment_type_keys):
        comment_type_name = ct_key.replace("comment_type__", "")
        filtered_comments = [c for c in comments if isinstance(c, dict) and c.get("type") == comment_type_name]
        if filtered_comments:
            type_label = comment_type_name.replace("_", " ").title()
            story.append(_section_title(f"Comment: {type_label}"))
            story.append(Spacer(1, 4))
            for c in filtered_comments:
                action = str(c.get("action") or "").strip()
                if not action:
                    continue
                person = str(c.get("person") or "—").strip()
                date_v = str(c.get("date") or "").strip()
                meta_text = f"{person}  ·  {date_v}" if date_v else person
                comment_block = Table(
                    [[Paragraph(meta_text, cm_meta_s)],
                     [Paragraph(action, cm_text_s)]],
                    colWidths=[W],
                )
                comment_block.setStyle(TableStyle([
                    ("BACKGROUND",    (0, 0), (-1, -1), COMMENT_BG),
                    ("LINEAFTER",     (0, 0), (0, -1),  2.5, TEAL),
                    ("BOX",           (0, 0), (-1, -1), 0.5, COMMENT_BORDER),
                    ("LEFTPADDING",   (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
                    ("TOPPADDING",    (0, 0), (0, 0),   7),
                    ("BOTTOMPADDING", (0, 0), (0, 0),   2),
                    ("TOPPADDING",    (0, 1), (0, 1),   2),
                    ("BOTTOMPADDING", (0, 1), (0, 1),   8),
                ]))
                story.append(comment_block)
                story.append(Spacer(1, 5))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=0.8, color=BORDER, spaceAfter=5))
    story.append(Paragraph(
        f"Generated by CareReferral  |  {referral.id}  |  Confidential  |  {report_timestamp}",
        footer_s,
    ))

    doc.build(story)
    return buffer.getvalue()

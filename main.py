from backend.app.core.shared_imports import (
    Any,
    BaseModel,
    CORSMiddleware,
    Depends,
    Dict,
    EmailStr,
    FastAPI,
    File,
    FileResponse,
    HTTPException,
    List,
    Optional,
    Query,
    Response,
    Session,
    StaticFiles,
    StreamingResponse,
    UploadFile,
    csv,
    datetime,
    get_auth_symbols,
    get_comment_service_symbol,
    get_database_engine,
    get_database_symbols,
    get_email_service_symbols,
    get_logging_symbols,
    get_mapping_service_symbol,
    get_pdf_symbols,
    get_referral_email_service_symbol,
    get_settings_symbol,
    io,
    json,
    or_,
    pathlib,
    os,
    re,
    shutil,
    sql_text,
    threading,
    time,
    timedelta,
    uvicorn,
    uuid,
)
import imaplib
from email import message_from_bytes
from email.header import decode_header
from email.utils import parseaddr, parsedate_to_datetime
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

settings = get_settings_symbol()
configure_logging, get_logger = get_logging_symbols()
(verify_password, hash_password, create_token, get_current_user, require_permission) = get_auth_symbols()
(get_db, User, DropdownOption, Referral, Log, AppSetting, WorkflowStage, StageCommentMapping, init_db, _) = get_database_symbols()
db_engine = get_database_engine()
generate_referral_pdf, get_available_pdf_fields = get_pdf_symbols()
MappingService = get_mapping_service_symbol()
normalize_comments_timeline = get_comment_service_symbol()
ReferralEmailService = get_referral_email_service_symbol()
get_email_service, EmailService = get_email_service_symbols()

configure_logging()
logger = get_logger(__name__)

UPLOADS_DIR = pathlib.Path(settings.uploads_dir)
UPLOADS_DIR.mkdir(exist_ok=True)

app = FastAPI(title=settings.app_name, version=settings.app_version)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/assets/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# ─── DB Column Migration ───────────────────────────────────────────────────────

def run_migrations():
    with db_engine.connect() as conn:
        statements = [
            "ALTER TABLE users ADD COLUMN can_send_emails BOOLEAN DEFAULT 0",
            "ALTER TABLE referrals ADD COLUMN home_visit_status VARCHAR",
            "ALTER TABLE referrals ADD COLUMN archived_at DATETIME",
            "ALTER TABLE referrals ADD COLUMN archive_restore_note VARCHAR",
            "ALTER TABLE referrals ADD COLUMN email_sent_date DATETIME",
            "ALTER TABLE referrals ADD COLUMN email_recipient VARCHAR",
            "ALTER TABLE referrals ADD COLUMN email_history TEXT",
            "ALTER TABLE referrals ADD COLUMN desired_caregiver VARCHAR",
            "ALTER TABLE referrals ADD COLUMN include_in_follow_up BOOLEAN DEFAULT 1",
            "ALTER TABLE referrals ADD COLUMN last_follow_up_sent_date DATETIME",
        ]

        for statement in statements:
            try:
                conn.execute(sql_text(statement))
                conn.commit()
            except Exception:
                conn.rollback()
                pass

        # Backfill admin permissions for existing databases.
        try:
            conn.execute(sql_text("UPDATE users SET can_send_emails = 1 WHERE role = 'admin'"))
            conn.commit()
        except Exception:
            conn.rollback()
            pass

        # Backfill follow-up toggle for existing rows.
        try:
            conn.execute(sql_text("UPDATE referrals SET include_in_follow_up = 1 WHERE include_in_follow_up IS NULL"))
            conn.commit()
        except Exception:
            conn.rollback()
            pass

run_migrations()

# ─── Static Uploads ───────────────────────────────────────────────────────────
app.mount('/uploads', StaticFiles(directory=settings.uploads_dir), name='uploads')
app.mount('/assets', StaticFiles(directory='frontend/assets'), name='assets')

# ─── Root Route ───────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return FileResponse("frontend/index.html")

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)

# ─── Pydantic Schemas ──────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    email: str
    full_name: Optional[str] = None
    password: str
    role: str = "staff"
    can_create_referral: bool = True
    can_edit_referral: bool = True
    can_delete_referral: bool = False
    can_export: bool = True
    can_manage_users: bool = False
    can_manage_dropdowns: bool = False
    can_archive: bool = False
    can_send_emails: bool = False

class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    can_create_referral: Optional[bool] = None
    can_edit_referral: Optional[bool] = None
    can_delete_referral: Optional[bool] = None
    can_export: Optional[bool] = None
    can_manage_users: Optional[bool] = None
    can_manage_dropdowns: Optional[bool] = None
    can_archive: Optional[bool] = None
    can_send_emails: Optional[bool] = None

class DropdownCreate(BaseModel):
    category: str
    value: str
    label: str
    sort_order: int = 0
    intermediary_email: Optional[str] = None

class DropdownUpdate(BaseModel):
    label: Optional[str] = None
    value: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None

class ReferralCreate(BaseModel):
    # Patient
    first_name: str
    last_name: str
    dob: Optional[str] = None
    gender: Optional[str] = None
    veteran_status: Optional[str] = "Unknown"
    ssn_Last: Optional[str] = None
    medicaid_Last: Optional[str] = None
    ssn_last: Optional[str] = None
    medicaid_last: Optional[str] = None
    # Address
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    township: Optional[str] = None
    # Referral
    referral_date: Optional[str] = None
    referral_source: Optional[str] = None
    referral_type: Optional[str] = None
    intermediary: Optional[str] = None
    branch: Optional[str] = None
    marketer: Optional[str] = None
    start_of_care: Optional[str] = None
    pay_rate_municipality: Optional[str] = None
    client_type: Optional[str] = None
    desired_caregiver: Optional[str] = None
    services_required: Optional[List[str]] = []
    assigned_to: Optional[str] = None
    status: str = "New"
    # Home Visit
    home_visit_scheduled_date: Optional[str] = None
    home_visit_time: Optional[str] = None
    home_visit_completed_date: Optional[str] = None
    home_visit_status: Optional[str] = None
    # Stages
    intake_date: Optional[str] = None
    outreach_date: Optional[str] = None
    checklist_review_date: Optional[str] = None
    home_visit_date: Optional[str] = None
    submitted_to_intermediary_date: Optional[str] = None
    intermediary_assessment_date: Optional[str] = None
    intermediary_feedback: Optional[str] = None
    contract_received_date: Optional[str] = None
    closed_date: Optional[str] = None
    closure_reason: Optional[str] = None
    status_category: Optional[str] = None
    ready_for_assessment: Optional[str] = None
    # Contact
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    contact_relationship: Optional[str] = None
    contact_phone2: Optional[str] = None
    # Meta
    comments_timeline: Optional[List[dict]] = []
    checklists: Optional[dict] = {}
    validation_errors: Optional[List[str]] = []
    is_archived: bool = False
    archive_reason: Optional[str] = None
    archive_restore_note: Optional[str] = None
    include_in_follow_up: Optional[bool] = None

class ChecklistUpdate(BaseModel):
    checked: bool

class PdfFieldsUpdate(BaseModel):
    fields: List[str]

class EmailSettingsUpdate(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    from_address: Optional[str] = None
    additional_cc: Optional[str] = None
    template_to: Optional[str] = None
    template_cc: Optional[str] = None
    subject_template: Optional[str] = None
    body_template: Optional[str] = None
    include_referral_contact: Optional[bool] = None
    include_sender_account: Optional[bool] = None
    follow_up_frequency: Optional[str] = None
    follow_up_send_time: Optional[str] = None
    follow_up_to: Optional[str] = None
    follow_up_cc: Optional[str] = None
    follow_up_subject_template: Optional[str] = None
    follow_up_body_template: Optional[str] = None

class FollowUpToggleUpdate(BaseModel):
    include_in_follow_up: bool

class CommentTemplateItem(BaseModel):
    key: Optional[str] = None
    label: str
    template: str
    is_active: bool = True
    sort_order: int = 0

class CommentTemplatesUpdate(BaseModel):
    templates: List[CommentTemplateItem]

class WorkflowStageResponse(BaseModel):
    id: int
    key: str
    label: str
    description: Optional[str]
    sort_order: int
    is_active: bool

class StageCommentMappingResponse(BaseModel):
    id: int
    stage_key: str
    comment_type_key: str
    description: Optional[str]
    is_active: bool
    sort_order: int

class StageCommentMappingCreate(BaseModel):
    stage_key: str
    comment_type_key: str
    description: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0

class IntermediaryMappingCreate(BaseModel):
    intermediary: str
    email: EmailStr
    postal_code: Optional[str] = None
    township: Optional[str] = None
    form_type: Optional[str] = None
    follow_up_frequency: Optional[str] = None
    follow_up_send_time: Optional[str] = None


def _extract_intermediary_mapping_fields(payload: Dict[str, Any]) -> Dict[str, str]:
    data = payload or {}
    # Compatibility: accept both flat payload and { mapping: { ... } } shape.
    if isinstance(data.get("mapping"), dict):
        data = data.get("mapping") or {}

    def _pick(*keys: str) -> str:
        for key in keys:
            value = data.get(key)
            if value is None:
                continue
            text = str(value).strip()
            if text:
                return text
        return ""

    return {
        "intermediary": _pick("intermediary", "intermediaryName", "vendor"),
        "email": _pick("email", "intermediary_email", "intermediaryEmail"),
        "township": _pick("township", "Township", "pay_rate_municipality", "municipality"),
        "postal_code": _pick("postal_code", "postalCode", "postal", "zip", "zipCode"),
        "form_type": _pick("form_type", "formType", "referral_type", "referralType"),
        "follow_up_frequency": _pick("follow_up_frequency", "followUpFrequency", "schedule_frequency"),
        "follow_up_send_time": _pick("follow_up_send_time", "followUpSendTime", "schedule_time"),
    }


def _validate_required_intermediary_mapping_fields(fields: Dict[str, str], payload: Dict[str, Any]):
    missing: List[str] = []
    required_map = {
        "township": "Township",
        "postal_code": "Postal Code",
        "form_type": "Form Type",
        "intermediary": "Intermediary Name",
        "email": "Email",
    }
    for key in ["township", "postal_code", "form_type", "intermediary", "email"]:
        if not fields.get(key):
            missing.append(required_map[key])

    if missing:
        keys = sorted(list((payload or {}).keys()))
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing)}. Received keys: {', '.join(keys) if keys else 'none'}"
        )

    if not _is_valid_email(fields["email"]):
        raise HTTPException(status_code=400, detail="Valid email is required")

    frequency = (fields.get("follow_up_frequency") or "weekly").strip().lower()
    if frequency and frequency not in {"daily", "weekly", "monthly"}:
        raise HTTPException(status_code=400, detail="follow_up_frequency must be daily, weekly, or monthly")

    send_time = (fields.get("follow_up_send_time") or "09:00").strip()
    fields["follow_up_frequency"] = frequency or "weekly"
    fields["follow_up_send_time"] = _normalize_send_time(send_time)

class EmailSendRequest(BaseModel):
    referral_id: str
    pdf_fields: Optional[List[str]] = None  # Which fields to include in PDF
    preview_pdf_base64: Optional[str] = None
    preview_pdf_filename: Optional[str] = None

def log_action(db: Session, user: str, action: str, resource_type: str, resource_id: str = None, details: dict = None):
    """Log an action to the database"""
    log_entry = Log(
        user=user,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id or "",
        details=json.dumps(details or {}),
        ip_address="",  # Could be added from request if needed
        user_agent=""   # Could be added from request if needed
    )
    db.add(log_entry)
    db.commit()

def ref_to_dict(r: Any) -> dict:
    def pj(v):
        try: return json.loads(v) if v else []
        except: return []
    def pjd(v):
        try: return json.loads(v) if v else {}
        except: return {}
    ssn_last = getattr(r, "ssn_last", None)
    medicaid_last = getattr(r, "medicaid_last", None)
    desired_caregiver = getattr(r, "desired_caregiver", None)
    return {
        "id": r.id,
        "patient": {
            "firstName": r.first_name, "lastName": r.last_name, "dob": r.dob,
            "gender": r.gender, "veteranStatus": r.veteran_status,
            "ssn_Last": ssn_last, "medicaid_Last": medicaid_last,
            "age": _calc_age(r.dob)
        },
        "address": {
            "line1": r.address_line1, "line2": r.address_line2,
            "city": r.city, "state": r.state,
            "postalCode": r.postal_code, "township": r.township
        },
        "referral": {
            "referralDate": r.referral_date, "referralSource": r.referral_source,
            "referralType": r.referral_type, "intermediary": r.intermediary,
            "branch": r.branch, "marketer": r.marketer,
            "startOfCare": r.start_of_care, "payRateMunicipality": r.pay_rate_municipality,
            "clientType": r.client_type, "desiredCaregiver": desired_caregiver, "assignedTo": r.assigned_to,
            "homeVisitScheduledDate": r.home_visit_scheduled_date,
            "homeVisitTime": getattr(r, "home_visit_time", None),
            "homeVisitCompletedDate": r.home_visit_completed_date,
            "homeVisitStatus": r.home_visit_status,
            "intakeDate": r.intake_date, "outreachDate": r.outreach_date,
            "checklistReviewDate": r.checklist_review_date,
            "homeVisitDate": r.home_visit_date,
            "submittedToIntermediaryDate": r.submitted_to_intermediary_date,
            "intermediaryAssessmentDate": r.intermediary_assessment_date,
            "intermediaryFeedback": r.intermediary_feedback,
            "contractReceivedDate": r.contract_received_date,
            "closedDate": r.closed_date, "closureReason": r.closure_reason,
            "statusCategory": r.status_category,
            "readyForAssessment": r.ready_for_assessment,
            "scheduleDate": r.home_visit_scheduled_date,
        },
        "primaryContact": {
            "name": r.contact_name, "phone": r.contact_phone,
            "email": r.contact_email, "relationship": r.contact_relationship,
            "alternatePhone": r.contact_phone2
        },
        "status": r.status,
        "servicesRequired": pj(r.services_required),
        "commentsTimeline": pj(r.comments_timeline),
        "checklists": pjd(r.checklists),
        "validationErrors": pj(r.validation_errors),
        "isArchived": r.is_archived,
        "archiveReason": r.archive_reason,
        "archiveRestoreNote": getattr(r, "archive_restore_note", None),
        "archivedAt": r.archived_at.isoformat() if r.archived_at else None,
        "emailSentDate": r.email_sent_date.isoformat() if r.email_sent_date else None,
        "emailRecipient": r.email_recipient,
        "followUp": {
            "includeInFollowUp": bool(getattr(r, "include_in_follow_up", True)),
            "lastFollowUpSentDate": r.last_follow_up_sent_date.isoformat() if getattr(r, "last_follow_up_sent_date", None) else None,
        },
        "createdAt": r.created_at.isoformat() if r.created_at else None,
        "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
        "createdBy": r.created_by,
    }

def _get_first_comment(comments_json: str) -> str:
    if not comments_json:
        return ""
    try:
        comments = json.loads(comments_json)
        if comments and len(comments) > 0:
            text = comments[0].get('action', '') or comments[0].get('text', '')
            return text[:100] + "..." if len(text) > 100 else text
    except:
        pass
    return ""

def _calc_age(dob: str) -> Optional[int]:
    if not dob:
        return None
    try:
        for fmt in ["%m/%d/%Y", "%Y-%m-%d"]:
            try:
                b = datetime.strptime(dob, fmt)
                today = datetime.today()
                return today.year - b.year - ((today.month, today.day) < (b.month, b.day))
            except: pass
    except: pass
    return None

def _pdf_field_keys(db: Session = None) -> List[str]:
    comment_templates = []
    if db:
        try:
            comment_templates = _get_comment_templates(db, active_only=True)
        except Exception:
            comment_templates = []
    return [f["key"] for f in get_available_pdf_fields(comment_templates=comment_templates)]

def _get_selected_pdf_fields(db: Session) -> List[str]:
    available = _pdf_field_keys(db)
    setting = db.query(AppSetting).filter(AppSetting.key == "pdf_fields").first()
    if not setting:
        return available
    try:
        parsed = json.loads(setting.value or "[]")
        if not isinstance(parsed, list):
            return available
        selected = [k for k in parsed if k in available]
        return selected or available
    except Exception:
        return available

def _save_selected_pdf_fields(db: Session, fields: List[str]):
    available = _pdf_field_keys(db)
    selected = [k for k in fields if k in available]
    if not selected:
        selected = available
    setting = db.query(AppSetting).filter(AppSetting.key == "pdf_fields").first()
    if not setting:
        setting = AppSetting(key="pdf_fields", value=json.dumps(selected))
        db.add(setting)
    else:
        setting.value = json.dumps(selected)
    db.commit()

def _get_setting_value(db: Session, key: str, default: str = "") -> str:
    setting = db.query(AppSetting).filter(AppSetting.key == key).first()
    if not setting:
        return default
    return setting.value if setting.value is not None else default

def _get_email_template_settings(db: Session) -> dict:
    default_subject = _compose_email_subject("Patient Referral:")
    default_body = _compose_email_body("Please find attached the referral for patient")
    raw_subject = _get_setting_value(db, "email_subject_template", default_subject)
    raw_body = _get_setting_value(db, "email_body_template", default_body)
    normalized_subject = _compose_email_subject(_email_subject_display_text(raw_subject))
    normalized_body = _compose_email_body(_email_body_display_text(raw_body))
    return {
        "to": _get_setting_value(db, "email_template_to", ""),
        "cc": _get_setting_value(db, "email_template_cc", ""),
        "subject_template": normalized_subject,
        "body_template": normalized_body,
        "include_referral_contact": _setting_bool_value(db, "email_include_referral_contact", True),
        "include_sender_account": _setting_bool_value(db, "email_include_sender_account", True),
    }


def _setting_bool_value(db: Session, key: str, default: bool = False) -> bool:
    raw_value = _get_setting_value(db, key, "true" if default else "false")
    return str(raw_value).strip().lower() in {"1", "true", "yes", "on"}


def _compose_email_subject(subject_base: str) -> str:
    base = re.sub(r"\{\{?\s*patient_name\s*\}?\}", "", str(subject_base or ""), flags=re.IGNORECASE)
    base = re.sub(r"\s+", " ", base).strip()
    if not base:
        base = "Patient Referral:"
    if not base.endswith(":"):
        base = f"{base}:"
    return f"{base} {{{{patient_name}}}}"


def _email_subject_display_text(subject_template: str) -> str:
    text = str(subject_template or "")
    text = re.sub(r"\{\{?\s*patient_name\s*\}?\}", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip()
    return text or "Patient Referral:"


def _compose_email_body(message_line: str) -> str:
    message = str(message_line or "").strip() or "Please find attached the referral for patient"
    return (
        "<html><body>"
        "<p>Dear {{intermediary}},</p>"
        f"<p>{message} <strong>{{{{patient_name}}}}</strong>.</p>"
        "<p><strong>Referral ID:</strong> {{referral_id}}</p>"
        "<p><strong>Referral Type:</strong> {{referral_type}}</p>"
        "<p><strong>Referral Date:</strong> {{referral_date}}</p>"
        "<p>Please contact us if you have any questions.</p>"
        "<p>Regards,<br>Applied Home Health Network</p>"
        "</body></html>"
    )


def _email_body_display_text(body_template: str) -> str:
    template = str(body_template or "")
    match = re.search(r"<p>Dear\s*\{\{?\s*intermediary\s*\}?\},</p>\s*<p>(.*?)</p>", template, flags=re.IGNORECASE | re.DOTALL)
    if match:
        extracted = match.group(1)
        extracted = re.sub(r"<strong>\s*\{\{?\s*patient_name\s*\}?\}\s*</strong>", "", extracted, flags=re.IGNORECASE)
        extracted = re.sub(r"\.+\s*$", "", extracted)
        extracted = re.sub(r"\s+", " ", extracted).strip()
        if extracted:
            return extracted
    fallback = re.search(r"<p>(.*?)\s*<strong>\s*\{\{?\s*patient_name\s*\}?\}\s*</strong>\.?\s*</p>", template, flags=re.IGNORECASE | re.DOTALL)
    if fallback:
        extracted = re.sub(r"\s+", " ", fallback.group(1)).strip()
        if extracted:
            return extracted
    return "Please find attached the referral for patient"


def _normalize_send_time(raw_time: str) -> str:
    value = (raw_time or "").strip()
    try:
        parsed = datetime.strptime(value, "%H:%M")
        return parsed.strftime("%H:%M")
    except Exception:
        return "09:00"


def _parse_email_list(raw_value: Optional[str]) -> List[str]:
    if not raw_value:
        return []
    items = re.split(r"[;,]", str(raw_value))
    cleaned: List[str] = []
    for item in items:
        email = item.strip()
        if not email:
            continue
        if email not in cleaned:
            cleaned.append(email)
    return cleaned


def _imap_host_from_smtp(smtp_host: str) -> str:
    host = (smtp_host or "").strip()
    if not host:
        return "imap.gmail.com"
    if host.startswith("smtp."):
        return host.replace("smtp.", "imap.", 1)
    return host


def _decode_mime_header(value: str) -> str:
    if not value:
        return ""
    parts = []
    for text, enc in decode_header(value):
        if isinstance(text, bytes):
            try:
                parts.append(text.decode(enc or "utf-8", errors="replace"))
            except Exception:
                parts.append(text.decode("utf-8", errors="replace"))
        else:
            parts.append(str(text))
    return "".join(parts).strip()


def _extract_email_snippet(msg: Any, limit: int = 320) -> str:
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = (part.get_content_type() or "").lower()
            disposition = str(part.get("Content-Disposition") or "")
            if "attachment" in disposition.lower():
                continue
            if content_type == "text/plain":
                payload = part.get_payload(decode=True) or b""
                charset = part.get_content_charset() or "utf-8"
                try:
                    body = payload.decode(charset, errors="replace")
                except Exception:
                    body = payload.decode("utf-8", errors="replace")
                break
    else:
        payload = msg.get_payload(decode=True) or b""
        charset = msg.get_content_charset() or "utf-8"
        try:
            body = payload.decode(charset, errors="replace")
        except Exception:
            body = payload.decode("utf-8", errors="replace")
    body = re.sub(r"\s+", " ", body or "").strip()
    return body[:limit]


def _extract_email_content(msg: Any) -> Dict[str, str]:
    text_body = ""
    html_body = ""

    if msg.is_multipart():
        for part in msg.walk():
            content_type = (part.get_content_type() or "").lower()
            disposition = str(part.get("Content-Disposition") or "")
            if "attachment" in disposition.lower():
                continue

            payload = part.get_payload(decode=True) or b""
            charset = part.get_content_charset() or "utf-8"
            try:
                decoded = payload.decode(charset, errors="replace")
            except Exception:
                decoded = payload.decode("utf-8", errors="replace")

            if content_type == "text/plain" and not text_body:
                text_body = decoded
            elif content_type == "text/html" and not html_body:
                html_body = decoded
    else:
        payload = msg.get_payload(decode=True) or b""
        charset = msg.get_content_charset() or "utf-8"
        try:
            decoded = payload.decode(charset, errors="replace")
        except Exception:
            decoded = payload.decode("utf-8", errors="replace")
        content_type = (msg.get_content_type() or "").lower()
        if content_type == "text/html":
            html_body = decoded
        else:
            text_body = decoded

    plain_for_snippet = text_body or re.sub(r"<[^>]+>", " ", html_body or "")
    snippet = re.sub(r"\s+", " ", plain_for_snippet).strip()[:320]

    # Keep payload size bounded for API response while preserving tables/markup.
    return {
        "text": (text_body or "")[:120000],
        "html": (html_body or "")[:200000],
        "snippet": snippet,
    }


def _parse_email_header_datetime(raw_date: str) -> Optional[datetime]:
    text = (raw_date or "").strip()
    if not text:
        return None
    try:
        dt = parsedate_to_datetime(text)
        if dt is None:
            return None
        if getattr(dt, "tzinfo", None) is not None:
            return dt.astimezone().replace(tzinfo=None)
        return dt
    except Exception:
        return None


def _collect_known_emails(db: Session) -> set:
    emails = set()
    for user in db.query(User).all():
        email = (user.email or "").strip().lower()
        if email:
            emails.add(email)
    for ref in db.query(Referral).all():
        email = (ref.contact_email or "").strip().lower()
        if email:
            emails.add(email)
    for mapping in MappingService(db).list_mappings():
        email = str(mapping.get("email") or "").strip().lower()
        if email:
            emails.add(email)
    for key in ["email_template_to", "email_template_cc", "follow_up_to", "follow_up_cc"]:
        for email in _parse_email_list(_get_setting_value(db, key, "")):
            text = (email or "").strip().lower()
            if text:
                emails.add(text)
    return emails

def _get_follow_up_settings(db: Session) -> dict:
    default_subject = _compose_follow_up_subject("Follow-Up Summary:")
    default_body = _compose_follow_up_body("Please review the active referral follow-up list below.")
    frequency = (_get_setting_value(db, "follow_up_frequency", "weekly") or "weekly").strip().lower()
    if frequency not in {"daily", "weekly", "monthly"}:
        frequency = "weekly"
    raw_subject = _get_setting_value(db, "follow_up_subject_template", default_subject)
    raw_body = _get_setting_value(db, "follow_up_body_template", default_body)
    normalized_subject = _compose_follow_up_subject(_subject_display_text(raw_subject))
    normalized_body = _compose_follow_up_body(_follow_up_body_display_text(raw_body))
    return {
        "frequency": frequency,
        "send_time": _normalize_send_time(_get_setting_value(db, "follow_up_send_time", "09:00")),
        "to": _get_setting_value(db, "follow_up_to", ""),
        "cc": _get_setting_value(db, "follow_up_cc", ""),
        "subject_template": normalized_subject,
        "body_template": normalized_body,
    }


def _compose_follow_up_subject(subject_base: str) -> str:
    base = str(subject_base or "")
    base = re.sub(r"\{\{?\s*intermediary\s*\}?\}", "", base, flags=re.IGNORECASE)
    base = re.sub(r"\{\{?\s*referral_count\s*\}?\}", "", base, flags=re.IGNORECASE)
    base = re.sub(r"\(\s*\{?\s*referral_count\s*\}?\s*referrals\s*\)", "", base, flags=re.IGNORECASE)
    base = re.sub(r"\(\s*referrals\s*\)", "", base, flags=re.IGNORECASE)
    base = re.sub(r"\{+|\}+", "", base)
    base = re.sub(r"\s*:\s*$", ":", base)
    base = re.sub(r"\s+", " ", base).strip()
    if not base:
        base = "Follow-Up Summary:"
    if not base.endswith(":"):
        base = f"{base}:"
    return f"{base} {{{{intermediary}}}} ({{{{referral_count}}}} referrals)"


def _subject_display_text(subject_template: str) -> str:
    text = str(subject_template or "")
    text = re.sub(r"\{\{?\s*intermediary\s*\}?\}", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\(\s*\{\{?\s*referral_count\s*\}?\}\s*referrals\s*\)", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\{+|\}+", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or "Follow-Up Summary:"


def _compose_follow_up_body(message_line: str) -> str:
    message = str(message_line or "").strip() or "Please review the active referral follow-up list below."
    return (
        "<html><body>"
        "<p>Dear {{intermediary}},</p>"
        f"<p>{message}</p>"
        "<br>{{referrals_table}}<br>"
        "<p>Regards,<br>Applied Home Health Network</p>"
        "</body></html>"
    )


def _follow_up_body_display_text(body_template: str) -> str:
    template = str(body_template or "")
    match = re.search(r"<p>Dear\s*\{\{?\s*intermediary\s*\}?\},</p>\s*<p>(.*?)</p>", template, flags=re.IGNORECASE | re.DOTALL)
    if match:
        extracted = re.sub(r"\s+", " ", match.group(1)).strip()
        if extracted:
            return extracted
    return "Please review the active referral follow-up list below."

def _parse_email_history(history_raw: Optional[str]) -> List[dict]:
    try:
        parsed = json.loads(history_raw or "[]")
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []

def _latest_follow_up_sent(ref: Any) -> Optional[datetime]:
    latest = getattr(ref, "last_follow_up_sent_date", None)
    for record in _parse_email_history(getattr(ref, "email_history", None)):
        if (record.get("type") or "") != "follow_up":
            continue
        sent_at = record.get("sent_at")
        if not sent_at:
            continue
        try:
            sent_dt = datetime.fromisoformat(sent_at.replace("Z", "+00:00")).replace(tzinfo=None)
            if latest is None or sent_dt > latest:
                latest = sent_dt
        except Exception:
            continue
    return latest

def _render_follow_up_table(referrals: List[Any]) -> str:
    rows = []
    for ref in referrals:
        patient_name = f"{ref.first_name or ''} {ref.last_name or ''}".strip() or "-"
        rows.append(
            "<tr>"
            f"<td>{patient_name}</td>"
            f"<td>{ref.dob or '-'}</td>"
            "<td></td>"
            "<td></td>"
            "<td></td>"
            "</tr>"
        )
    return (
        "<table border=\"1\" cellpadding=\"6\" cellspacing=\"0\" style=\"border-collapse:collapse;width:100%;\">"
        "<thead><tr><th>Referral Name</th><th>Date of Birth</th><th>Status</th><th>Assessment Date</th><th>Feedback</th></tr></thead>"
        f"<tbody>{''.join(rows)}</tbody></table>"
    )

def _render_follow_up_template(template: str, intermediary: str, referrals: List[Any], intermediary_email: str) -> str:
    rendered = template or ""
    replacements = {
        "{{intermediary}}": intermediary or "Intermediary",
        "{{intermediary_email}}": intermediary_email or "",
        "{{referral_count}}": str(len(referrals or [])),
        "{{referrals_table}}": _render_follow_up_table(referrals or []),
    }
    for key, value in replacements.items():
        rendered = rendered.replace(key, value)
    return rendered

def _build_follow_up_groups(db: Session, status: Optional[str] = None, intermediary: Optional[str] = None,
                            include_enabled: Optional[bool] = None, idoa_only: bool = False) -> List[dict]:
    q = db.query(Referral).filter(Referral.is_archived == False)
    if idoa_only: q = q.filter(or_(Referral.client_type.ilike("%IDOA%"), Referral.referral_type.ilike("%IDOA%")))
    if status:
        q = q.filter(Referral.status == status)
    if intermediary:
        q = q.filter(Referral.intermediary == intermediary)
    if include_enabled is not None:
        q = q.filter(Referral.include_in_follow_up == include_enabled)

    refs = q.order_by(Referral.intermediary.asc(), Referral.created_at.desc()).all()
    email_service = get_email_service(db)
    follow_up_settings = _get_follow_up_settings(db)
    default_frequency = follow_up_settings["frequency"]
    default_send_time = follow_up_settings["send_time"]
    schedule_by_intermediary: Dict[str, tuple] = {}
    for item in MappingService(db).list_mappings():
        name = (item.get("intermediary") or "").strip().lower()
        if not name or name in schedule_by_intermediary:
            continue
        frequency = (item.get("follow_up_frequency") or default_frequency).strip().lower()
        if frequency not in {"daily", "weekly", "monthly"}:
            frequency = default_frequency
        send_time = _normalize_send_time(item.get("follow_up_send_time") or default_send_time)
        schedule_by_intermediary[name] = (frequency, send_time)

    groups: Dict[str, dict] = {}

    for ref in refs:
        group_key = (ref.intermediary or "Unassigned").strip() or "Unassigned"
        recipient = email_service.get_intermediary_email(
            ref.postal_code or "",
            ref.intermediary or "",
            township=ref.pay_rate_municipality or "",
            form_type=ref.referral_type or "",
        ) or ""
        existing = groups.get(group_key)
        if not existing:
            schedule = schedule_by_intermediary.get(group_key.lower(), (default_frequency, default_send_time))
            existing = {
                "intermediary": group_key,
                "email": recipient,
                "follow_up_frequency": schedule[0],
                "follow_up_send_time": schedule[1],
                "total_referrals": 0,
                "pending_follow_ups": 0,
                "last_follow_up_sent": None,
                "referrals": [],
            }
            groups[group_key] = existing

        include_follow_up = bool(getattr(ref, "include_in_follow_up", True))
        last_sent = _latest_follow_up_sent(ref)
        if last_sent and (existing["last_follow_up_sent"] is None or last_sent > existing["last_follow_up_sent"]):
            existing["last_follow_up_sent"] = last_sent

        existing["total_referrals"] += 1
        if include_follow_up:
            existing["pending_follow_ups"] += 1

        patient_name = f"{ref.first_name or ''} {ref.last_name or ''}".strip() or "-"
        existing["referrals"].append({
            "id": ref.id,
            "patient_name": patient_name,
            "date_sent": ref.referral_date,
            "status": ref.status,
            "include_in_follow_up": include_follow_up,
            "last_follow_up_sent": last_sent.isoformat() if last_sent else None,
        })

    response = []
    for _, group in sorted(groups.items(), key=lambda item: item[0].lower()):
        group["last_follow_up_sent"] = group["last_follow_up_sent"].isoformat() if group["last_follow_up_sent"] else None
        response.append(group)
    return response

def _follow_up_interval_days(frequency: str) -> int:
    if frequency == "daily":
        return 1
    if frequency == "monthly":
        return 30
    return 7


def _group_follow_up_run_key(intermediary_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", (intermediary_name or "").strip().lower()).strip("_")
    return f"follow_up_last_run_{slug or 'unassigned'}"


def _is_group_follow_up_due(db: Session, intermediary_name: str, frequency: str, send_time: str) -> bool:
    now = datetime.now()
    normalized_time = _normalize_send_time(send_time)
    send_hour = int(normalized_time.split(":")[0])
    send_minute = int(normalized_time.split(":")[1])
    scheduled_today = now.replace(hour=send_hour, minute=send_minute, second=0, microsecond=0)
    if now < scheduled_today:
        return False

    last_run_raw = _get_setting_value(db, _group_follow_up_run_key(intermediary_name), "")
    if not last_run_raw:
        return True
    try:
        last_run = datetime.fromisoformat(last_run_raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return True

    # If today's scheduled slot has not been executed yet, allow send now.
    if last_run < scheduled_today:
        return True

    interval = timedelta(days=_follow_up_interval_days((frequency or "weekly").strip().lower()))
    due_at = (last_run + interval).replace(hour=send_hour, minute=send_minute, second=0, microsecond=0)
    return now >= due_at


def _render_plain_placeholders(template: str, replacements: Dict[str, str]) -> str:
    rendered = template or ""
    for key, value in replacements.items():
        rendered = rendered.replace(key, value or "")
    return rendered

def _is_follow_up_due(db: Session) -> bool:
    settings = _get_follow_up_settings(db)
    now = datetime.now()
    send_time = _normalize_send_time(settings.get("send_time", "09:00"))
    send_hour = int(send_time.split(":")[0])
    send_minute = int(send_time.split(":")[1])
    scheduled_today = now.replace(hour=send_hour, minute=send_minute, second=0, microsecond=0)
    if now < scheduled_today:
        return False

    last_run_raw = _get_setting_value(db, "follow_up_last_run", "")
    if not last_run_raw:
        return True
    try:
        last_run = datetime.fromisoformat(last_run_raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return True
    interval = timedelta(days=_follow_up_interval_days(settings["frequency"]))
    due_at = (last_run + interval).replace(hour=send_hour, minute=send_minute, second=0, microsecond=0)
    return now >= due_at

def _upsert_setting(db: Session, key: str, value: str):
    existing = db.query(AppSetting).filter(AppSetting.key == key).first()
    if existing:
        existing.value = value
    else:
        db.add(AppSetting(key=key, value=value))

def _generate_intermediary_id() -> str:
    return f"INT-{uuid.uuid4().hex[:8].upper()}"

def _is_valid_email(email: str) -> bool:
    if not email:
        return False
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email.strip()))

def _upsert_intermediary_mapping_record(db: Session, intermediary: str, email: str) -> str:
    key = f"intermediary_mapping_{intermediary.lower()}"
    existing = db.query(AppSetting).filter(AppSetting.key == key).first()
    existing_data = {}
    if existing and existing.value:
        try:
            existing_data = json.loads(existing.value)
        except Exception:
            existing_data = {}

    intermediary_id = existing_data.get("intermediary_id") or _generate_intermediary_id()
    mapping_data = {
        "intermediary_id": intermediary_id,
        "intermediary": intermediary,
        "email": email,
        "created_at": datetime.utcnow().isoformat()
    }

    if existing:
        existing.value = json.dumps(mapping_data)
    else:
        db.add(AppSetting(key=key, value=json.dumps(mapping_data)))

    return intermediary_id

def _send_follow_up_groups(db: Session, triggered_by: str, send_email: bool = True,
                           intermediary: Optional[str] = None, scheduled_only: bool = False) -> dict:
    settings = _get_follow_up_settings(db)
    intermediary_filter = (intermediary or "").strip() or None
    groups = _build_follow_up_groups(db, include_enabled=True, intermediary=intermediary_filter)
    email_service = get_email_service(db)
    sent_count = 0
    skipped = []
    previews = []

    for group in groups:
        referral_ids = [r["id"] for r in group["referrals"] if r.get("include_in_follow_up")]
        if not referral_ids:
            continue

        intermediary_name = group["intermediary"]
        group_frequency = group.get("follow_up_frequency") or settings["frequency"]
        group_send_time = _normalize_send_time(group.get("follow_up_send_time") or settings.get("send_time", "09:00"))
        recipient = group.get("email") or ""
        refs = db.query(Referral).filter(Referral.id.in_(referral_ids)).all()
        subject = _render_follow_up_template(settings["subject_template"], intermediary_name, refs, recipient)
        body = _render_follow_up_template(settings["body_template"], intermediary_name, refs, recipient)

        follow_up_to_raw = _render_plain_placeholders(
            settings.get("to", ""),
            {
                "{{intermediary}}": intermediary_name,
                "{{intermediary_email}}": recipient,
            },
        )
        follow_up_cc_raw = _render_plain_placeholders(
            settings.get("cc", ""),
            {
                "{{intermediary}}": intermediary_name,
                "{{intermediary_email}}": recipient,
            },
        )
        to_list = _parse_email_list(follow_up_to_raw)
        if not to_list and recipient:
            to_list = [recipient]
        cc_list = _parse_email_list(follow_up_cc_raw)
        for extra_to in to_list[1:]:
            if extra_to not in cc_list:
                cc_list.append(extra_to)
        primary_to = to_list[0] if to_list else ""

        previews.append({
            "intermediary": intermediary_name,
            "email": primary_to,
            "to": to_list,
            "cc": cc_list,
            "referral_count": len(refs),
            "follow_up_frequency": group_frequency,
            "follow_up_send_time": group_send_time,
            "subject": subject,
            "body": body,
            "referral_ids": referral_ids,
        })

        if not send_email:
            continue

        if not primary_to:
            skipped.append({"intermediary": intermediary_name, "reason": "No intermediary email mapping"})
            continue

        if scheduled_only and not _is_group_follow_up_due(db, intermediary_name, group_frequency, group_send_time):
            skipped.append({"intermediary": intermediary_name, "reason": "Not due by schedule"})
            continue

        result = email_service.send_html_email(to_email=primary_to, subject=subject, body=body, cc_emails=cc_list)
        if not result.get("success"):
            skipped.append({"intermediary": intermediary_name, "reason": result.get("error", "Email failed")})
            continue

        sent_count += 1
        now = datetime.now()
        for ref in refs:
            ref.last_follow_up_sent_date = now
            history = _parse_email_history(ref.email_history)
            history.append({
                "type": "follow_up",
                "sent_at": now.isoformat(),
                "recipient": primary_to,
                "cc_recipients": cc_list,
                "sent_by": triggered_by,
                "intermediary": intermediary_name,
                "included_count": len(refs),
            })
            ref.email_history = json.dumps(history)
        log_action(
            db,
            triggered_by,
            "SEND_FOLLOW_UP_EMAIL",
            "follow_up",
            resource_id=intermediary_name,
            details={
                "recipient": primary_to,
                "cc": cc_list,
                "included_referrals": referral_ids,
                "count": len(referral_ids),
            }
        )
        if scheduled_only:
            _upsert_setting(db, _group_follow_up_run_key(intermediary_name), datetime.now().isoformat())

    if send_email and not scheduled_only:
        _upsert_setting(db, "follow_up_last_run", datetime.now().isoformat())
        db.commit()
    elif send_email:
        db.commit()

    return {
        "frequency": settings["frequency"],
        "send_time": settings.get("send_time", "09:00"),
        "groups": previews,
        "sent_groups": sent_count,
        "skipped": skipped,
    }

def _follow_up_scheduler_loop():
    while True:
        db = None
        try:
            db = next(get_db())
            _send_follow_up_groups(db, triggered_by="system", send_email=True, scheduled_only=True)
        except Exception:
            pass
        finally:
            if db:
                db.close()
        # Check every minute so scheduled HH:MM runs close to the configured local time.
        time.sleep(60)

def _default_comment_templates() -> List[dict]:
    return [
        {"key": "outreach", "label": "Outreach", "template": "Reached out to client today; left voicemail", "is_active": True, "sort_order": 0},
        {"key": "follow_up", "label": "Follow-up", "template": "Followed up with client regarding previous outreach; awaiting response", "is_active": True, "sort_order": 1},
        {"key": "assessment", "label": "Assessment", "template": "Assessment status reviewed today; next steps discussed with client", "is_active": True, "sort_order": 2},
        {"key": "scheduling", "label": "Scheduling", "template": "Coordinated scheduling update with client and documented availability", "is_active": True, "sort_order": 3},
        {"key": "documentation", "label": "Documentation", "template": "Reviewed required documents with client and noted outstanding items", "is_active": True, "sort_order": 4},
    ]

def _slugify_template_key(value: str, fallback: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", (value or "").strip().lower()).strip("_")
    return slug or fallback

def _normalize_comment_templates(templates: Any) -> List[dict]:
    if not isinstance(templates, list):
        templates = _default_comment_templates()
    normalized = []
    for idx, item in enumerate(templates):
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        normalized.append({
            "key": _slugify_template_key(item.get("key") or label, f"comment_type_{idx + 1}"),
            "label": label,
            "template": str(item.get("template") or "").strip(),
            "is_active": bool(item.get("is_active", True)),
            "sort_order": int(item.get("sort_order", idx)),
        })
    normalized.sort(key=lambda item: (item.get("sort_order", 0), item.get("label", "")))
    return normalized or _default_comment_templates()

def _get_comment_templates(db: Session, active_only: bool = False) -> List[dict]:
    raw = _get_setting_value(db, "comment_templates", "")
    parsed = None
    if raw:
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = None
    templates = _normalize_comment_templates(parsed)
    if active_only:
        templates = [item for item in templates if item.get("is_active", True)]
    return templates

def _save_comment_templates(db: Session, templates: List[dict]):
    normalized = _normalize_comment_templates(templates)
    setting = db.query(AppSetting).filter(AppSetting.key == "comment_templates").first()
    if not setting:
        setting = AppSetting(key="comment_templates", value=json.dumps(normalized))
        db.add(setting)
    else:
        setting.value = json.dumps(normalized)
    db.commit()

def _normalize_comments_timeline(comments: Any) -> List[dict]:
    return normalize_comments_timeline(comments)

def _render_email_template(template: str, referral: Any, intermediary_email: str) -> str:
    patient_name = f"{referral.first_name or ''} {referral.last_name or ''}".strip()
    replacements = {
        "{{patient_name}}": patient_name,
        "{{first_name}}": referral.first_name or "",
        "{{last_name}}": referral.last_name or "",
        "{{referral_id}}": referral.id or "",
        "{{referral_type}}": referral.referral_type or "",
        "{{referral_date}}": referral.referral_date or "",
        "{{intermediary}}": referral.intermediary or "Intermediary",
        "{{intermediary_email}}": intermediary_email or "",
    }
    rendered = template or ""
    for placeholder, value in replacements.items():
        rendered = rendered.replace(placeholder, str(value))
    return rendered

def apply_ref_fields(ref: Any, data: ReferralCreate, username: str = None):
    ref.first_name = data.first_name
    ref.last_name = data.last_name
    ref.dob = data.dob
    ref.gender = data.gender
    ref.veteran_status = data.veteran_status
    ref.ssn_last = data.ssn_last if data.ssn_last is not None else data.ssn_Last
    ref.medicaid_last = data.medicaid_last if data.medicaid_last is not None else data.medicaid_Last
    ref.address_line1 = data.address_line1
    ref.address_line2 = data.address_line2
    ref.city = data.city
    ref.state = data.state
    ref.postal_code = data.postal_code
    ref.township = data.township
    ref.referral_date = data.referral_date
    ref.referral_source = data.referral_source
    ref.referral_type = data.referral_type
    ref.intermediary = data.intermediary
    ref.branch = data.branch
    ref.marketer = data.marketer
    ref.start_of_care = data.start_of_care
    ref.pay_rate_municipality = data.pay_rate_municipality
    ref.client_type = data.client_type
    ref.desired_caregiver = data.desired_caregiver
    ref.services_required = json.dumps(data.services_required or [])
    ref.assigned_to = data.assigned_to
    ref.status = data.status
    ref.home_visit_scheduled_date = data.home_visit_scheduled_date
    ref.home_visit_time = data.home_visit_time
    ref.home_visit_completed_date = data.home_visit_completed_date
    ref.home_visit_status = data.home_visit_status
    ref.intake_date = data.intake_date
    ref.outreach_date = data.outreach_date
    ref.checklist_review_date = data.checklist_review_date
    ref.home_visit_date = data.home_visit_date
    ref.submitted_to_intermediary_date = data.submitted_to_intermediary_date
    ref.intermediary_assessment_date = data.intermediary_assessment_date
    ref.intermediary_feedback = data.intermediary_feedback
    ref.contract_received_date = data.contract_received_date
    ref.closed_date = data.closed_date
    ref.closure_reason = data.closure_reason
    ref.status_category = data.status_category
    ref.ready_for_assessment = data.ready_for_assessment
    ref.contact_name = data.contact_name
    ref.contact_phone = data.contact_phone
    ref.contact_email = data.contact_email
    ref.contact_relationship = data.contact_relationship
    ref.contact_phone2 = data.contact_phone2
    ref.comments_timeline = json.dumps(normalize_comments_timeline(data.comments_timeline or [], username))
    ref.checklists = json.dumps(data.checklists or {})
    ref.validation_errors = json.dumps(data.validation_errors or [])
    ref.is_archived = data.is_archived
    ref.archive_reason = data.archive_reason
    ref.archive_restore_note = data.archive_restore_note
    if data.include_in_follow_up is not None:
        ref.include_in_follow_up = bool(data.include_in_follow_up)
    if username and not ref.created_by:
        ref.created_by = username
    ref.updated_at = datetime.utcnow()


# Dynamically built from the Referral ORM model so it always matches the DB schema.
# 'id' is excluded because it is auto-generated on import.
REFERRAL_IMPORT_COLUMNS: List[str] = [
    col.name for col in Referral.__table__.columns if col.name != "id"
]

CHECKLIST_DOCUMENT_CSV_FIELDS: List[Dict[str, Any]] = [
    {"column": "checklist_birth_certificate", "index": 0, "label": "Birth Certificate"},
    {"column": "checklist_recent_bank_statement", "index": 1, "label": "Recent Bank Statement (Within 30 days)"},
    {"column": "checklist_ssn_card", "index": 2, "label": "SSN Card"},
    {"column": "checklist_picture_valid_id", "index": 3, "label": "Picture Valid ID"},
    {"column": "checklist_insurance_card", "index": 4, "label": "No Insurance / Medicare/Medicaid Card"},
    {"column": "checklist_doctor_name_phone", "index": 5, "label": "Doctor's Name and Phone Number"},
    {"column": "checklist_current_medications", "index": 6, "label": "List of all Current Medications"},
]
CHECKLIST_DOCUMENT_IMPORT_COLUMNS: List[str] = [item["column"] for item in CHECKLIST_DOCUMENT_CSV_FIELDS]


def _ensure_checklist_docs_length(docs: List[dict], expected_len: int = 7) -> List[dict]:
    normalized = docs if isinstance(docs, list) else []
    while len(normalized) < expected_len:
        normalized.append({})
    return normalized


def _checklist_has_uploaded_file(doc: Dict[str, Any]) -> bool:
    if not isinstance(doc, dict):
        return False
    return bool((doc.get("fileUrl") or "").strip() or (doc.get("fileName") or "").strip() or (doc.get("filePath") or "").strip())


def _csv_value(row: Dict[str, Any], key: str) -> str:
    value = row.get(key)
    return str(value).strip() if value is not None else ""


def _parse_csv_bool(value: str, default: bool = False) -> bool:
    raw = (value or "").strip().lower()
    if raw == "":
        return default
    return raw in {"1", "true", "yes", "y", "on"}


def _parse_csv_json_list(value: str) -> List[Any]:
    raw = (value or "").strip()
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass
    return [item.strip() for item in raw.split(",") if item.strip()]


def _parse_csv_json_object(value: str) -> Dict[str, Any]:
    raw = (value or "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    return {}


# Columns that hold JSON arrays
_CSV_JSON_LIST_COLS = {"services_required", "validation_errors", "email_history"}
# Columns that hold JSON objects
_CSV_JSON_OBJ_COLS = {"checklists"}
# Columns handled with normalize_comments_timeline
_CSV_COMMENTS_COLS = {"comments_timeline"}
# Boolean columns
_CSV_BOOL_COLS = {"is_archived", "include_in_follow_up"}
# DateTime columns – stored as ISO strings when provided, otherwise set automatically
_CSV_DATETIME_COLS = {"email_sent_date", "last_follow_up_sent_date", "archived_at", "created_at", "updated_at"}


def _parse_csv_datetime(value: str) -> Optional[datetime]:
    """Parse an ISO datetime string from a CSV cell; returns None if blank or unparseable."""
    raw = (value or "").strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass
    return None


def _build_referral_from_csv_row(row: Dict[str, Any], created_by: str) -> Any:
    ref = Referral(id="REF" + str(uuid.uuid4())[:8].upper())

    for col in REFERRAL_IMPORT_COLUMNS:
        val = _csv_value(row, col)

        if col in _CSV_COMMENTS_COLS:
            setattr(ref, col, json.dumps(normalize_comments_timeline(_parse_csv_json_list(val), created_by)))
        elif col in _CSV_JSON_LIST_COLS:
            setattr(ref, col, json.dumps(_parse_csv_json_list(val)))
        elif col in _CSV_JSON_OBJ_COLS:
            # Preserve existing checklists from CSV if valid, else default to {}
            obj = _parse_csv_json_object(val)
            setattr(ref, col, json.dumps(obj))
        elif col in _CSV_BOOL_COLS:
            default_val = col == "include_in_follow_up"  # include_in_follow_up defaults True
            setattr(ref, col, _parse_csv_bool(val, default=default_val))
        elif col in _CSV_DATETIME_COLS:
            setattr(ref, col, _parse_csv_datetime(val))
        else:
            setattr(ref, col, val or None)

    # Optional checklist convenience columns allow YES/NO style import per document.
    checklist_data = _parse_csv_json_object(getattr(ref, "checklists", "") or "")
    docs = _ensure_checklist_docs_length(checklist_data.get("documents", []), 7)
    checklist_touched = False
    for item in CHECKLIST_DOCUMENT_CSV_FIELDS:
        raw = _csv_value(row, item["column"])
        if raw == "":
            continue
        idx = int(item["index"])
        checked = _parse_csv_bool(raw, default=False)
        docs[idx]["checked"] = checked
        docs[idx]["timestamp"] = datetime.utcnow().isoformat() if checked else ""
        checklist_touched = True
    if checklist_touched:
        checklist_data["documents"] = docs
        ref.checklists = json.dumps(checklist_data)

    # Ensure required defaults

        ref.status = "New"
    if ref.is_archived and not ref.archived_at:
        ref.archived_at = datetime.utcnow()
    if not ref.created_at:
        ref.created_at = datetime.utcnow()
    if not ref.updated_at:
        ref.updated_at = datetime.utcnow()

    ref.created_by = created_by
    return ref

def validate_archive_info_pair(existing_ref: Any, data: ReferralCreate):
    old_contract_date = ((getattr(existing_ref, "contract_received_date", None) if existing_ref else "") or "").strip()
    old_archive_reason = ((getattr(existing_ref, "archive_reason", None) if existing_ref else "") or "").strip()
    new_contract_date = (data.contract_received_date or "").strip()
    new_archive_reason = (data.archive_reason or "").strip()

    archive_pair_partially_filled = (new_contract_date and not new_archive_reason) or (new_archive_reason and not new_contract_date)

    if archive_pair_partially_filled:
        raise HTTPException(
            status_code=400,
            detail="Contract Received by Intermediary and Archive Reason must both be filled together."
        )

# ─── Auth Routes ───────────────────────────────────────────────────────────────

@app.post("/api/auth/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_password):
        log_action(db, body.username, "LOGIN_FAILED", "auth", details={"reason": "Invalid credentials"})
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        log_action(db, body.username, "LOGIN_FAILED", "auth", details={"reason": "Account inactive"})
        raise HTTPException(status_code=403, detail="Account inactive")
    token = create_token({"sub": user.username, "role": user.role})
    log_action(db, user.username, "LOGIN_SUCCESS", "auth")
    return {
        "token": token,
        "user": {
            "id": user.id, "username": user.username, "email": user.email,
            "full_name": user.full_name, "role": user.role,
            "permissions": {
                "can_create_referral": user.can_create_referral,
                "can_edit_referral": user.can_edit_referral,
                "can_delete_referral": user.can_delete_referral,
                "can_export": user.can_export,
                "can_manage_users": user.can_manage_users,
                "can_manage_dropdowns": user.can_manage_dropdowns,
                "can_archive": user.can_archive,
                "can_send_emails": user.can_send_emails,
            }
        }
    }

@app.get("/api/auth/me")
def me(user: Any = Depends(get_current_user)):
    return {
        "id": user.id, "username": user.username, "email": user.email,
        "full_name": user.full_name, "role": user.role,
        "permissions": {
            "can_create_referral": user.can_create_referral,
            "can_edit_referral": user.can_edit_referral,
            "can_delete_referral": user.can_delete_referral,
            "can_export": user.can_export,
            "can_manage_users": user.can_manage_users,
            "can_manage_dropdowns": user.can_manage_dropdowns,
            "can_archive": user.can_archive,
            "can_send_emails": user.can_send_emails,
        }
    }

# ─── User Management Routes ────────────────────────────────────────────────────

@app.get("/api/users")
def list_users(db: Session = Depends(get_db), user: Any = Depends(require_permission("can_manage_users"))):
    users = db.query(User).all()
    return [{"id": u.id, "username": u.username, "email": u.email,
             "full_name": u.full_name, "role": u.role, "is_active": u.is_active,
             "created_at": u.created_at.isoformat() if u.created_at else None,
             "permissions": {
                 "can_create_referral": u.can_create_referral,
                 "can_edit_referral": u.can_edit_referral,
                 "can_delete_referral": u.can_delete_referral,
                 "can_export": u.can_export,
                 "can_manage_users": u.can_manage_users,
                 "can_manage_dropdowns": u.can_manage_dropdowns,
                 "can_archive": u.can_archive,
                 "can_send_emails": u.can_send_emails,
             }} for u in users]

@app.post("/api/users")
def create_user(body: UserCreate, db: Session = Depends(get_db),
                cu: Any = Depends(require_permission("can_manage_users"))):
    if db.query(User).filter(User.username == body.username).first():
        log_action(db, cu.username, "CREATE_USER_FAILED", "user", details={"reason": "Username already exists", "username": body.username})
        raise HTTPException(status_code=400, detail="Username already exists")
    if db.query(User).filter(User.email == body.email).first():
        log_action(db, cu.username, "CREATE_USER_FAILED", "user", details={"reason": "Email already exists", "email": body.email})
        raise HTTPException(status_code=400, detail="Email already exists")
    u = User(
        username=body.username, email=body.email, full_name=body.full_name,
        hashed_password=hash_password(body.password), role=body.role,
        can_create_referral=body.can_create_referral,
        can_edit_referral=body.can_edit_referral,
        can_delete_referral=body.can_delete_referral,
        can_export=body.can_export,
        can_manage_users=body.can_manage_users,
        can_manage_dropdowns=body.can_manage_dropdowns,
        can_archive=body.can_archive,
        can_send_emails=body.can_send_emails,
    )
    db.add(u); db.commit(); db.refresh(u)
    log_action(db, cu.username, "CREATE_USER", "user", str(u.id), {"username": u.username, "role": u.role})
    return {"success": True, "id": u.id}

@app.put("/api/users/{uid}")
def update_user(uid: int, body: UserUpdate, db: Session = Depends(get_db),
                cu: Any = Depends(require_permission("can_manage_users"))):
    u = db.query(User).filter(User.id == uid).first()
    if not u:
        log_action(db, cu.username, "UPDATE_USER_FAILED", "user", str(uid), {"reason": "User not found"})
        raise HTTPException(status_code=404, detail="User not found")
    old_data = {"username": u.username, "email": u.email, "role": u.role}
    if body.email is not None: u.email = body.email
    if body.full_name is not None: u.full_name = body.full_name
    if body.password: u.hashed_password = hash_password(body.password)
    if body.role is not None: u.role = body.role
    if body.is_active is not None: u.is_active = body.is_active
    if body.can_create_referral is not None: u.can_create_referral = body.can_create_referral
    if body.can_edit_referral is not None: u.can_edit_referral = body.can_edit_referral
    if body.can_delete_referral is not None: u.can_delete_referral = body.can_delete_referral
    if body.can_export is not None: u.can_export = body.can_export
    if body.can_manage_users is not None: u.can_manage_users = body.can_manage_users
    if body.can_manage_dropdowns is not None: u.can_manage_dropdowns = body.can_manage_dropdowns
    if body.can_archive is not None: u.can_archive = body.can_archive
    if body.can_send_emails is not None: u.can_send_emails = body.can_send_emails
    db.commit()
    log_action(db, cu.username, "UPDATE_USER", "user", str(u.id), {"old": old_data, "new": {"username": u.username, "email": u.email, "role": u.role}})
    return {"success": True}

@app.delete("/api/users/{uid}")
def delete_user(uid: int, db: Session = Depends(get_db),
                cu: Any = Depends(require_permission("can_manage_users"))):
    u = db.query(User).filter(User.id == uid).first()
    if not u:
        log_action(db, cu.username, "DELETE_USER_FAILED", "user", str(uid), {"reason": "User not found"})
        raise HTTPException(status_code=404, detail="User not found")
    if u.username == "admin":
        log_action(db, cu.username, "DELETE_USER_FAILED", "user", str(uid), {"reason": "Cannot delete admin user"})
        raise HTTPException(status_code=400, detail="Cannot delete admin user")
    log_action(db, cu.username, "DELETE_USER", "user", str(u.id), {"username": u.username, "role": u.role})
    db.delete(u); db.commit()
    return {"success": True}

# ─── Dropdown Routes ───────────────────────────────────────────────────────────

@app.get("/api/dropdowns")
def get_dropdowns(category: Optional[str] = None, db: Session = Depends(get_db),
                  _: Any = Depends(get_current_user)):
    known_categories = [
        "services", "referral_source", "status", "branch", "archive_reason",
        "gender", "client_type", "relationship", "home_visit_status", "intermediary", "marketer",
        "referral_type", "desired_caregiver"
    ]
    q = db.query(DropdownOption)
    if category:
        q = q.filter(DropdownOption.category == category)
    opts = q.order_by(DropdownOption.category, DropdownOption.sort_order).all()
    result = {k: [] for k in known_categories} if not category else {}
    for o in opts:
        if o.category not in result:
            result[o.category] = []
        result[o.category].append({
            "id": o.id, "value": o.value, "label": o.label,
            "is_active": o.is_active, "sort_order": o.sort_order
        })
    return result

@app.get("/api/dropdowns/public")
def get_public_dropdowns(db: Session = Depends(get_db)):
    """Public endpoint - no auth needed for dropdown values"""
    known_categories = [
        "services", "referral_source", "status", "branch", "archive_reason",
        "gender", "client_type", "relationship", "home_visit_status", "intermediary", "marketer",
        "referral_type", "desired_caregiver"
    ]
    opts = (
        db.query(DropdownOption)
        .filter(DropdownOption.is_active == True)
        .order_by(DropdownOption.category, DropdownOption.sort_order)
        .all()
    )
    result = {k: [] for k in known_categories}
    for o in opts:
        if o.category not in result:
            result[o.category] = []
        result[o.category].append({"value": o.value, "label": o.label})
    return result

@app.get("/api/settings/pdf-fields")
def get_pdf_fields_settings(db: Session = Depends(get_db), _: Any = Depends(require_permission("can_manage_dropdowns"))):
    comment_templates = _get_comment_templates(db, active_only=True)
    return {
        "available": get_available_pdf_fields(comment_templates=comment_templates),
        "selected": _get_selected_pdf_fields(db)
    }

@app.put("/api/settings/pdf-fields")
def update_pdf_fields_settings(body: PdfFieldsUpdate, db: Session = Depends(get_db), _: Any = Depends(require_permission("can_manage_dropdowns"))):
    _save_selected_pdf_fields(db, body.fields)
    return {
        "success": True,
        "selected": _get_selected_pdf_fields(db)
    }


@app.get("/api/settings/referrals/template-csv")
def download_referral_import_template(_: Any = Depends(require_permission("can_manage_dropdowns"))):
    # REFERRAL_IMPORT_COLUMNS is derived dynamically from the Referral model,
    # so this template always contains every column that exists in the database.
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(REFERRAL_IMPORT_COLUMNS + CHECKLIST_DOCUMENT_IMPORT_COLUMNS)  # header row only – blank data row intentionally omitted
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="referral_import_template.csv"'}
    )


@app.post("/api/settings/referrals/import-csv")
async def import_referrals_from_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("can_manage_dropdowns"))
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a valid CSV file")

    try:
        content = await file.read()
        decoded = content.decode("utf-8-sig")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read CSV file")

    reader = csv.DictReader(io.StringIO(decoded))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    normalized_headers = [str(h).strip() for h in reader.fieldnames if h is not None]
    supported_headers = set(REFERRAL_IMPORT_COLUMNS + CHECKLIST_DOCUMENT_IMPORT_COLUMNS)
    if not any(col in normalized_headers for col in supported_headers):
        raise HTTPException(status_code=400, detail="CSV headers do not match referral template")

    inserted = 0
    skipped = 0
    errors = []

    for index, raw_row in enumerate(reader, start=2):
        row = {str(k).strip(): (v or "") for k, v in (raw_row or {}).items() if k is not None}
        if all(not str(v).strip() for v in row.values()):
            skipped += 1
            continue
        try:
            ref = _build_referral_from_csv_row(row, current_user.username)
            db.add(ref)
            inserted += 1
        except Exception as exc:
            skipped += 1
            errors.append({"row": index, "error": str(exc)})

    if inserted:
        db.commit()
    else:
        db.rollback()

    log_action(
        db,
        current_user.username,
        "IMPORT_REFERRALS_CSV",
        "referral",
        details={"inserted": inserted, "skipped": skipped, "errors": len(errors), "filename": file.filename}
    )

    return {
        "success": True,
        "inserted": inserted,
        "skipped": skipped,
        "errors": errors[:25],
        "total_errors": len(errors)
    }

@app.get("/api/settings/comment-templates")
def get_comment_templates_settings(db: Session = Depends(get_db), _: Any = Depends(require_permission("can_manage_dropdowns"))):
    return {"templates": _get_comment_templates(db)}

@app.get("/api/settings/comment-templates/public")
def get_public_comment_templates(db: Session = Depends(get_db), _: Any = Depends(get_current_user)):
    return {"templates": _get_comment_templates(db, active_only=True)}

@app.put("/api/settings/comment-templates")
def update_comment_templates_settings(body: CommentTemplatesUpdate, db: Session = Depends(get_db), current_user: Any = Depends(require_permission("can_manage_dropdowns"))):
    templates = [item.dict() for item in body.templates]
    _save_comment_templates(db, templates)
    log_action(db, current_user.username, "UPDATE_COMMENT_TEMPLATES", "app_setting", details={"count": len(templates)})
    return {"success": True, "templates": _get_comment_templates(db)}

# ─── Workflow Stages Routes ────────────────────────────────────────────────────

@app.get("/api/settings/workflow-stages")
def get_workflow_stages(db: Session = Depends(get_db), _: Any = Depends(get_current_user)):
    """Get all workflow stages"""
    stages = db.query(WorkflowStage).filter(WorkflowStage.is_active == True)\
               .order_by(WorkflowStage.sort_order).all()
    return {"stages": [
        {
            "id": s.id,
            "key": s.key,
            "label": s.label,
            "description": s.description,
            "sort_order": s.sort_order,
            "is_active": s.is_active
        } for s in stages
    ]}

@app.get("/api/settings/stage-comment-mappings")
def get_stage_comment_mappings(db: Session = Depends(get_db), _: Any = Depends(require_permission("can_manage_dropdowns"))):
    """Get all stage-to-comment-template mappings (admin only)"""
    mappings = db.query(StageCommentMapping).filter(StageCommentMapping.is_active == True)\
                  .order_by(StageCommentMapping.stage_key, StageCommentMapping.sort_order).all()
    return {"mappings": [
        {
            "id": m.id,
            "stage_key": m.stage_key,
            "comment_type_key": m.comment_type_key,
            "description": m.description,
            "is_active": m.is_active,
            "sort_order": m.sort_order
        } for m in mappings
    ]}

@app.post("/api/settings/stage-comment-mappings")
def create_stage_comment_mapping(body: StageCommentMappingCreate, db: Session = Depends(get_db), 
                                 current_user: Any = Depends(require_permission("can_manage_dropdowns"))):
    """Create a new stage-to-comment-template mapping"""
    existing = db.query(StageCommentMapping)\
                 .filter_by(stage_key=body.stage_key, comment_type_key=body.comment_type_key).first()
    if existing:
        raise HTTPException(status_code=400, detail="Mapping already exists")
    
    mapping = StageCommentMapping(
        stage_key=body.stage_key,
        comment_type_key=body.comment_type_key,
        description=body.description,
        is_active=body.is_active,
        sort_order=body.sort_order
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    log_action(db, current_user.username, "CREATE_STAGE_MAPPING", "stage_comment_mapping", str(mapping.id),
               {"stage_key": body.stage_key, "comment_type_key": body.comment_type_key})
    return {"success": True, "mapping": {
        "id": mapping.id,
        "stage_key": mapping.stage_key,
        "comment_type_key": mapping.comment_type_key,
        "description": mapping.description,
        "is_active": mapping.is_active,
        "sort_order": mapping.sort_order
    }}

@app.put("/api/settings/stage-comment-mappings/{mid}")
def update_stage_comment_mapping(mid: int, body: StageCommentMappingCreate, db: Session = Depends(get_db),
                                 current_user: Any = Depends(require_permission("can_manage_dropdowns"))):
    """Update a stage-to-comment-template mapping"""
    mapping = db.query(StageCommentMapping).filter_by(id=mid).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    mapping.stage_key = body.stage_key
    mapping.comment_type_key = body.comment_type_key
    mapping.description = body.description
    mapping.is_active = body.is_active
    mapping.sort_order = body.sort_order
    db.commit()
    log_action(db, current_user.username, "UPDATE_STAGE_MAPPING", "stage_comment_mapping", str(mapping.id))
    return {"success": True}

@app.delete("/api/settings/stage-comment-mappings/{mid}")
def delete_stage_comment_mapping(mid: int, db: Session = Depends(get_db),
                                 current_user: Any = Depends(require_permission("can_manage_dropdowns"))):
    """Delete a stage-to-comment-template mapping"""
    mapping = db.query(StageCommentMapping).filter_by(id=mid).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    db.delete(mapping)
    db.commit()
    log_action(db, current_user.username, "DELETE_STAGE_MAPPING", "stage_comment_mapping", str(mapping.id))
    return {"success": True}

@app.get("/api/users/assigned-to")
def get_assigned_to_users(db: Session = Depends(get_db), _: Any = Depends(get_current_user)):
    """Get list of active users for 'Assigned To' dropdown"""
    users = db.query(User).filter(User.is_active == True).order_by(User.full_name).all()
    return [{"value": u.username, "label": f"{u.full_name} ({u.username})"} for u in users]

@app.post("/api/dropdowns")
def create_dropdown(body: DropdownCreate, db: Session = Depends(get_db),
                    _: Any = Depends(require_permission("can_manage_dropdowns"))):
    existing = db.query(DropdownOption).filter_by(category=body.category, value=body.value).first()
    if body.category == "intermediary":
        email = (body.intermediary_email or "").strip()
        if not email:
            raise HTTPException(status_code=400, detail="Email is required for Intermediary option")
        if not _is_valid_email(email):
            raise HTTPException(status_code=400, detail="Valid email is required for Intermediary option")

        # If intermediary option already exists, still allow email mapping update.
        if existing:
            _upsert_intermediary_mapping_record(db, body.value.strip(), email)
            db.commit()
            return {"success": True, "id": existing.id, "updated_mapping": True}

    if existing:
        raise HTTPException(status_code=400, detail="Option already exists")

    opt = DropdownOption(category=body.category, value=body.value,
                         label=body.label, sort_order=body.sort_order)
    db.add(opt)

    if body.category == "intermediary":
        _upsert_intermediary_mapping_record(db, body.value.strip(), body.intermediary_email.strip())

    db.commit(); db.refresh(opt)
    return {"success": True, "id": opt.id}

@app.put("/api/dropdowns/{did}")
def update_dropdown(did: int, body: DropdownUpdate, db: Session = Depends(get_db),
                    _: Any = Depends(require_permission("can_manage_dropdowns"))):
    opt = db.query(DropdownOption).filter(DropdownOption.id == did).first()
    if not opt:
        raise HTTPException(status_code=404, detail="Not found")
    if body.label is not None: opt.label = body.label
    if body.value is not None: opt.value = body.value
    if body.is_active is not None: opt.is_active = body.is_active
    if body.sort_order is not None: opt.sort_order = body.sort_order
    db.commit()
    return {"success": True}

@app.delete("/api/dropdowns/{did}")
def delete_dropdown(did: int, db: Session = Depends(get_db),
                    _: Any = Depends(require_permission("can_manage_dropdowns"))):
    opt = db.query(DropdownOption).filter(DropdownOption.id == did).first()
    if not opt: raise HTTPException(status_code=404, detail="Not found")
    db.delete(opt); db.commit()
    return {"success": True}

# ─── Referral Routes ───────────────────────────────────────────────────────────

@app.get("/api/referrals")
def list_referrals(
    archived: bool = False,
    status: Optional[str] = None,
    search: Optional[str] = None,
    format: str = "full",  # Add format parameter
    db: Session = Depends(get_db),
    _: Any = Depends(get_current_user)
):
    q = db.query(Referral).filter(Referral.is_archived == archived)
    if status:
        q = q.filter(Referral.status == status)
    if search:
        s = f"%{search}%"
        q = q.filter(
            Referral.first_name.ilike(s) | Referral.last_name.ilike(s) |
            Referral.city.ilike(s) | Referral.status.ilike(s) |
            Referral.branch.ilike(s)
        )
    refs = q.order_by(Referral.created_at.desc()).all()
    
    if format == "table":
        # Return simplified table format
        return [{
            "id": r.id,
            "referralDate": r.referral_date,
            "referralSource": r.referral_source,
            "lastName": r.last_name,
            "firstName": r.first_name,
            "primaryPhone": r.contact_phone,
            "address": r.address_line1,
            "city": r.city,
            "postalCode": r.postal_code,
            "dateOfBirth": r.dob,
            "vendor": r.intermediary,  # Assuming vendor = intermediary
            "status": r.status,
            "notes": _get_first_comment(r.comments_timeline)
        } for r in refs]
    
    return [ref_to_dict(r) for r in refs]

@app.get("/api/referrals/by-intermediary")
def list_referrals_by_intermediary(
    intermediary: Optional[str] = None,
    status: Optional[str] = None,
    follow_up_enabled: Optional[str] = None,
    db: Session = Depends(get_db),
    _: Any = Depends(get_current_user)
):
    include_enabled = None
    if follow_up_enabled is not None and follow_up_enabled != "":
        include_enabled = str(follow_up_enabled).lower() == "true"
    return _build_follow_up_groups(
        db,
        status=status,
        intermediary=intermediary,
        include_enabled=include_enabled,
        idoa_only=True,
    )

@app.post("/api/referrals")
def create_referral(body: ReferralCreate, db: Session = Depends(get_db),
                    user: Any = Depends(require_permission("can_create_referral"))):
    rid = "REF" + str(uuid.uuid4())[:8].upper()
    ref = Referral(id=rid)
    apply_ref_fields(ref, body, user.username)
    if body.include_in_follow_up is None:
        ref.include_in_follow_up = True
    db.add(ref); db.commit(); db.refresh(ref)
    log_action(db, user.username, "CREATE_REFERRAL", "referral", rid, {"patient": f"{body.first_name} {body.last_name}"})
    return {"success": True, "id": rid, "referral": ref_to_dict(ref)}

@app.get("/api/referrals/{rid}")
def get_referral(rid: str, db: Session = Depends(get_db), _: Any = Depends(get_current_user)):
    ref = db.query(Referral).filter(Referral.id == rid).first()
    if not ref: raise HTTPException(status_code=404, detail="Not found")
    return ref_to_dict(ref)

@app.put("/api/referrals/{rid}")
def update_referral(rid: str, body: ReferralCreate, db: Session = Depends(get_db),
                    user: Any = Depends(require_permission("can_edit_referral"))):
    ref = db.query(Referral).filter(Referral.id == rid).first()
    if not ref: 
        log_action(db, user.username, "UPDATE_REFERRAL_FAILED", "referral", rid, {"reason": "Not found"})
        raise HTTPException(status_code=404, detail="Not found")
    old_status = ref.status
    apply_ref_fields(ref, body, user.username)
    # Auto-archive on certain statuses
    AUTO_ARCHIVE_STATUSES = {"Already with another agency", "Ineligible", "Deceased", "Not Interested", "Unable to contact"}
    if ref.status in AUTO_ARCHIVE_STATUSES and not ref.is_archived:
        ref.is_archived = True
        ref.archive_reason = ref.status
        ref.archive_restore_note = None
        ref.archived_at = datetime.utcnow()
    db.commit(); db.refresh(ref)
    log_action(db, user.username, "UPDATE_REFERRAL", "referral", rid, {"patient": f"{ref.first_name} {ref.last_name}", "old_status": old_status, "new_status": ref.status})
    return {"success": True, "referral": ref_to_dict(ref)}

@app.delete("/api/referrals/{rid}")
def delete_referral(rid: str, db: Session = Depends(get_db),
                    user: Any = Depends(require_permission("can_delete_referral"))):
    ref = db.query(Referral).filter(Referral.id == rid).first()
    if not ref: 
        log_action(db, user.username, "DELETE_REFERRAL_FAILED", "referral", rid, {"reason": "Not found"})
        raise HTTPException(status_code=404, detail="Not found")
    log_action(db, user.username, "DELETE_REFERRAL", "referral", rid, {"patient": f"{ref.first_name} {ref.last_name}"})
    db.delete(ref); db.commit()
    return {"success": True}

@app.put("/api/referrals/{rid}/checklist/documents/{item_index}")
def update_checklist(rid: str, item_index: int, body: ChecklistUpdate,
                     db: Session = Depends(get_db), _: Any = Depends(get_current_user)):
    ref = db.query(Referral).filter(Referral.id == rid).first()
    if not ref: raise HTTPException(status_code=404, detail="Not found")
    try:
        cl = json.loads(ref.checklists or "{}")
    except:
        cl = {}
    docs = cl.get("documents", [{}]*7)
    while len(docs) <= item_index:
        docs.append({})
    docs[item_index] = {
        "checked": body.checked,
        "timestamp": datetime.utcnow().isoformat() if body.checked else ""
    }
    cl["documents"] = docs
    ref.checklists = json.dumps(cl)
    ref.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True}

@app.post("/api/referrals/{rid}/archive")
def archive_referral(rid: str, reason: str = Query(...),
                     db: Session = Depends(get_db),
                     user: Any = Depends(require_permission("can_archive"))):
    ref = db.query(Referral).filter(Referral.id == rid).first()
    if not ref: 
        log_action(db, user.username, "ARCHIVE_REFERRAL_FAILED", "referral", rid, {"reason": "Not found"})
        raise HTTPException(status_code=404, detail="Not found")
    reason = (reason or "").strip()
    contract_received_date = (ref.contract_received_date or "").strip()
    if not contract_received_date or not reason:
        raise HTTPException(
            status_code=400,
            detail="Archive requires both Contract Received by Intermediary and Archive Reason."
        )
    ref.is_archived = True
    ref.archive_reason = reason
    ref.archive_restore_note = None
    ref.archived_at = datetime.utcnow()
    ref.updated_at = datetime.utcnow()
    db.commit()
    log_action(db, user.username, "ARCHIVE_REFERRAL", "referral", rid, {"patient": f"{ref.first_name} {ref.last_name}", "reason": reason})
    return {"success": True}

@app.post("/api/referrals/{rid}/unarchive")
def unarchive_referral(rid: str, restore_reason: str = Query(...),
                       db: Session = Depends(get_db),
                       user: Any = Depends(require_permission("can_archive"))):
    ref = db.query(Referral).filter(Referral.id == rid).first()
    if not ref: 
        log_action(db, user.username, "UNARCHIVE_REFERRAL_FAILED", "referral", rid, {"reason": "Not found"})
        raise HTTPException(status_code=404, detail="Not found")
    restore_reason = (restore_reason or "").strip()
    if not restore_reason:
        raise HTTPException(status_code=400, detail="Restore reason is required")
    ref.is_archived = False
    ref.archive_reason = None
    ref.archive_restore_note = restore_reason
    ref.archived_at = None
    ref.updated_at = datetime.utcnow()
    db.commit()
    log_action(db, user.username, "UNARCHIVE_REFERRAL", "referral", rid, {"patient": f"{ref.first_name} {ref.last_name}", "restore_reason": restore_reason})
    return {"success": True}

@app.put("/api/referrals/{rid}/complete-schedule")
def complete_schedule(rid: str, db: Session = Depends(get_db),
                      user: Any = Depends(require_permission("can_edit_referral"))):
    ref = db.query(Referral).filter(Referral.id == rid).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Referral not found")

    ref.home_visit_status = "Completed"
    ref.home_visit_completed_date = datetime.utcnow().date().isoformat()
    ref.updated_at = datetime.utcnow()
    db.commit()

    log_action(db, user.username, "COMPLETE_SCHEDULE", "referral", rid,
               {"patient": f"{ref.first_name} {ref.last_name}"})
    return {"success": True}

# ─── Document File Upload ─────────────────────────────────────────────────────

ALLOWED_EXTENSIONS = {'.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.gif', '.webp'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

@app.post("/api/referrals/{rid}/documents/{item_index}")
async def upload_document(rid: str, item_index: int, file: UploadFile = File(...),
                           db: Session = Depends(get_db),
                           user: Any = Depends(get_current_user)):
    ref = db.query(Referral).filter(Referral.id == rid).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Not found")
    ext = pathlib.Path(file.filename or '').suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    ref_dir = UPLOADS_DIR / rid
    ref_dir.mkdir(exist_ok=True)
    safe_name = f"{item_index}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = ref_dir / safe_name
    file_path.write_bytes(content)

    checklists = json.loads(ref.checklists or '{}') if isinstance(ref.checklists, str) else (ref.checklists or {})
    docs = checklists.get('documents', [{}] * 7)
    while len(docs) <= item_index:
        docs.append({})
    # Remove old file if exists
    old_file = docs[item_index].get('filePath', '')
    if old_file and os.path.exists(old_file):
        os.remove(old_file)
    docs[item_index]['fileUrl'] = f'/uploads/{rid}/{safe_name}'
    docs[item_index]['fileName'] = file.filename
    docs[item_index]['filePath'] = str(file_path)
    docs[item_index]['checked'] = True
    docs[item_index]['timestamp'] = datetime.utcnow().isoformat()
    checklists['documents'] = docs
    ref.checklists = json.dumps(checklists)
    db.commit()
    log_action(db, user.username, "UPLOAD_DOCUMENT", "referral", rid,
               {"item_index": item_index, "file_name": file.filename})
    return {"file_url": f'/uploads/{rid}/{safe_name}', "file_name": file.filename}

@app.delete("/api/referrals/{rid}/documents/{item_index}")
def delete_document(rid: str, item_index: int, db: Session = Depends(get_db),
                    user: Any = Depends(get_current_user)):
    ref = db.query(Referral).filter(Referral.id == rid).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Not found")
    checklists = json.loads(ref.checklists or '{}') if isinstance(ref.checklists, str) else (ref.checklists or {})
    docs = checklists.get('documents', [])
    if item_index < len(docs):
        file_path = docs[item_index].get('filePath', '')
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        docs[item_index].pop('fileUrl', None)
        docs[item_index].pop('fileName', None)
        docs[item_index].pop('filePath', None)
        docs[item_index]['checked'] = False
        docs[item_index]['timestamp'] = ""
        checklists['documents'] = docs
        ref.checklists = json.dumps(checklists)
        db.commit()
    log_action(db, user.username, "DELETE_DOCUMENT", "referral", rid, {"item_index": item_index})
    return {"success": True}

# ─── PDF Export ────────────────────────────────────────────────────────────────

@app.get("/api/referrals/{rid}/pdf")
def export_pdf(rid: str, db: Session = Depends(get_db),
               user: Any = Depends(require_permission("can_export"))):
    ref = db.query(Referral).filter(Referral.id == rid).first()
    if not ref: 
        log_action(db, user.username, "EXPORT_PDF_FAILED", "referral", rid, {"reason": "Not found"})
        raise HTTPException(status_code=404, detail="Not found")
    assigned_display = ref.assigned_to or ""
    if ref.assigned_to:
        assigned_user = db.query(User).filter(User.username == ref.assigned_to).first()
        if assigned_user:
            assigned_display = (assigned_user.full_name or assigned_user.username or "").strip()
    ref.assigned_to_display = assigned_display

    selected_fields = _get_selected_pdf_fields(db)
    comment_templates = _get_comment_templates(db, active_only=True)
    pdf_bytes = generate_referral_pdf(ref, selected_fields, comment_templates=comment_templates)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    name = f"{(ref.first_name or 'Referral').strip()}_{(ref.last_name or '').strip()}_{ts}.pdf".replace(" ", "_")
    log_action(db, user.username, "EXPORT_PDF", "referral", rid, {"patient": f"{ref.first_name} {ref.last_name}"})
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})

# ─── CSV Export ────────────────────────────────────────────────────────────────

@app.get("/api/referrals/export/csv")
def export_csv(archived: bool = False, db: Session = Depends(get_db),
               user: Any = Depends(require_permission("can_export"))):
    refs = db.query(Referral).filter(Referral.is_archived == archived).all()
    output = io.StringIO()
    writer = csv.writer(output)
    
    # All possible field mappings
    field_mappings = [
        ("id", "ID"), ("first_name", "First Name"), ("last_name", "Last Name"),
        ("dob", "DOB"), ("gender", "Gender"), ("veteran_status", "Veteran"),
        ("ssn_last", "SSN Last"), ("medicaid_last", "Medicaid Last"),
        ("address_line1", "Address Line1"), ("address_line2", "Address Line2"),
        ("city", "City"), ("state", "State"), ("postal_code", "Postal Code"),
        ("township", "Township"), ("referral_date", "Referral Date"),
        ("referral_source", "Referral Source"), ("branch", "Branch"),
        ("marketer", "Marketer"), ("client_type", "Client Type"), ("status", "Status"),
        ("services_required", "Services Required"), ("start_of_care", "Start of Care"),
        ("pay_rate_municipality", "Pay Rate Municipality"), ("assigned_to", "Assigned To"),
        ("home_visit_time", "Home Visit Time"),
        ("contact_name", "Contact Name"), ("contact_phone", "Contact Phone"),
        ("contact_email", "Contact Email"), ("contact_relationship", "Contact Relationship"),
        ("intake_date", "Intake Date"), ("outreach_date", "Outreach Date"),
        ("checklist_review_date", "Checklist Date"), ("home_visit_date", "Home Visit Date"),
        ("submitted_to_intermediary_date", "Submitted to Intermediary"),
        ("intermediary_assessment_date", "Assessment Date"),
        ("contract_received_date", "Contract Received"), ("closed_date", "Closed Date"),
        ("closure_reason", "Closure Reason"), ("archive_reason", "Archive Reason"),
        ("created_at", "Created At"), ("updated_at", "Updated At"), ("created_by", "Created By")
    ]
    
    # Always include a stable header set so empty datasets still produce readable CSV.
    headers = [label for _, label in field_mappings]
    idx = headers.index("Services Required")
    headers.insert(idx + 1, "Birth Certificate File Uploaded")
    headers.insert(idx + 2, "Recent Bank Statement File Uploaded")
    headers.insert(idx + 3, "SSN Card File Uploaded")
    headers.insert(idx + 4, "Picture Valid ID File Uploaded")
    headers.insert(idx + 5, "Insurance/Medicaid Card File Uploaded")
    headers.insert(idx + 6, "Doctor Name and Phone File Uploaded")
    headers.insert(idx + 7, "Current Medications File Uploaded")
    
    writer.writerow(headers)
    
    for r in refs:
        row = []
        for field, _ in field_mappings:
            if field == "services_required":
                try:
                    services = ", ".join(json.loads(r.services_required or "[]"))
                except:
                    services = ""
                row.append(services)
                
                # Add checklist file upload status
                try:
                    checklist = json.loads(r.checklists or "{}")
                    docs = _ensure_checklist_docs_length(checklist.get("documents", []), 7)
                except Exception:
                    docs = _ensure_checklist_docs_length([], 7)
                
                for item in CHECKLIST_DOCUMENT_CSV_FIELDS:
                    row.append("YES" if _checklist_has_uploaded_file(docs[item["index"]]) else "NO")
            elif field == "created_at" or field == "updated_at":
                val = getattr(r, field, None)
                row.append(val.isoformat() if val else "")
            else:
                val = getattr(r, field, None)
                row.append(val if val else "")
        
        writer.writerow(row)
    output.seek(0)
    fname = f"referrals_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    log_action(db, user.username, "EXPORT_CSV", "referral", "", {"count": len(refs)})
    return StreamingResponse(io.BytesIO(output.getvalue().encode("utf-8-sig")),
                              media_type="text/csv",
                              headers={"Content-Disposition": f'attachment; filename="{fname}"'})

@app.get("/api/logs")
def get_logs(db: Session = Depends(get_db), _: Any = Depends(get_current_user)):
    """Get recent logs"""
    logs = db.query(Log).order_by(Log.timestamp.desc()).limit(1000).all()
    return [{
        "id": l.id,
        "timestamp": l.timestamp.isoformat() if l.timestamp else None,
        "user": l.user,
        "action": l.action,
        "resourceType": l.resource_type,
        "resourceId": l.resource_id,
        "details": json.loads(l.details) if l.details else {}
    } for l in logs]

@app.get("/api/logs/user/{username}")
def get_user_logs(username: str, db: Session = Depends(get_db), _: Any = Depends(get_current_user)):
    """Get logs for a specific user"""
    logs = db.query(Log).filter(Log.user == username).order_by(Log.timestamp.desc()).limit(500).all()
    return [{
        "id": l.id,
        "timestamp": l.timestamp.isoformat() if l.timestamp else None,
        "user": l.user,
        "action": l.action,
        "resourceType": l.resource_type,
        "resourceId": l.resource_id,
        "details": json.loads(l.details) if l.details else {}
    } for l in logs]

# ─── Email & Intermediary ──────────────────────────────────────────────────────

@app.post("/api/email-settings")
def update_email_settings(
    settings: EmailSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("can_manage_users"))
):
    """Update email configuration settings"""
    try:
        # Map settings to database keys
        setting_map = {
            "smtp_host": "email_smtp_host",
            "smtp_port": "email_smtp_port",
            "smtp_user": "email_smtp_user",
            "smtp_password": "email_smtp_password",
            "from_address": "email_from_address",
            "additional_cc": "email_additional_cc",
            "template_to": "email_template_to",
            "template_cc": "email_template_cc",
            "subject_template": "email_subject_template",
            "body_template": "email_body_template",
            "include_referral_contact": "email_include_referral_contact",
            "include_sender_account": "email_include_sender_account",
            "follow_up_frequency": "follow_up_frequency",
            "follow_up_send_time": "follow_up_send_time",
            "follow_up_to": "follow_up_to",
            "follow_up_cc": "follow_up_cc",
            "follow_up_subject_template": "follow_up_subject_template",
            "follow_up_body_template": "follow_up_body_template"
        }

        payload = settings.dict()
        template_to_value = str(payload.get("template_to") or "").strip()
        include_referral_contact = bool(payload.get("include_referral_contact", True))
        include_sender_account = bool(payload.get("include_sender_account", True))
        if not template_to_value and not include_referral_contact and not include_sender_account:
            raise HTTPException(
                status_code=400,
                detail="Template TO can be blank only when Referral Contact Email or Sender Account Email is enabled"
            )

        if payload.get("subject_template") is not None:
            payload["subject_template"] = _compose_email_subject(payload.get("subject_template"))
        if payload.get("body_template") is not None:
            payload["body_template"] = _compose_email_body(payload.get("body_template"))
        if payload.get("follow_up_subject_template") is not None:
            payload["follow_up_subject_template"] = _compose_follow_up_subject(payload.get("follow_up_subject_template"))
        if payload.get("follow_up_body_template") is not None:
            payload["follow_up_body_template"] = _compose_follow_up_body(payload.get("follow_up_body_template"))

        for key, db_key in setting_map.items():
            value = payload.get(key)
            if value is not None:
                existing = db.query(AppSetting).filter(AppSetting.key == db_key).first()
                if existing:
                    existing.value = str(value)
                else:
                    new_setting = AppSetting(key=db_key, value=str(value))
                    db.add(new_setting)
        
        db.commit()
        log_action(db, current_user.username, "UPDATE_EMAIL_SETTINGS", "app_setting", details={"settings": settings.dict()})
        
        return {"success": True, "message": "Email settings updated"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/email-settings")
def get_email_settings(
    db: Session = Depends(get_db),
    _: Any = Depends(require_permission("can_manage_users"))
):
    """Get current email configuration (hides passwords)"""
    try:
        settings = {}
        keys = [
            "email_smtp_host", "email_smtp_port", "email_smtp_user", "email_from_address", "email_additional_cc",
            "email_template_to", "email_template_cc",
            "email_include_referral_contact", "email_include_sender_account",
            "follow_up_frequency", "follow_up_send_time", "follow_up_to", "follow_up_cc",
            "follow_up_subject_template", "follow_up_body_template"
        ]
        for key in keys:
            setting = db.query(AppSetting).filter(AppSetting.key == key).first()
            if setting:
                settings[key] = setting.value

        template_settings = _get_email_template_settings(db)
        settings["email_template_to"] = template_settings["to"]
        settings["email_template_cc"] = template_settings["cc"]
        settings["email_subject_template"] = _email_subject_display_text(template_settings["subject_template"])
        settings["email_body_template"] = _email_body_display_text(template_settings["body_template"])
        settings["email_include_referral_contact"] = template_settings["include_referral_contact"]
        settings["email_include_sender_account"] = template_settings["include_sender_account"]
        follow_up_settings = _get_follow_up_settings(db)
        settings["follow_up_frequency"] = follow_up_settings["frequency"]
        settings["follow_up_send_time"] = follow_up_settings["send_time"]
        settings["follow_up_to"] = follow_up_settings["to"]
        settings["follow_up_cc"] = follow_up_settings["cc"]
        settings["follow_up_subject_template"] = _subject_display_text(follow_up_settings["subject_template"])
        settings["follow_up_body_template"] = _follow_up_body_display_text(follow_up_settings["body_template"])
        
        return settings
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/email-replies")
def get_email_replies(
    limit: int = Query(20, ge=1, le=100),
    from_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: Any = Depends(require_permission("can_manage_users"))
):
    """Fetch recent inbox replies where sender email exists in system database emails."""
    smtp_host = _get_setting_value(db, "email_smtp_host", "")
    smtp_user = _get_setting_value(db, "email_smtp_user", "")
    smtp_password = _get_setting_value(db, "email_smtp_password", "")

    if not smtp_user or not smtp_password:
        return {"items": [], "error": "SMTP user/password not configured"}

    known_emails = _collect_known_emails(db)
    if not known_emails:
        return {"items": []}

    lower_date = None
    upper_date = datetime.now().date()
    if from_date:
        try:
            lower_date = datetime.strptime(from_date, "%Y-%m-%d").date()
        except Exception:
            raise HTTPException(status_code=400, detail="from_date must be in YYYY-MM-DD format")
        if lower_date > upper_date:
            raise HTTPException(status_code=400, detail="from_date cannot be greater than today")

    imap_host = _imap_host_from_smtp(smtp_host)
    items: List[Dict[str, str]] = []
    conn = None
    try:
        conn = imaplib.IMAP4_SSL(imap_host, timeout=8)
        conn.login(smtp_user, smtp_password)
        conn.select("INBOX")
        typ, data = conn.search(None, "ALL")
        if typ != "OK":
            return {"items": []}

        message_ids = data[0].split() if data and data[0] else []
        scan_ids = list(reversed(message_ids[-250:]))

        for mid in scan_ids:
            if len(items) >= limit:
                break
            ftyp, msg_data = conn.fetch(mid, "(RFC822)")
            if ftyp != "OK" or not msg_data:
                continue
            raw_email = None
            for part in msg_data:
                if isinstance(part, tuple) and len(part) >= 2:
                    raw_email = part[1]
                    break
            if not raw_email:
                continue

            msg = message_from_bytes(raw_email)
            sender = parseaddr(msg.get("From", ""))[1].strip().lower()
            if not sender or sender not in known_emails:
                continue

            msg_dt = _parse_email_header_datetime(msg.get("Date", ""))
            if lower_date is not None:
                if msg_dt is None:
                    continue
                msg_day = msg_dt.date()
                if msg_day < lower_date or msg_day > upper_date:
                    continue

            content = _extract_email_content(msg)

            items.append({
                "from": sender,
                "date": _decode_mime_header(msg.get("Date", "")),
                "subject": _decode_mime_header(msg.get("Subject", "")),
                "snippet": content.get("snippet", ""),
                "body_html": content.get("html", ""),
                "body_text": content.get("text", ""),
            })

        return {"items": items}
    except Exception as e:
        logger.exception("Error fetching email replies: %s", e)
        return {"items": [], "error": "Could not read inbox replies"}
    finally:
        try:
            if conn is not None:
                conn.logout()
        except Exception:
            pass

@app.post("/api/intermediary-mapping")
def create_intermediary_mapping(
    mapping: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("can_manage_dropdowns"))
):
    """Create or update intermediary-to-email mapping"""
    try:
        fields = _extract_intermediary_mapping_fields(mapping)
        _validate_required_intermediary_mapping_fields(fields, mapping)

        result = MappingService(db).upsert_mapping(
            intermediary=fields["intermediary"],
            email=fields["email"],
            postal_code=fields["postal_code"],
            township=fields["township"],
            form_type=fields["form_type"],
            follow_up_frequency=fields["follow_up_frequency"],
            follow_up_send_time=fields["follow_up_send_time"],
        )
        intermediary_id = result["intermediary_id"]
        key = result["key"]
        
        db.commit()
        log_action(db, current_user.username, "CREATE_INTERMEDIARY_MAPPING", "app_setting", resource_id=key,
                  details={
                      "intermediary_id": intermediary_id,
                      "intermediary": fields["intermediary"],
                      "postal_code": fields["postal_code"],
                      "township": fields["township"],
                      "form_type": fields["form_type"],
                  })
        
        return {"success": True, "message": "Intermediary mapping created", "intermediary_id": intermediary_id}
    except HTTPException:
        db.rollback()
        raise
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/intermediary-mapping")
def get_intermediary_mappings(
    db: Session = Depends(get_db),
    _: Any = Depends(get_current_user)
):
    """Get all intermediary-to-email mappings"""
    try:
        mappings = MappingService(db).list_mappings()
        changed = False
        for data in mappings:
            if not data.get("intermediary_id"):
                data["intermediary_id"] = _generate_intermediary_id()
                changed = True

        if changed:
            for item in mappings:
                try:
                    MappingService(db).upsert_mapping(
                        intermediary=item.get("intermediary", ""),
                        email=item.get("email", ""),
                        intermediary_id=item.get("intermediary_id"),
                        postal_code=item.get("postal_code"),
                        township=item.get("township"),
                        form_type=item.get("form_type"),
                        follow_up_frequency=item.get("follow_up_frequency") or "weekly",
                        follow_up_send_time=item.get("follow_up_send_time") or "09:00",
                    )
                except Exception:
                    continue
            db.commit()

        return mappings
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/intermediary-mapping/{mapping_key}")
def update_intermediary_mapping(
    mapping_key: str,
    mapping: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("can_manage_dropdowns"))
):
    """Update an existing intermediary mapping by key"""
    try:
        if not mapping_key.startswith("intermediary_mapping_"):
            raise HTTPException(status_code=400, detail="Invalid mapping key")

        row = db.query(AppSetting).filter(AppSetting.key == mapping_key).first()
        if not row:
            raise HTTPException(status_code=404, detail="Mapping not found")

        fields = _extract_intermediary_mapping_fields(mapping)
        _validate_required_intermediary_mapping_fields(fields, mapping)

        existing_data = {}
        try:
            existing_data = json.loads(row.value or "{}")
        except Exception:
            existing_data = {}

        result = MappingService(db).upsert_mapping(
            intermediary=fields["intermediary"],
            email=fields["email"],
            intermediary_id=existing_data.get("intermediary_id") or _generate_intermediary_id(),
            postal_code=fields["postal_code"],
            township=fields["township"],
            form_type=fields["form_type"],
            follow_up_frequency=fields["follow_up_frequency"],
            follow_up_send_time=fields["follow_up_send_time"],
        )
        new_key = result["key"]
        if new_key != mapping_key:
            stale_row = db.query(AppSetting).filter(AppSetting.key == mapping_key).first()
            if stale_row:
                db.delete(stale_row)

        db.commit()
        log_action(
            db,
            current_user.username,
            "UPDATE_INTERMEDIARY_MAPPING",
            "app_setting",
            resource_id=new_key,
            details={"old_key": mapping_key, "new_key": new_key}
        )
        return {"success": True, "key": new_key}
    except HTTPException:
        db.rollback()
        raise
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/intermediary-mapping/{mapping_key}")
def delete_intermediary_mapping(
    mapping_key: str,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("can_manage_dropdowns"))
):
    """Delete an intermediary mapping by key"""
    try:
        if not mapping_key.startswith("intermediary_mapping_"):
            raise HTTPException(status_code=400, detail="Invalid mapping key")

        row = db.query(AppSetting).filter(AppSetting.key == mapping_key).first()
        if not row:
            raise HTTPException(status_code=404, detail="Mapping not found")

        db.delete(row)
        db.commit()
        log_action(
            db,
            current_user.username,
            "DELETE_INTERMEDIARY_MAPPING",
            "app_setting",
            resource_id=mapping_key
        )
        return {"success": True}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/referrals/{rid}/follow-up-toggle")
def update_referral_follow_up_toggle(
    rid: str,
    body: FollowUpToggleUpdate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("can_edit_referral"))
):
    ref = db.query(Referral).filter(Referral.id == rid).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Referral not found")
    ref.include_in_follow_up = bool(body.include_in_follow_up)
    ref.updated_at = datetime.utcnow()
    db.commit()
    log_action(
        db,
        current_user.username,
        "UPDATE_FOLLOW_UP_TOGGLE",
        "referral",
        resource_id=rid,
        details={"include_in_follow_up": ref.include_in_follow_up}
    )
    return {"success": True, "id": rid, "include_in_follow_up": ref.include_in_follow_up}

@app.get("/api/follow-up/preview")
def preview_follow_up_emails(
    intermediary: Optional[str] = None,
    db: Session = Depends(get_db),
    _: Any = Depends(require_permission("can_send_emails"))
):
    return _send_follow_up_groups(db, triggered_by="preview", send_email=False, intermediary=intermediary)

@app.post("/api/follow-up/send")
def send_follow_up_emails_now(
    intermediary: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("can_send_emails"))
):
    result = _send_follow_up_groups(db, triggered_by=current_user.username, send_email=True, intermediary=intermediary)
    log_action(
        db,
        current_user.username,
        "RUN_FOLLOW_UP_DISPATCH",
        "follow_up",
        details={"sent_groups": result.get("sent_groups", 0), "skipped": result.get("skipped", [])}
    )
    return {"success": True, **result}

@app.post("/api/referral/{referral_id}/send-email")
def send_referral_email(
    referral_id: str,
    request: EmailSendRequest,
    db: Session = Depends(get_db),
    current_user: Any = Depends(require_permission("can_send_emails"))
):
    """Send referral PDF to intermediary via email (IDOA referrals only)"""
    try:
        # Get referral
        referral = db.query(Referral).filter(Referral.id == referral_id).first()
        if not referral:
            raise HTTPException(status_code=404, detail="Referral not found")
        
        # Check if only IDOA referrals can be emailed
        referral_type = referral.referral_type or ""
        client_type = referral.client_type or ""
        if "IDOA" not in referral_type.upper() and "IDOA" not in client_type.upper():
            raise HTTPException(status_code=400, detail="Only IDOA referrals can be emailed")
        
        orchestration_service = ReferralEmailService(db)
        
        # Get intermediary email from mapping when available.
        intermediary_email = orchestration_service.resolve_recipient(
            intermediary=referral.intermediary or "",
            postal_code=referral.postal_code or "",
            township=referral.pay_rate_municipality or "",
            form_type=referral.referral_type or "",
        )
        
        # Get comment templates for PDF generation
        comment_templates = _get_comment_templates(db, active_only=True)
        
        # Generate PDF (or use preview-generated PDF sent by frontend)
        if (request.preview_pdf_base64 or "").strip():
            try:
                import base64
                pdf_content = base64.b64decode(request.preview_pdf_base64, validate=True)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid preview PDF payload: {str(e)}")
        else:
            try:
                pdf_content = orchestration_service.build_pdf_bytes(referral, request.pdf_fields or [], comment_templates=comment_templates)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"PDF generation error: {str(e)}")
        
        # Generate email subject and body from configurable templates
        template_settings = _get_email_template_settings(db)
        include_sender_account = bool(template_settings.get("include_sender_account", True))
        include_referral_contact = bool(template_settings.get("include_referral_contact", True))
        sender_cc = current_user.email if include_sender_account else None
        referral_contact_cc = referral.contact_email if include_referral_contact else None
        cc_emails = orchestration_service.build_cc_list(sender_cc, referral_contact_cc)
        subject = _render_email_template(template_settings["subject_template"], referral, intermediary_email)
        body = _render_email_template(template_settings["body_template"], referral, intermediary_email)

        template_to_raw = _render_email_template(template_settings.get("to", ""), referral, intermediary_email)
        template_cc_raw = _render_email_template(template_settings.get("cc", ""), referral, intermediary_email)
        template_to_list = _parse_email_list(template_to_raw)
        template_cc_list = _parse_email_list(template_cc_raw)
        primary_recipients: List[str] = []
        for email in template_to_list:
            if email and email not in primary_recipients:
                primary_recipients.append(email)

        if include_referral_contact and referral.contact_email and referral.contact_email not in primary_recipients:
            primary_recipients.append(referral.contact_email)
        if include_sender_account and current_user.email and current_user.email not in primary_recipients:
            primary_recipients.append(current_user.email)

        to_email = primary_recipients[0] if primary_recipients else ""
        if not to_email:
            missing_intermediary = not template_to_list and not intermediary_email
            if missing_intermediary:
                raise HTTPException(
                    status_code=400,
                    detail="Template TO is blank and no intermediary email is mapped. Enable Referral Contact Email or Sender Account Email, or configure Template TO."
                )
            raise HTTPException(
                status_code=400,
                detail="Template TO can be blank only when Referral Contact Email or Sender Account Email is enabled"
            )
        
        # Send email
        for extra_to in primary_recipients[1:]:
            if extra_to not in cc_emails:
                cc_emails.append(extra_to)
        for template_cc in template_cc_list:
            if template_cc not in cc_emails:
                cc_emails.append(template_cc)

        email_result = orchestration_service.send_with_attachment(
            to_email=to_email,
            subject=subject,
            body=body,
            pdf_content=pdf_content,
            pdf_filename=(request.preview_pdf_filename or f"Referral_{referral.id}.pdf"),
            cc_emails=cc_emails
        )
        
        if not email_result["success"]:
            raise HTTPException(status_code=500, detail=email_result.get("error", "Email send failed"))
        
        # Update referral with email tracking
        referral.email_sent_date = datetime.utcnow()
        referral.email_recipient = to_email
        referral.submitted_to_intermediary_date = datetime.utcnow().strftime("%Y-%m-%d")
        
        # Add to email history
        email_record = {
            "sent_at": datetime.utcnow().isoformat(),
            "recipient": to_email,
            "cc_recipients": cc_emails,
            "sent_by": current_user.username,
            "status": "sent"
        }
        
        try:
            history = json.loads(referral.email_history or "[]")
        except:
            history = []
        
        history.append(email_record)
        referral.email_history = json.dumps(history)
        
        db.commit()
        
        log_action(db, current_user.username, "SEND_REFERRAL_EMAIL", "referral", referral_id,
                  details={"recipient": to_email, "cc": cc_emails})
        
        return {
            "success": True,
            "message": f"Email sent to {to_email}",
            "email_result": email_result
        }
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/referral/{referral_id}/email-history")
def get_email_history(
    referral_id: str,
    db: Session = Depends(get_db),
    _: Any = Depends(get_current_user)
):
    """Get email send history for a referral"""
    try:
        referral = db.query(Referral).filter(Referral.id == referral_id).first()
        if not referral:
            raise HTTPException(status_code=404, detail="Referral not found")
        
        try:
            history = json.loads(referral.email_history or "[]")
        except:
            history = []
        
        return {
            "referral_id": referral_id,
            "email_sent_date": referral.email_sent_date.isoformat() if referral.email_sent_date else None,
            "email_recipient": referral.email_recipient,
            "history": history
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db), _: Any = Depends(get_current_user)):
    refs = db.query(Referral).filter(Referral.is_archived == False).all()
    total = len(refs)
    status_dist = {}
    services_pop = {}
    scheduled = completed = 0
    conv_days = []
    for r in refs:
        s = r.status or "New"
        status_dist[s] = status_dist.get(s, 0) + 1
        if s == "Scheduled": scheduled += 1
        if s == "Completed": completed += 1
        try:
            for svc in json.loads(r.services_required or "[]"):
                services_pop[svc] = services_pop.get(svc, 0) + 1
        except: pass
        if r.start_of_care and r.referral_date:
            try:
                for fmt in ["%m/%d/%Y", "%Y-%m-%d"]:
                    try:
                        d1 = datetime.strptime(r.referral_date, fmt)
                        d2 = datetime.strptime(r.start_of_care, fmt)
                        conv_days.append((d2 - d1).days)
                        break
                    except: pass
            except: pass
    active = sum(1 for r in refs if r.status not in ["Completed", "Closed"])
    closed = status_dist.get("Closed", 0)
    conv_rate = round(completed / total * 100) if total else 0
    avg_days = round(sum(conv_days) / len(conv_days)) if conv_days else None
    return {
        "totalReferrals": total, "activeReferrals": active,
        "completed": completed, "closed": closed,
        "conversionRate": conv_rate, "avgConversionDays": avg_days,
        "statusDistribution": status_dist,
        "servicesPopularity": dict(sorted(services_pop.items(), key=lambda x: -x[1])[:8]),
        "scheduledVsCompleted": {"scheduled": scheduled, "completed": completed}
    }

# ─── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    init_db()
    scheduler = threading.Thread(target=_follow_up_scheduler_loop, daemon=True)
    scheduler.start()
    print("CareReferral API started - http://localhost:8000")
    print("Admin: username=admin  password=admin123")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

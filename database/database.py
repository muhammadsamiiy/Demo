from backend.app.core.shared_imports import (
    CryptContext,
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    declarative_base,
    datetime,
    get_logging_symbols,
    get_settings_symbol,
    inspect,
    json,
    sessionmaker,
    sql_text,
)

settings = get_settings_symbol()
_, get_logger = get_logging_symbols()

logger = get_logger(__name__)

DATABASE_URL = settings.database_url
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def utcnow_ms():
    now = datetime.utcnow()
    return now.replace(microsecond=(now.microsecond // 1000) * 1000)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    full_name = Column(String)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="staff")  # admin, manager, staff
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow_ms)
    # Permissions (for fine-grained control)
    can_create_referral = Column(Boolean, default=True)
    can_edit_referral = Column(Boolean, default=True)
    can_delete_referral = Column(Boolean, default=False)
    can_export = Column(Boolean, default=True)
    can_manage_users = Column(Boolean, default=False)
    can_manage_dropdowns = Column(Boolean, default=False)
    can_archive = Column(Boolean, default=False)
    can_send_emails = Column(Boolean, default=False)  # Permission to email referrals

class DropdownOption(Base):
    __tablename__ = "dropdown_options"
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, nullable=False)  # e.g. "services", "referral_source", "status"
    value = Column(String, nullable=False)
    label = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow_ms)

class Referral(Base):
    __tablename__ = "referrals"
    id = Column(String, primary_key=True)
    # Patient
    first_name = Column(String)
    last_name = Column(String)
    dob = Column(String)
    gender = Column(String)
    veteran_status = Column(String)
    ssn_last = Column(String)
    medicaid_last = Column(String)
    # Address
    address_line1 = Column(String)
    address_line2 = Column(String)
    city = Column(String)
    state = Column(String)
    postal_code = Column(String)
    township = Column(String)
    # Referral Details
    referral_date = Column(String)
    referral_source = Column(String)
    referral_type = Column(String)
    intermediary = Column(String)
    branch = Column(String)
    marketer = Column(String)
    start_of_care = Column(String)
    pay_rate_municipality = Column(String)
    client_type = Column(String)
    desired_caregiver = Column(String)
    services_required = Column(Text)
    assigned_to = Column(String)
    status = Column(String, default="New")
    # Home Visit
    home_visit_scheduled_date = Column(String)
    home_visit_time = Column(String)
    home_visit_completed_date = Column(String)
    home_visit_status = Column(String)
    # Stage Dates
    intake_date = Column(String)
    outreach_date = Column(String)
    checklist_review_date = Column(String)
    home_visit_date = Column(String)
    submitted_to_intermediary_date = Column(String)
    intermediary_assessment_date = Column(String)
    intermediary_feedback = Column(Text)
    contract_received_date = Column(String)
    closed_date = Column(String)
    closure_reason = Column(String)
    status_category = Column(String)
    ready_for_assessment = Column(String)
    # Email Tracking
    email_sent_date = Column(DateTime, nullable=True)  # When PDF was emailed to intermediary
    email_recipient = Column(String, nullable=True)    # Intermediary email address
    email_history = Column(Text)                        # JSON array of email send records
    include_in_follow_up = Column(Boolean, default=True)
    last_follow_up_sent_date = Column(DateTime, nullable=True)
    # Contact
    contact_name = Column(String)
    contact_phone = Column(String)
    contact_email = Column(String)
    contact_relationship = Column(String)
    contact_phone2 = Column(String)
    # Meta
    comments_timeline = Column(Text)  # JSON array
    checklists = Column(Text)         # JSON object
    validation_errors = Column(Text)  # JSON array
    is_archived = Column(Boolean, default=False)
    archive_reason = Column(String)
    archive_restore_note = Column(String)
    archived_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow_ms)
    updated_at = Column(DateTime, default=utcnow_ms, onupdate=utcnow_ms)
    created_by = Column(String)

class Log(Base):
    __tablename__ = "logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=utcnow_ms)
    user = Column(String)  # username who performed the action
    action = Column(String)  # e.g., "CREATE_REFERRAL", "UPDATE_REFERRAL", "LOGIN", etc.
    resource_type = Column(String)  # e.g., "referral", "user", "dropdown"
    resource_id = Column(String)  # ID of the resource affected
    details = Column(Text)  # JSON string with additional details
    ip_address = Column(String)
    user_agent = Column(String)

class AppSetting(Base):
    __tablename__ = "app_settings"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=utcnow_ms, onupdate=utcnow_ms)

class WorkflowStage(Base):
    """Workflow stages for referral processing"""
    __tablename__ = "workflow_stages"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False)  # e.g., "intake", "ready_for_assessment"
    label = Column(String, nullable=False)  # e.g., "Intake", "Ready for Assessment"
    description = Column(String)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow_ms)
    updated_at = Column(DateTime, default=utcnow_ms, onupdate=utcnow_ms)

class StageCommentMapping(Base):
    """Links comment types with workflow stages"""
    __tablename__ = "stage_comment_mappings"
    id = Column(Integer, primary_key=True, index=True)
    stage_key = Column(String, nullable=False)  # References WorkflowStage.key
    comment_type_key = Column(String, nullable=False)  # e.g., "outreach", "follow_up"
    description = Column(String)  # Why this comment maps to this stage
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow_ms)
    updated_at = Column(DateTime, default=utcnow_ms, onupdate=utcnow_ms)

def init_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # Migrate: Add desired_caregiver/home_visit_time columns if missing
    inspector = inspect(engine)
    columns = [c['name'] for c in inspector.get_columns('referrals')]
    if 'desired_caregiver' not in columns:
        try:
            with engine.connect() as conn:
                conn.execute(sql_text('ALTER TABLE referrals ADD COLUMN desired_caregiver VARCHAR'))
                conn.commit()
            logger.info("Added desired_caregiver column to referrals table")
        except Exception as e:
            logger.info("Could not add desired_caregiver column: %s", e)

    if 'home_visit_time' not in columns:
        try:
            with engine.connect() as conn:
                conn.execute(sql_text('ALTER TABLE referrals ADD COLUMN home_visit_time VARCHAR'))
                conn.commit()
            logger.info("Added home_visit_time column to referrals table")
        except Exception as e:
            logger.info("Could not add home_visit_time column: %s", e)
    
    # Seed admin user
    pwd = CryptContext(schemes=["bcrypt"])
    if not db.query(User).filter(User.username == "admin").first():
        admin = User(
            username="admin", email="admin@carereferral.com", full_name="Administrator",
            hashed_password=pwd.hash("admin123"), role="admin",
            can_create_referral=True, can_edit_referral=True, can_delete_referral=True,
            can_export=True, can_manage_users=True, can_manage_dropdowns=True, can_archive=True
        )
        db.add(admin)
    # Seed dropdown options
    defaults = {
        "services": ["Physical Therapy","Occupational Therapy","Speech Therapy","Skilled Nursing",
                     "Personal Care","Homemaker","Companion","IOMA","Shopping","Laundry",
                     "Meal Preparation","Light Housekeeping","Transportation","Medical Social Services"],
        "referral_source": ["Hospital Discharge","Physician Referral","Family","Self"],
        "gender": ["Male","Female","Non-binary"],
        "veteran_status": ["Unknown","Yes","No"],
        "client_type": ["IDOA","DORS","VA","Private"],
        "relationship": ["Child","Spouse","Sibling","Parent","Friend"],
        "status": ["New","Referral Sent","Scheduled","Assessment Pending","Completed","Closed"],
        "archive_reason": ["Already with another agency","Ineligible","Deceased","Not Interested","Unable to contact"],
        "home_visit_status": ["Pending","Scheduled","Completed","Cancelled"],
        "branch": ["Applied Home Health Network"],
        "marketer": ["John Smith","Jane Doe","Mike Johnson","Sarah Wilson"],
    }
    for cat, values in defaults.items():
        for i, val in enumerate(values):
            if not db.query(DropdownOption).filter_by(category=cat, value=val).first():
                db.add(DropdownOption(category=cat, value=val, label=val, sort_order=i))
    
    # Seed workflow stages
    workflow_stages = [
        {"key": "intake", "label": "Intake", "description": "Initial referral intake", "sort_order": 0},
        {"key": "ready_for_assessment", "label": "Ready for Assessment", "description": "Ready for intermediary assessment", "sort_order": 1},
        {"key": "home_visit", "label": "Home Visit", "description": "Home visit scheduled or completed", "sort_order": 2},
        {"key": "assessment", "label": "Assessment", "description": "Assessment in progress", "sort_order": 3},
        {"key": "submitted_to_intermediary", "label": "Submitted to Intermediary", "description": "Referral submitted to intermediary", "sort_order": 4},
        {"key": "contract_received", "label": "Contract Received", "description": "Contract received from intermediary", "sort_order": 5},
        {"key": "closed", "label": "Closed", "description": "Referral closed", "sort_order": 6},
    ]
    for stage_data in workflow_stages:
        if not db.query(WorkflowStage).filter_by(key=stage_data["key"]).first():
            db.add(WorkflowStage(**stage_data, is_active=True))
    
    # Seed stage-comment mappings
    stage_mappings = [
        {"stage_key": "intake", "comment_type_key": "outreach", "description": "Outreach during intake", "sort_order": 0},
        {"stage_key": "ready_for_assessment", "comment_type_key": "assessment", "description": "Assessment preparation", "sort_order": 0},
        {"stage_key": "home_visit", "comment_type_key": "scheduling", "description": "Home visit scheduling", "sort_order": 0},
        {"stage_key": "assessment", "comment_type_key": "assessment", "description": "Assessment notes", "sort_order": 0},
        {"stage_key": "submitted_to_intermediary", "comment_type_key": "documentation", "description": "Documentation submission", "sort_order": 0},
    ]
    for mapping_data in stage_mappings:
        existing = db.query(StageCommentMapping).filter_by(stage_key=mapping_data["stage_key"], comment_type_key=mapping_data["comment_type_key"]).first()
        if not existing:
            db.add(StageCommentMapping(**mapping_data, is_active=True))
    
    db.commit()
    db.close()

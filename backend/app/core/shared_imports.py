# Standard library imports
import csv
import io
import json
import logging
import os
import pathlib
import re
import shutil
import smtplib
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from io import BytesIO
from logging.config import dictConfig
from typing import Any, Dict, List, Optional

# Third-party imports
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
import uvicorn
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    inspect,
    or_,
)
from sqlalchemy import text as sql_text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, relationship, sessionmaker


# Internal project imports (lazy getters to avoid circular imports)
def get_settings_symbol():
    from backend.app.core.config import settings

    return settings


def get_logging_symbols():
    from backend.app.core.logging_config import configure_logging, get_logger

    return configure_logging, get_logger


def get_database_symbols():
    from database.database import (
        AppSetting,
        DropdownOption,
        Log,
        Referral,
        SessionLocal,
        StageCommentMapping,
        User,
        WorkflowStage,
        get_db,
        init_db,
    )

    return (
        get_db,
        User,
        DropdownOption,
        Referral,
        Log,
        AppSetting,
        WorkflowStage,
        StageCommentMapping,
        init_db,
        SessionLocal,
    )


def get_database_engine():
    from database.database import engine

    return engine


def get_pdf_symbols():
    from database.pdf_gen import generate_referral_pdf, get_available_pdf_fields

    return generate_referral_pdf, get_available_pdf_fields


def get_auth_symbols():
    from backend.app.core.auth import (
        create_token,
        get_current_user,
        hash_password,
        require_permission,
        verify_password,
    )

    return verify_password, hash_password, create_token, get_current_user, require_permission


def get_service_symbols():
    from backend.app.services.comment_service import normalize_comments_timeline
    from backend.app.services.email_service import EmailService, get_email_service
    from backend.app.services.mapping_service import MappingService
    from backend.app.services.referral_email_service import ReferralEmailService

    return (
        MappingService,
        normalize_comments_timeline,
        ReferralEmailService,
        get_email_service,
        EmailService,
    )


def get_mapping_service_symbol():
    from backend.app.services.mapping_service import MappingService

    return MappingService


def get_comment_service_symbol():
    from backend.app.services.comment_service import normalize_comments_timeline

    return normalize_comments_timeline


def get_referral_email_service_symbol():
    from backend.app.services.referral_email_service import ReferralEmailService

    return ReferralEmailService


def get_email_service_symbols():
    from backend.app.services.email_service import EmailService, get_email_service

    return get_email_service, EmailService


def get_repository_symbols():
    from backend.app.repositories.app_settings_repository import AppSettingsRepository
    from backend.app.repositories.intermediary_mapping_repository import (
        IntermediaryMappingRepository,
    )

    return AppSettingsRepository, IntermediaryMappingRepository

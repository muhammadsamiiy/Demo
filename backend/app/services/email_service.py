from backend.app.core.shared_imports import (
    Dict,
    List,
    MIMEBase,
    MIMEMultipart,
    MIMEText,
    Optional,
    Session,
    datetime,
    encoders,
    get_database_symbols,
    get_logging_symbols,
    get_mapping_service_symbol,
    os,
    smtplib,
)

_, _, _, _, _, AppSetting, _, _, _, _ = get_database_symbols()
_, get_logger = get_logging_symbols()
MappingService = get_mapping_service_symbol()

logger = get_logger(__name__)


class EmailService:
    def __init__(self, db: Session):
        self.db = db
        self.load_settings()

    def load_settings(self):
        try:
            smtp_host = self.db.query(AppSetting).filter(AppSetting.key == "email_smtp_host").first()
            smtp_port = self.db.query(AppSetting).filter(AppSetting.key == "email_smtp_port").first()
            smtp_user = self.db.query(AppSetting).filter(AppSetting.key == "email_smtp_user").first()
            smtp_pass = self.db.query(AppSetting).filter(AppSetting.key == "email_smtp_password").first()
            from_email = self.db.query(AppSetting).filter(AppSetting.key == "email_from_address").first()
            additional_cc = self.db.query(AppSetting).filter(AppSetting.key == "email_additional_cc").first()

            self.smtp_host = smtp_host.value if smtp_host else os.getenv("SMTP_HOST", "smtp.gmail.com")
            self.smtp_port = int(smtp_port.value) if smtp_port else int(os.getenv("SMTP_PORT", 587))
            self.smtp_user = smtp_user.value if smtp_user else os.getenv("SMTP_USER", "")
            self.smtp_password = smtp_pass.value if smtp_pass else os.getenv("SMTP_PASSWORD", "")
            self.from_email = from_email.value if from_email else os.getenv("EMAIL_FROM", self.smtp_user)
            self.additional_cc_email = additional_cc.value if additional_cc else os.getenv("EMAIL_ADDITIONAL_CC", "")
        except Exception as e:
            logger.exception("Error loading email settings: %s", e)
            self.smtp_host = "smtp.gmail.com"
            self.smtp_port = 587
            self.smtp_user = ""
            self.smtp_password = ""
            self.from_email = ""
            self.additional_cc_email = ""

    def send_referral_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        pdf_content: bytes,
        pdf_filename: str,
        cc_emails: List[str] = None,
    ) -> Dict[str, any]:
        try:
            if not self.smtp_user or not self.smtp_password:
                return {"success": False, "error": "Email service not configured. Contact administrator."}

            message = MIMEMultipart()
            message["From"] = self.from_email
            message["To"] = to_email

            all_cc = cc_emails or []
            if self.additional_cc_email and self.additional_cc_email != to_email:
                if self.additional_cc_email not in all_cc:
                    all_cc.append(self.additional_cc_email)
            if all_cc:
                message["Cc"] = ", ".join(all_cc)

            message["Subject"] = subject
            message["Date"] = datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S +0000")
            message.attach(MIMEText(body, "html"))

            part = MIMEBase("application", "octet-stream")
            part.set_payload(pdf_content)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", f"attachment; filename= {pdf_filename}")
            message.attach(part)

            server = smtplib.SMTP(self.smtp_host, self.smtp_port)
            server.starttls()
            server.login(self.smtp_user, self.smtp_password)
            recipients = [to_email] + all_cc
            server.sendmail(self.from_email, recipients, message.as_string())
            server.quit()

            return {
                "success": True,
                "message": f"Email sent successfully to {to_email}",
                "recipients": recipients,
                "timestamp": datetime.utcnow().isoformat(),
            }
        except smtplib.SMTPAuthenticationError:
            return {"success": False, "error": "SMTP authentication failed. Check email credentials."}
        except smtplib.SMTPException as e:
            return {"success": False, "error": f"SMTP error: {str(e)}"}
        except Exception as e:
            return {"success": False, "error": f"Email error: {str(e)}"}

    def send_html_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        cc_emails: List[str] = None,
    ) -> Dict[str, any]:
        try:
            if not self.smtp_user or not self.smtp_password:
                return {"success": False, "error": "Email service not configured. Contact administrator."}

            message = MIMEMultipart()
            message["From"] = self.from_email
            message["To"] = to_email

            all_cc = cc_emails or []
            if self.additional_cc_email and self.additional_cc_email != to_email:
                if self.additional_cc_email not in all_cc:
                    all_cc.append(self.additional_cc_email)
            if all_cc:
                message["Cc"] = ", ".join(all_cc)

            message["Subject"] = subject
            message["Date"] = datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S +0000")
            message.attach(MIMEText(body, "html"))

            server = smtplib.SMTP(self.smtp_host, self.smtp_port)
            server.starttls()
            server.login(self.smtp_user, self.smtp_password)
            recipients = [to_email] + all_cc
            server.sendmail(self.from_email, recipients, message.as_string())
            server.quit()

            return {
                "success": True,
                "message": f"Email sent successfully to {to_email}",
                "recipients": recipients,
                "timestamp": datetime.utcnow().isoformat(),
            }
        except smtplib.SMTPAuthenticationError:
            return {"success": False, "error": "SMTP authentication failed. Check email credentials."}
        except smtplib.SMTPException as e:
            return {"success": False, "error": f"SMTP error: {str(e)}"}
        except Exception as e:
            return {"success": False, "error": f"Email error: {str(e)}"}

    def get_intermediary_email(
        self,
        postal_code: str,
        intermediary: str,
        township: Optional[str] = None,
        form_type: Optional[str] = None,
    ) -> Optional[str]:
        try:
            mapping_service = MappingService(self.db)
            return mapping_service.resolve_intermediary_email(
                intermediary=intermediary,
                postal_code=postal_code,
                township=township,
                form_type=form_type,
            )
        except Exception as e:
            logger.exception("Error getting intermediary email: %s", e)
            return None


def get_email_service(db: Session) -> EmailService:
    return EmailService(db)

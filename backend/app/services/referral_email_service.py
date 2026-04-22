from backend.app.core.shared_imports import (
    Dict,
    List,
    Optional,
    Session,
    get_email_service_symbols,
    get_mapping_service_symbol,
    get_pdf_symbols,
)

MappingService = get_mapping_service_symbol()
get_email_service, _ = get_email_service_symbols()
generate_referral_pdf, _ = get_pdf_symbols()


class ReferralEmailService:
    def __init__(self, db: Session):
        self.db = db
        self.mapping_service = MappingService(db)
        self.email_service = get_email_service(db)

    def resolve_recipient(
        self,
        intermediary: str,
        postal_code: Optional[str] = None,
        township: Optional[str] = None,
        form_type: Optional[str] = None,
    ) -> Optional[str]:
        return self.mapping_service.resolve_intermediary_email(
            intermediary=intermediary,
            postal_code=postal_code,
            township=township,
            form_type=form_type,
        )

    def build_cc_list(
        self,
        user_email: Optional[str],
        contact_email: Optional[str],
    ) -> List[str]:
        cc: List[str] = []
        for email in [user_email, contact_email]:
            if email and email.strip() and email.strip() not in cc:
                cc.append(email.strip())
        return cc

    def build_pdf_bytes(self, referral, selected_fields: Optional[List[str]] = None, comment_templates: Optional[List[dict]] = None) -> bytes:
        pdf_output = generate_referral_pdf(referral, selected_fields or [], comment_templates=comment_templates)
        if isinstance(pdf_output, (bytes, bytearray)):
            return bytes(pdf_output)
        get_value = getattr(pdf_output, "getvalue", None)
        if callable(get_value):
            return get_value()
        raise ValueError("Unsupported PDF output type")

    def send_with_attachment(
        self,
        to_email: str,
        subject: str,
        body: str,
        pdf_content: bytes,
        pdf_filename: str,
        cc_emails: List[str],
    ) -> Dict:
        return self.email_service.send_referral_email(
            to_email=to_email,
            subject=subject,
            body=body,
            pdf_content=pdf_content,
            pdf_filename=pdf_filename,
            cc_emails=cc_emails,
        )

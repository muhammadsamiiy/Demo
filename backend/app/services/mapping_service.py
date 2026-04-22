from backend.app.core.shared_imports import Optional, Session, get_repository_symbols, re, uuid

_, IntermediaryMappingRepository = get_repository_symbols()


class MappingService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = IntermediaryMappingRepository(db)

    @staticmethod
    def _validate_email(email: str) -> bool:
        return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", (email or "").strip()))

    @staticmethod
    def _new_intermediary_id() -> str:
        return f"INT-{uuid.uuid4().hex[:8].upper()}"

    def upsert_mapping(
        self,
        intermediary: str,
        email: str,
        intermediary_id: Optional[str] = None,
        postal_code: Optional[str] = None,
        township: Optional[str] = None,
        form_type: Optional[str] = None,
        follow_up_frequency: Optional[str] = None,
        follow_up_send_time: Optional[str] = None,
    ) -> dict:
        if not intermediary or not intermediary.strip():
            raise ValueError("Intermediary is required")
        if not self._validate_email(email):
            raise ValueError("Invalid email address")

        mapping_id = intermediary_id or self._new_intermediary_id()
        key = self.repo.upsert_mapping(
            intermediary_id=mapping_id,
            intermediary=intermediary.strip(),
            email=email.strip(),
            postal_code=(postal_code or "").strip() or None,
            township=(township or "").strip() or None,
            form_type=(form_type or "").strip() or None,
            follow_up_frequency=(follow_up_frequency or "weekly").strip().lower() or "weekly",
            follow_up_send_time=(follow_up_send_time or "09:00").strip() or "09:00",
        )
        return {"intermediary_id": mapping_id, "key": key}

    def resolve_intermediary_email(
        self,
        intermediary: str,
        postal_code: Optional[str] = None,
        township: Optional[str] = None,
        form_type: Optional[str] = None,
    ) -> Optional[str]:
        return self.repo.resolve_email(
            intermediary=intermediary,
            postal_code=postal_code,
            township=township,
            form_type=form_type,
        )

    def list_mappings(self):
        return self.repo.list_mappings()

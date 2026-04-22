from backend.app.core.shared_imports import Dict, List, Optional, Session, datetime, get_database_symbols, json

_, _, _, _, _, AppSetting, _, _, _, _ = get_database_symbols()


class IntermediaryMappingRepository:
    PREFIX = "intermediary_mapping_"

    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _norm(value: Optional[str]) -> str:
        return (value or "").strip().lower()

    def _compose_criteria_key(
        self,
        postal_code: Optional[str] = None,
        township: Optional[str] = None,
        form_type: Optional[str] = None,
    ) -> str:
        postal = self._norm(postal_code)
        town = self._norm(township)
        form = self._norm(form_type)
        if not (postal and town and form):
            return ""
        return f"{self.PREFIX}criteria_{town}_{postal}_{form}"

    def _compose_legacy_key(
        self,
        intermediary: str,
        postal_code: Optional[str] = None,
        township: Optional[str] = None,
        form_type: Optional[str] = None,
    ) -> str:
        parts = [self.PREFIX + self._norm(intermediary)]
        if postal_code:
            parts.append(self._norm(postal_code))
        if township:
            parts.append(self._norm(township))
        if form_type:
            parts.append(self._norm(form_type))
        return "_".join([part for part in parts if part])

    def upsert_mapping(
        self,
        intermediary_id: str,
        intermediary: str,
        email: str,
        postal_code: Optional[str] = None,
        township: Optional[str] = None,
        form_type: Optional[str] = None,
        follow_up_frequency: Optional[str] = None,
        follow_up_send_time: Optional[str] = None,
    ) -> str:
        # Primary strategy: Township + Postal Code + Form Type = Intermediary (+ email).
        # Fallback to legacy intermediary-based keys if criteria are incomplete.
        criteria_key = self._compose_criteria_key(postal_code, township, form_type)
        key = criteria_key or self._compose_legacy_key(intermediary, postal_code, township, form_type)
        payload = {
            "intermediary_id": intermediary_id,
            "intermediary": intermediary,
            "email": email,
            "postal_code": postal_code or "",
            "township": township or "",
            "form_type": form_type or "",
            "follow_up_frequency": (follow_up_frequency or "weekly").strip().lower() or "weekly",
            "follow_up_send_time": (follow_up_send_time or "09:00").strip() or "09:00",
            "mapping_type": "criteria" if criteria_key else "legacy",
            "created_at": datetime.utcnow().isoformat(),
        }
        row = self.db.query(AppSetting).filter(AppSetting.key == key).first()
        if row:
            row.value = json.dumps(payload)
        else:
            self.db.add(AppSetting(key=key, value=json.dumps(payload)))
        return key

    def list_mappings(self) -> List[Dict]:
        rows = self.db.query(AppSetting).filter(AppSetting.key.like(f"{self.PREFIX}%")).all()
        mappings: List[Dict] = []
        for row in rows:
            try:
                payload = json.loads(row.value or "{}")
            except Exception:
                continue
            if isinstance(payload, dict):
                payload["key"] = row.key
                mappings.append(payload)
        return mappings

    def resolve_email(
        self,
        intermediary: str,
        postal_code: Optional[str] = None,
        township: Optional[str] = None,
        form_type: Optional[str] = None,
    ) -> Optional[str]:
        # First attempt strict criteria-based mapping.
        criteria_key = self._compose_criteria_key(postal_code, township, form_type)
        if criteria_key:
            row = self.db.query(AppSetting).filter(AppSetting.key == criteria_key).first()
            if row:
                try:
                    payload = json.loads(row.value or "{}")
                except Exception:
                    payload = {}
                email = str(payload.get("email") or "").strip()
                if email:
                    return email

        # Legacy fallback: most-specific to least-specific matching by intermediary.
        candidates = [
            self._compose_legacy_key(intermediary, postal_code, township, form_type),
            self._compose_legacy_key(intermediary, postal_code, township, None),
            self._compose_legacy_key(intermediary, postal_code, None, form_type),
            self._compose_legacy_key(intermediary, postal_code, None, None),
            self._compose_legacy_key(intermediary, None, township, form_type),
            self._compose_legacy_key(intermediary, None, township, None),
            self._compose_legacy_key(intermediary, None, None, form_type),
            self._compose_legacy_key(intermediary, None, None, None),
        ]
        for key in candidates:
            row = self.db.query(AppSetting).filter(AppSetting.key == key).first()
            if not row:
                continue
            try:
                payload = json.loads(row.value or "{}")
            except Exception:
                continue
            email = str(payload.get("email") or "").strip()
            if email:
                return email

        # Legacy fallback by payload search.
        intermediary_norm = (intermediary or "").strip().lower()
        for payload in self.list_mappings():
            mapped_name = str(payload.get("intermediary") or "").strip().lower()
            mapped_email = str(payload.get("email") or "").strip()
            if mapped_name == intermediary_norm and mapped_email:
                return mapped_email

        return None

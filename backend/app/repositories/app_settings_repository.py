from backend.app.core.shared_imports import Any, Dict, List, Optional, Session, get_database_symbols, json

_, _, _, _, _, AppSetting, _, _, _, _ = get_database_symbols()


class AppSettingsRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_value(self, key: str, default: str = "") -> str:
        setting = self.db.query(AppSetting).filter(AppSetting.key == key).first()
        return (setting.value if setting else default) or default

    def upsert_value(self, key: str, value: str) -> None:
        setting = self.db.query(AppSetting).filter(AppSetting.key == key).first()
        if setting:
            setting.value = value
        else:
            self.db.add(AppSetting(key=key, value=value))

    def list_json_prefix(self, prefix: str) -> List[Dict[str, Any]]:
        rows = self.db.query(AppSetting).filter(AppSetting.key.like(f"{prefix}%")).all()
        parsed: List[Dict[str, Any]] = []
        for row in rows:
            try:
                payload = json.loads(row.value or "{}")
                if isinstance(payload, dict):
                    parsed.append(payload)
            except Exception:
                continue
        return parsed

    def upsert_json(self, key: str, payload: Dict[str, Any]) -> None:
        self.upsert_value(key, json.dumps(payload))

    def get_json(self, key: str) -> Optional[Dict[str, Any]]:
        raw = self.get_value(key, "")
        if not raw:
            return None
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None

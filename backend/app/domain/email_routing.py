from backend.app.core.shared_imports import Optional, dataclass


@dataclass
class EmailRoutingCriteria:
    intermediary: str
    postal_code: Optional[str] = None
    township: Optional[str] = None
    form_type: Optional[str] = None

from backend.app.core.shared_imports import dataclass


@dataclass
class CommentTimelineEntry:
    person: str
    date: str
    type: str
    type_label: str
    template_text: str
    action: str

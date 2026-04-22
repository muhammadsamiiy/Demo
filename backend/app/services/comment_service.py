from backend.app.core.shared_imports import Any, Dict, List, Optional, datetime


def normalize_comments_timeline(comments: Any, default_user: Optional[str] = None) -> List[Dict[str, str]]:
    if not isinstance(comments, list):
        return []

    now_label = datetime.utcnow().strftime("%Y-%m-%d")
    normalized: List[Dict[str, str]] = []
    for item in comments:
        if not isinstance(item, dict):
            continue

        action = str(item.get("action") or item.get("text") or "").strip()
        comment_type = str(item.get("type") or "").strip()
        comment_type_label = str(item.get("typeLabel") or item.get("type_label") or "").strip()
        template_text = str(item.get("template_text") or item.get("templateText") or "").strip()
        person = str(item.get("person") or default_user or "System").strip()
        date = str(item.get("date") or now_label).strip()

        if not action and not comment_type and not template_text:
            continue

        normalized.append(
            {
                "person": person,
                "date": date,
                "type": comment_type,
                "typeLabel": comment_type_label,
                "template_text": template_text,
                "action": action,
            }
        )

    return normalized

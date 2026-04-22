from backend.app.core.shared_imports import List, dataclass, os


def _split_csv(value: str, default: List[str]) -> List[str]:
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "CareReferral API")
    app_version: str = os.getenv("APP_VERSION", "2.0")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./carereferral.db")
    jwt_secret: str = os.getenv("JWT_SECRET", "change-me-in-production")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_expire_hours: int = int(os.getenv("JWT_EXPIRE_HOURS", "8"))
    cors_origins: List[str] = None
    uploads_dir: str = os.getenv("UPLOADS_DIR", "uploads")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    def __post_init__(self):
        default_origins = ["*"]
        object.__setattr__(
            self,
            "cors_origins",
            _split_csv(os.getenv("CORS_ORIGINS", "*"), default_origins),
        )


settings = Settings()

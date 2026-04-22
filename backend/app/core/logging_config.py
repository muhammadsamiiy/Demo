from backend.app.core.shared_imports import dictConfig, get_settings_symbol, logging

settings = get_settings_symbol()


def configure_logging() -> None:
    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "standard": {
                    "format": "%(asctime)s %(levelname)s [%(name)s] %(message)s",
                }
            },
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "formatter": "standard",
                }
            },
            "root": {
                "handlers": ["default"],
                "level": settings.log_level,
            },
        }
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)

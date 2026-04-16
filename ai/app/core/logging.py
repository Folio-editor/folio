"""Phase 8 예정: structlog 구조화 로깅 + Loki 연동."""

import logging

from app.config import settings


def configure_logging() -> None:
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )

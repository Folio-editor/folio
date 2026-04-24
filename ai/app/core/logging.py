"""structlog 기반 구조화 로깅 설정.

- prod: JSON 출력 (Promtail/Loki 수집)
- 그 외: 사람이 읽기 좋은 컬러 콘솔 출력
- SDK 로거(httpx/anthropic/openai)는 WARNING으로 강등 — DEBUG 모드에서도
  프롬프트/응답 본문이 HTTP 레벨에서 노출되지 않도록 방어한다.
"""

import logging
import sys

import structlog

from app.config import settings


def configure_logging() -> None:
    is_prod = settings.app_env == "prod"

    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if is_prod:
        shared_processors.append(structlog.processors.format_exc_info)
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(settings.log_level)

    # SDK/라이브러리 로거 강등 (프롬프트/본문 유출 방어)
    for noisy in (
        "httpx",
        "httpcore",
        "anthropic",
        "openai",
        "urllib3",
        "uvicorn.access",
    ):
        logging.getLogger(noisy).setLevel(logging.WARNING)

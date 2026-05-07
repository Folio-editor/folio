"""애플리케이션 로깅 설정.

prod 환경에서는 structlog 기반 JSON 로깅 (Promtail/Loki 수집용)을 사용한다.
CI 등 structlog import가 실패하는 환경(구식 zope.interface + Python 3.13 조합 등)
에서는 기본 stdlib logging으로 안전하게 fallback한다.

SDK 로거(httpx/anthropic/openai)는 WARNING으로 강등하여 DEBUG 모드에서도
프롬프트/응답 본문이 HTTP 레벨에서 노출되지 않도록 방어한다.
"""

import logging
import sys

from app.config import settings

# DEBUG로 실수 활성화되어도 프롬프트/응답 본문 유출을 막기 위해 WARNING으로 고정
_NOISY_SDK_LOGGERS = (
    "httpx",
    "httpcore",
    "anthropic",
    "openai",
    "urllib3",
    # "uvicorn.access",  # TEMP: 502 디버깅을 위해 액세스 로그 임시 활성화. 디버깅 끝나면 복원할 것.
)


def _degrade_sdk_loggers() -> None:
    for name in _NOISY_SDK_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)


def _configure_basic_logging(reason: str = "") -> None:
    """structlog 사용 불가 시 fallback — 기본 텍스트 포맷."""
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
        force=True,
    )
    if reason:
        logging.getLogger(__name__).warning(
            "structlog unavailable, falling back to basic logging: %s", reason
        )
    _degrade_sdk_loggers()


def configure_logging() -> None:
    # structlog은 내부에서 twisted 모듈을 무조건 import 시도하는데,
    # 일부 CI 환경(구식 system zope.interface + Python 3.13)에서 ImportError가 아닌
    # InvalidInterface 예외가 전파되어 structlog 자체 import가 실패할 수 있다.
    # 이 경우 조용히 basic logging으로 fallback하여 앱 기동 자체는 보장한다.
    try:
        import structlog
    except Exception as e:  # noqa: BLE001 — ImportError 뿐 아니라 모든 예외 포착
        _configure_basic_logging(reason=f"{type(e).__name__}: {e}")
        return

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
        renderer = structlog.processors.JSONRenderer()
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

    _degrade_sdk_loggers()

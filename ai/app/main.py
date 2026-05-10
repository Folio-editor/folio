import logging

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from prometheus_fastapi_instrumentator import Instrumentator

from app.api.v1 import _dev_ping, drafts, extract_settings, health, pipelines, reviews, spellcheck
from app.config import settings
from app.core.logging import configure_logging
from app.middleware.auth import require_internal_api_key

configure_logging()

# Plan C 옵션 1 — prod에서 SDK 디버그 env가 켜지면 prompt/응답이 stdout으로 새어
# 나갈 수 있다. 명시적으로 차단해 fail-fast로 운영 사고를 막는다.
if settings.app_env == "prod":
    _danger_envs = ("LANGCHAIN_VERBOSE", "LANGCHAIN_DEBUG", "OPENAI_LOG", "ANTHROPIC_LOG")
    import os as _os

    _violations = [k for k in _danger_envs if _os.environ.get(k, "").strip()]
    if _violations:
        raise RuntimeError(
            "prod에서 SDK 디버그 환경변수가 설정되어 있습니다 (RAG context 유출 위험): "
            + ", ".join(_violations)
        )

app = FastAPI(title="Folio AI", version="0.1.0")

# PR5 — 클라이언트 평문 RAG 페이로드는 평균 28~40K 토큰(수십~수백 KB)이 HTTPS body로
# 들어온다. GZipMiddleware는 응답만 압축하고, 요청 압축은 ASGI/Starlette가 표준화하지
# 않아 클라이언트(Spring AiClient)와 합의된 별도 처리 경로로 처리해야 한다.
# 응답 압축은 SSE 청크와 검수 JSON에 적용되어 download bandwidth를 절감한다.
app.add_middleware(GZipMiddleware, minimum_size=1024)

# Prometheus 메트릭 — request/response 카운터·히스토그램 자동 수집.
# router 등록 전에 instrument 해야 모든 라우트가 메트릭에 포함됨.
# expose()는 사용하지 않는다 — 인증 없는 /metrics 노출을 막고 아래에서 직접
# X-Internal-Api-Key 의존성을 걸어 라우트를 등록한다.
_instrumentator = Instrumentator(
    excluded_handlers=["/metrics", "/v1/health"],
).instrument(app)


@app.get(
    "/metrics",
    include_in_schema=False,
    dependencies=[Depends(require_internal_api_key)],
)
async def metrics() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


# Plan C 옵션 1 — 라우터에서 raise된 예외가 FastAPI 기본 핸들러를 거치면
# 디버그 모드에서 stack trace가 응답 detail로 포함될 수 있고, 또한 raw exception
# 메시지가 RAG context 일부를 echo할 수 있다. 모든 미처리 예외를 마스킹한다.
_unhandled_logger = logging.getLogger("app.unhandled")


@app.exception_handler(Exception)
async def _mask_unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    # 로그에는 type만 남긴다 — message에 RAG context가 echo되어 있을 수 있다.
    _unhandled_logger.error(
        "unhandled exception path=%s method=%s errType=%s",
        request.url.path,
        request.method,
        type(exc).__name__,
    )
    return JSONResponse(status_code=500, content={"detail": "internal server error"})

# 공개 라우터
app.include_router(health.router, prefix="/v1")

# 내부(Spring ↔ FastAPI) 라우터 — 각 라우터가 X-Internal-Api-Key 의존성을 걸고 있음
app.include_router(pipelines.router, prefix="/v1")
app.include_router(drafts.router, prefix="/v1")
app.include_router(reviews.router, prefix="/v1")
app.include_router(spellcheck.router, prefix="/v1")
app.include_router(extract_settings.router, prefix="/v1")

from app.api.v1 import agent as agent_router  # noqa: E402

app.include_router(agent_router.router, prefix="/v1")

# Dev 전용
if settings.app_env != "prod":
    app.include_router(_dev_ping.router, prefix="/v1")


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "storyzip-ai", "env": settings.app_env}

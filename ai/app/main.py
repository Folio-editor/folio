from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from app.api.v1 import _dev_ping, drafts, extract_settings, health, pipelines, reviews
from app.config import settings
from app.core.logging import configure_logging

configure_logging()

app = FastAPI(title="Folio AI", version="0.1.0")

# Prometheus 메트릭 — /metrics 엔드포인트 자동 노출
# (요청 수, 응답시간 분포 p50/p95/p99, 엔드포인트별 카운트 등 자동 수집)
# router 등록 전에 instrument 해야 모든 라우트가 메트릭에 포함됨.
Instrumentator(
    excluded_handlers=["/metrics", "/v1/health"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

# 공개 라우터
app.include_router(health.router, prefix="/v1")

# 내부(Spring ↔ FastAPI) 라우터 — 각 라우터가 X-Internal-Api-Key 의존성을 걸고 있음
app.include_router(pipelines.router, prefix="/v1")
app.include_router(drafts.router, prefix="/v1")
app.include_router(reviews.router, prefix="/v1")
app.include_router(extract_settings.router, prefix="/v1")

# Dev 전용
if settings.app_env != "prod":
    app.include_router(_dev_ping.router, prefix="/v1")


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "storyzip-ai", "env": settings.app_env}

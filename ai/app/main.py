from fastapi import FastAPI

from app.api.v1 import _dev_ping, drafts, health, pipelines, reviews
from app.config import settings
from app.core.logging import configure_logging

configure_logging()

app = FastAPI(title="StoryZip AI", version="0.1.0")

# 공개 라우터
app.include_router(health.router, prefix="/v1")

# 내부(Spring ↔ FastAPI) 라우터 — 각 라우터가 X-Internal-Api-Key 의존성을 걸고 있음
app.include_router(pipelines.router, prefix="/v1")
app.include_router(drafts.router, prefix="/v1")
app.include_router(reviews.router, prefix="/v1")

# Dev 전용
if settings.app_env != "prod":
    app.include_router(_dev_ping.router, prefix="/v1")


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "storyzip-ai", "env": settings.app_env}

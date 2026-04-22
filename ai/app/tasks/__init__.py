"""Celery 태스크 패키지.

각 태스크는 `app.celery_app`에 자동 등록되도록 `celery_app.conf.include`에 경로가
포함되어 있어야 한다. Phase별로 파일을 늘려간다:

- Phase 1: _ping (배선 확인)
- Phase 2: chunk_and_embed
"""

from app.tasks._ping import ping_task  # noqa: F401

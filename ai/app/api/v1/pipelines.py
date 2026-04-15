"""Phase 2 (Day 3) 예정.

POST /v1/pipelines/episode
- Spring 5초 디바운스 후 호출
- Celery chord 등록:
    chord(
      [chunk_and_embed.s(episode_id),
       chain(generate_summary.s(episode_id), extract_items.s())],
      finalize_indexing.s(job_id),
    )
- 202 Accepted 반환
"""

from fastapi import APIRouter, Depends

from app.middleware.auth import require_internal_api_key

router = APIRouter(
    prefix="/pipelines",
    tags=["pipelines"],
    dependencies=[Depends(require_internal_api_key)],
)


# TODO(Phase 2): POST /v1/pipelines/episode 구현

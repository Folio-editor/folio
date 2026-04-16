"""Phase 6 (Day 7) 예정.

POST /v1/reviews — 설정 충돌 + 맞춤법 통합 검수 (JSON)
- 언급 엔티티 추출 (Haiku)
- MCP 툴로 언급 항목 풀 프로필, 나머지 간략 목록
- 고유명사 whitelist(character.name + world_note.name) 주입
- Sonnet JSON 출력: issue.type ∈ {setting_conflict, tone_conflict, narration_conflict, spelling}
"""

from fastapi import APIRouter, Depends

from app.middleware.auth import require_internal_api_key

router = APIRouter(
    prefix="/reviews",
    tags=["reviews"],
    dependencies=[Depends(require_internal_api_key)],
)


# TODO(Phase 6): POST /v1/reviews 구현

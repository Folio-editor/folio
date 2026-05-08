"""MCP 툴 실행 시 서버가 강제 주입하는 격리 컨텍스트."""

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class WriterContext:
    """LLM이 절대 수정할 수 없는 세션 스코프.

    모든 MCP 툴의 DB 쿼리에 `WHERE writer_id = ctx.writer_id AND work_id = ctx.work_id`
    를 강제 적용하는 데 쓴다.

    Phase 4 agent 진입 시 `thread_id` 가 채워진다 (extraction_suggestion.source_thread_id 추적용).
    기존 task 진입은 None.
    """

    writer_id: UUID
    work_id: UUID
    thread_id: UUID | None = None

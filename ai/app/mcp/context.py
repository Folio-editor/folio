"""MCP 툴 실행 시 서버가 강제 주입하는 격리 컨텍스트."""

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class WriterContext:
    """LLM이 절대 수정할 수 없는 세션 스코프.

    모든 MCP 툴의 DB 쿼리에 `WHERE writer_id = ctx.writer_id AND work_id = ctx.work_id`
    를 강제 적용하는 데 쓴다.
    """

    writer_id: UUID
    work_id: UUID

"""MCP 도구: 플롯(줄거리) 조회."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.text_extractor import extract_plain_text


def _is_ciphertext(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("v1:")


async def get_plot(session: AsyncSession, ctx: WriterContext) -> list[dict]:
    r = await session.execute(
        sa_text(
            "SELECT id, title, status, content, parent_id "
            "FROM plot "
            "WHERE work_id = :wid AND writer_id = :wr "
            "ORDER BY sort_order"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    # Plan C v1 암호문(title/content 중 하나라도 'v1:' 접두사)은
    # AI 서버가 평문을 알 수 없으므로 결과에서 제외한다.
    # status는 운영 메타데이터(예정/작성중/완료)라 평문이므로 필터에서 제외.
    return [
        {
            "id": str(row[0]),
            "title": row[1],
            "status": row[2],
            "content": extract_plain_text(row[3]),
            "parent_id": str(row[4]) if row[4] else None,
        }
        for row in r.fetchall()
        if not (_is_ciphertext(row[1]) or _is_ciphertext(row[3]))
    ]

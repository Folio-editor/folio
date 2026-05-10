"""MCP 도구: 회차 본문 한국어 맞춤법 검사 (typo / spacing / punctuation).

기존 /v1/spellcheck 엔드포인트와 동일한 Haiku 프롬프트·필터를 재사용하되,
agent flow 에서 호출 가능하도록 ctx 기반 입력 + propose_review_issue 가
받을 수 있는 형태로 issues 를 반환한다.

설정·맥락·문체 평가는 검수 도구 (track_foreshadow / character_arc / timeline_scan
+ propose_review_issue) 가 담당. 본 도구는 순수 표기 오류만.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.spellcheck import (
    SPELLCHECK_SCHEMA_HINT,
    SPELLCHECK_SYSTEM_PROMPT,
    _build_summary,
    _normalize_spellcheck_result,
)
from app.config import settings
from app.mcp.context import WriterContext
from app.mcp.tools.episode_plaintext import _decrypt_title
from app.services.decrypt_resolver import DecryptResolverError, decrypt_rows
from app.services.providers import get_llm
from app.services.spellcheck_whitelist import filter_whitelisted_issues
from app.services.text_extractor import extract_numbered_text
from app.services.work_key_resolver import (
    WorkKeyResolverError,
    resolve_episode_plaintext,
)


async def _collect_work_whitelist(
    session: AsyncSession, ctx: WriterContext
) -> set[str]:
    """작품의 character.name + world_note.name 을 평문화해서 보호 목록 구성.

    LLM 이 고유명사를 오타로 잘못 잡지 않도록. 2자 이상 이름만 등록.
    """
    rows: list[dict[str, Any]] = []
    r1 = await session.execute(
        sa_text(
            "SELECT name FROM character WHERE work_id = :wid AND writer_id = :wr"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    for row in r1.fetchall():
        if row[0]:
            rows.append({"name": row[0]})
    r2 = await session.execute(
        sa_text(
            "SELECT name FROM world_note WHERE work_id = :wid AND writer_id = :wr"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    for row in r2.fetchall():
        if row[0]:
            rows.append({"name": row[0]})
    try:
        decrypted = await decrypt_rows(ctx.work_id, rows, ["name"])
    except DecryptResolverError:
        # 복호화 실패 — 화이트리스트 없이 진행 (보수적: 고유명사 일부 false positive 감수).
        decrypted = rows
    names: set[str] = set()
    for r in decrypted:
        n = r.get("name")
        if isinstance(n, str):
            n = n.strip()
            if len(n) >= 2 and not n.startswith("v1:"):
                names.add(n)
    return names


async def check_spelling(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    sort_order: int,
) -> dict[str, Any]:
    """회차 본문 한국어 맞춤법·띄어쓰기·문장부호·오탈자 점검.

    Args:
      sort_order: 검사 대상 회차 순번

    Returns:
      ``{id, sort_order, title, issues, summary, usage}``
        - id: episode UUID — 발견 시 propose_review_issue.episode_id 인자로 사용
        - issues: ``[{type, line, original, suggestion, reason}]``
            - type: 'typo' | 'spacing' | 'punctuation'
            - line: 1-based 줄 번호 (TipTap top-level block 인덱스)
            - original / suggestion: 본문 그대로 / 교정 제안
        - summary: '띄어쓰기 3건, 오탈자 1건' 형식 한 줄 요약
    """
    # 1) 회차 식별 + plaintext fetch
    r = await session.execute(
        sa_text(
            "SELECT id, title FROM episode "
            "WHERE work_id = :wid AND writer_id = :wr AND sort_order = :so LIMIT 1"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id, "so": sort_order},
    )
    row = r.fetchone()
    if row is None:
        return {"error": "episode_not_found", "sort_order": sort_order}
    episode_id, title = row[0], row[1]
    plain_title = await _decrypt_title(ctx.work_id, title)
    try:
        content = await resolve_episode_plaintext(str(episode_id), str(ctx.work_id))
    except WorkKeyResolverError as e:
        return {"error": "no_plaintext", "reason": str(e), "sort_order": sort_order}

    numbered = extract_numbered_text(content)
    if not numbered.strip():
        return {
            "id": str(episode_id),
            "sort_order": sort_order,
            "title": plain_title,
            "issues": [],
            "summary": "본문이 비어 있음",
            "usage": {"input_tokens": 0, "output_tokens": 0},
        }

    # 2) 보호 고유명사 수집
    whitelist = await _collect_work_whitelist(session, ctx)
    whitelist_block = (
        "\n".join(f"- {name}" for name in sorted(whitelist))
        if whitelist
        else "- 없음"
    )
    user_prompt = (
        "## 보호할 고유명사\n"
        f"{whitelist_block}\n\n"
        "위 고유명사와 조사 결합형은 오류로 보고하지 마십시오.\n\n"
        "## 검사할 원고\n"
        f"{numbered}"
    )

    # 3) Haiku 호출
    llm = get_llm()
    haiku_model = getattr(llm, "_haiku_model", None) or settings.claude_haiku_model
    try:
        result = await llm.generate_json(
            system=SPELLCHECK_SYSTEM_PROMPT,
            user=user_prompt,
            schema_hint=SPELLCHECK_SCHEMA_HINT,
            model_override=haiku_model,
            max_tokens=3000,
        )
    except Exception as e:
        return {"error": "haiku_spellcheck_failed", "reason": str(e)[:200], "sort_order": sort_order}

    # 4) 정규화 + 화이트리스트 필터
    normalized = _normalize_spellcheck_result(result)
    issues = filter_whitelisted_issues(list(normalized.get("issues", [])), whitelist)
    summary = _build_summary(issues)
    usage = getattr(llm, "last_usage", {"input_tokens": 0, "output_tokens": 0})

    return {
        "id": str(episode_id),
        "sort_order": sort_order,
        "title": plain_title,
        "issues": issues,
        "summary": summary,
        "usage": usage,
    }

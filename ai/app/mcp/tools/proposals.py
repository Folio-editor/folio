"""MCP 도구: agent 의 쓰기 제안 — 모두 extraction_suggestion 에 pending 으로 INSERT.

5 도구 (entity_type 별):
- propose_character          → entity_type='character'
- propose_world_note         → entity_type='world_note'
- propose_character_update   → entity_type='character_update'
- propose_plot_revision      → entity_type='plot_revision'
- propose_episode_draft      → entity_type='episode_draft'

작가는 backend `/api/v1/agent/suggestions` 에서 승인/거절. 승인 시 backend 가
payload 를 실제 테이블 (character / world_note / plot / episode) 로 INSERT/UPDATE.

ctx.thread_id 가 채워져 있으면 source_thread_id 로 함께 기록 → agent_session 추적.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.deep_crypt import encrypt_json_strings
from app.services.encrypt_resolver import EncryptResolverError, encrypt_fields

log = logging.getLogger(__name__)

_SOURCE_AGENT = "sonnet_planner"


async def _insert_suggestion(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    entity_type: str,
    suggested_name: str,
    payload: dict[str, Any],
    episode_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    new_id = uuid.uuid4()
    # suggested_name 을 짧게 cap — v1: AES-GCM ciphertext 가 평문 길이의 ~1.5배 + IV/Tag
    # 오버헤드라, 평문 50자가 ciphertext 약 130자. 옛 schema (VARCHAR(200)) 에서도 안전.
    # DB 컬럼은 TEXT 로 마이그레이션 됐지만 dev/prod 환경별 마이그레이션 누락 대비 안전망.
    truncated_name = suggested_name[:80]

    # 암호화: payload 트리의 자유 텍스트 leaf + suggested_name 을 work_key 로 변환.
    # 구조 키 (id/field/status/gender 등) 는 deep_crypt._STRUCTURAL_KEYS 가 평문 유지.
    enc_payload: Any = payload
    enc_name = truncated_name
    try:
        enc_payload = await encrypt_json_strings(ctx.work_id, payload)
        if truncated_name:
            res = await encrypt_fields(ctx.work_id, {"_n": truncated_name})
            enc_name = res.get("_n") if isinstance(res.get("_n"), str) else truncated_name
    except EncryptResolverError as e:
        # server_encrypted_dek 미발급 등 — 평문 적재 fallback (보안 약화이나 service availability 우선).
        # 작가 측 클라가 dek 보강 후 다음 제안부터 자동 암호화.
        log.warning(
            "extraction_suggestion encrypt fail (fallback plaintext) work=%s entity=%s reason=%s",
            ctx.work_id, entity_type, e,
        )

    await session.execute(
        sa_text(
            "INSERT INTO extraction_suggestion "
            "(id, writer_id, work_id, episode_id, entity_type, suggested_name, payload, "
            " source_agent, source_thread_id, status) "
            "VALUES (:id, :wr, :wid, :ep, :et, :nm, CAST(:pl AS jsonb), :sa, :tid, 'pending')"
        ),
        {
            "id": new_id,
            "wr": ctx.writer_id,
            "wid": ctx.work_id,
            "ep": episode_id,
            "et": entity_type,
            "nm": enc_name,
            "pl": _to_jsonb(enc_payload),
            "sa": _SOURCE_AGENT,
            "tid": ctx.thread_id,
        },
    )
    # commit 은 runner 가 처리 (tool 마다 commit 하면 다른 도구의 트랜잭션이 깨진다)
    return {"suggestion_id": str(new_id), "entity_type": entity_type, "status": "pending"}


def _to_jsonb(payload: dict[str, Any]) -> str:
    import json

    return json.dumps(payload, ensure_ascii=False)


# ─────────────────────── 5 신규 쓰기 도구 ───────────────────────


async def propose_character(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    name: str,
    role: str | None = None,
    gender: str | None = None,
    age: str | None = None,
    intro: str | None = None,
) -> dict[str, Any]:
    """신규 인물 등록 제안.

    인물 서술(외형·성격 포함 모든 묘사)은 단일 ``intro`` 본문 한 단락으로 합쳐 보낸다.
    외형/성격을 별도 노트로 분리하는 것은 작가가 명시적으로 지시했을 때만
    propose_character_update(field='appearance' 등) 로 처리한다.
    """
    payload = {
        "name": name,
        "role": role,
        "gender": gender,
        "age": age,
        "intro": intro,
    }
    return await _insert_suggestion(
        session, ctx, entity_type="character", suggested_name=name, payload=payload
    )


async def propose_world_note(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    name: str,
    content: str,
    category: str | None = None,
) -> dict[str, Any]:
    payload = {"name": name, "content": content, "category": category}
    return await _insert_suggestion(
        session, ctx, entity_type="world_note", suggested_name=name, payload=payload
    )


async def propose_character_update(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    character_id: str,
    field: str,
    new_value: str,
    reason: str,
) -> dict[str, Any]:
    # character_id 격리 검증
    r = await session.execute(
        sa_text(
            "SELECT name FROM character WHERE id = :cid AND work_id = :wid AND writer_id = :wr"
        ),
        {"cid": character_id, "wid": ctx.work_id, "wr": ctx.writer_id},
    )
    row = r.fetchone()
    if row is None:
        return {"error": "character_not_found_in_work"}
    payload = {
        "character_id": character_id,
        "field": field,
        "new_value": new_value,
        "reason": reason,
    }
    return await _insert_suggestion(
        session,
        ctx,
        entity_type="character_update",
        suggested_name=row[0],
        payload=payload,
    )


async def propose_plot_create(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    title: str,
    content: str,
    status: str | None = None,
    parent_id: str | None = None,
    reason: str,
) -> dict[str, Any]:
    if parent_id:
        r = await session.execute(
            sa_text(
                "SELECT 1 FROM plot WHERE id = :pid AND work_id = :wid AND writer_id = :wr"
            ),
            {"pid": parent_id, "wid": ctx.work_id, "wr": ctx.writer_id},
        )
        if r.fetchone() is None:
            return {"error": "parent_plot_not_found_in_work"}
    payload = {
        "title": title,
        "content": content,
        "status": status,
        "parent_id": parent_id,
        "reason": reason,
    }
    return await _insert_suggestion(
        session,
        ctx,
        entity_type="plot_create",
        suggested_name=title,
        payload=payload,
    )


async def propose_plot_tree(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    root_title: str,
    root_content: str,
    children: list[dict[str, Any]],
    root_status: str | None = None,
    parent_id: str | None = None,
    reason: str,
) -> dict[str, Any]:
    """부모 챕터 + 자식 N개를 한 제안으로 묶음. 승인 1회 = 트리 일괄 INSERT.

    children 각 항목: {title, content, status?}.
    parent_id: 옵션 — 부모 챕터를 더 큰 막의 child 로 연결 시.
    """
    if not children:
        return {"error": "children_required"}
    if parent_id:
        r = await session.execute(
            sa_text(
                "SELECT 1 FROM plot WHERE id = :pid AND work_id = :wid AND writer_id = :wr"
            ),
            {"pid": parent_id, "wid": ctx.work_id, "wr": ctx.writer_id},
        )
        if r.fetchone() is None:
            return {"error": "parent_plot_not_found_in_work"}
    payload = {
        "root": {
            "title": root_title,
            "content": root_content,
            "status": root_status,
            "parent_id": parent_id,
        },
        "children": [
            {
                "title": c.get("title"),
                "content": c.get("content"),
                "status": c.get("status"),
            }
            for c in children
        ],
        "reason": reason,
    }
    return await _insert_suggestion(
        session,
        ctx,
        entity_type="plot_tree",
        suggested_name=root_title,
        payload=payload,
    )


async def propose_plot_delete(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    plot_id: str,
    reason: str,
) -> dict[str, Any]:
    r = await session.execute(
        sa_text("SELECT title FROM plot WHERE id = :pid AND work_id = :wid AND writer_id = :wr"),
        {"pid": plot_id, "wid": ctx.work_id, "wr": ctx.writer_id},
    )
    row = r.fetchone()
    if row is None:
        return {"error": "plot_not_found_in_work"}
    payload = {"plot_id": plot_id, "reason": reason}
    return await _insert_suggestion(
        session,
        ctx,
        entity_type="plot_delete",
        suggested_name=row[0] or "(plot)",
        payload=payload,
    )


async def propose_plot_revision(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    plot_id: str,
    new_outline: str,
    reason: str,
) -> dict[str, Any]:
    r = await session.execute(
        sa_text("SELECT 1 FROM plot WHERE id = :pid AND work_id = :wid AND writer_id = :wr"),
        {"pid": plot_id, "wid": ctx.work_id, "wr": ctx.writer_id},
    )
    if r.fetchone() is None:
        return {"error": "plot_not_found_in_work"}
    payload = {"plot_id": plot_id, "new_outline": new_outline, "reason": reason}
    return await _insert_suggestion(
        session,
        ctx,
        entity_type="plot_revision",
        suggested_name=f"plot:{plot_id[:8]}",
        payload=payload,
    )


async def propose_character_delete(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    character_id: str,
    reason: str,
) -> dict[str, Any]:
    r = await session.execute(
        sa_text(
            "SELECT name FROM character WHERE id = :cid AND work_id = :wid AND writer_id = :wr"
        ),
        {"cid": character_id, "wid": ctx.work_id, "wr": ctx.writer_id},
    )
    row = r.fetchone()
    if row is None:
        return {"error": "character_not_found_in_work"}
    payload = {"character_id": character_id, "reason": reason}
    return await _insert_suggestion(
        session,
        ctx,
        entity_type="character_delete",
        suggested_name=row[0],
        payload=payload,
    )


async def propose_world_note_update(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    world_note_id: str,
    name: str | None = None,
    content: str | None = None,
    reason: str,
) -> dict[str, Any]:
    if name is None and content is None:
        return {"error": "name_or_content_required"}
    r = await session.execute(
        sa_text(
            "SELECT name FROM world_note WHERE id = :nid AND work_id = :wid AND writer_id = :wr"
        ),
        {"nid": world_note_id, "wid": ctx.work_id, "wr": ctx.writer_id},
    )
    row = r.fetchone()
    if row is None:
        return {"error": "world_note_not_found_in_work"}
    payload = {
        "world_note_id": world_note_id,
        "name": name,
        "content": content,
        "reason": reason,
    }
    return await _insert_suggestion(
        session,
        ctx,
        entity_type="world_note_update",
        suggested_name=name or row[0],
        payload=payload,
    )


async def propose_world_note_delete(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    world_note_id: str,
    reason: str,
) -> dict[str, Any]:
    r = await session.execute(
        sa_text(
            "SELECT name FROM world_note WHERE id = :nid AND work_id = :wid AND writer_id = :wr"
        ),
        {"nid": world_note_id, "wid": ctx.work_id, "wr": ctx.writer_id},
    )
    row = r.fetchone()
    if row is None:
        return {"error": "world_note_not_found_in_work"}
    payload = {"world_note_id": world_note_id, "reason": reason}
    return await _insert_suggestion(
        session,
        ctx,
        entity_type="world_note_delete",
        suggested_name=row[0],
        payload=payload,
    )


async def propose_episode_update(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    episode_id: str,
    title: str | None = None,
    content: str | None = None,
    status: str | None = None,
    reason: str,
) -> dict[str, Any]:
    if title is None and content is None and status is None:
        return {"error": "title_content_or_status_required"}
    r = await session.execute(
        sa_text(
            "SELECT title FROM episode WHERE id = :eid AND work_id = :wid AND writer_id = :wr"
        ),
        {"eid": episode_id, "wid": ctx.work_id, "wr": ctx.writer_id},
    )
    row = r.fetchone()
    if row is None:
        return {"error": "episode_not_found_in_work"}
    payload = {
        "episode_id": episode_id,
        "title": title,
        "content": content,
        "status": status,
        "reason": reason,
    }
    return await _insert_suggestion(
        session,
        ctx,
        entity_type="episode_update",
        suggested_name=title or row[0],
        payload=payload,
    )


async def propose_episode_delete(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    episode_id: str,
    reason: str,
) -> dict[str, Any]:
    r = await session.execute(
        sa_text(
            "SELECT title FROM episode WHERE id = :eid AND work_id = :wid AND writer_id = :wr"
        ),
        {"eid": episode_id, "wid": ctx.work_id, "wr": ctx.writer_id},
    )
    row = r.fetchone()
    if row is None:
        return {"error": "episode_not_found_in_work"}
    payload = {"episode_id": episode_id, "reason": reason}
    return await _insert_suggestion(
        session,
        ctx,
        entity_type="episode_delete",
        suggested_name=row[0],
        payload=payload,
    )


async def propose_review_issue(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    episode_id: str,
    lines: list[int],
    severity: str,
    issue_type: str,
    description: str,
    suggestion: str | None = None,
) -> dict[str, Any]:
    """회차 검수 발견 사항 1건을 작가 승인 큐에 적재.

    propose_review_issue 는 다른 propose_* 와 다르게 승인 시 자동 적용 안 됨 — 작가가
    직접 본문을 수정한 뒤 confirmed/rejected 로 닫는 표지자 역할만 수행한다.

    Args:
      episode_id: 검수 대상 회차 id (uuid)
      lines: 본문 line 번호 (1-based, fetch_episode_plaintext(with_line_numbers=True) 의 [N] 인덱스)
      severity: 'critical' | 'warning' | 'info'
      issue_type: 'setting_conflict' | 'tone_conflict' | 'foreshadow_unresolved' |
                  'character_arc' | 'timeline' | 'other' (분류 라벨)
      description: 무엇이 문제인지 (1~3 문장)
      suggestion: 권고 수정 방향 (선택 — 다음 propose_episode_update 또는 작가 직접 수정 참고)
    """
    # episode 격리 검증
    r = await session.execute(
        sa_text(
            "SELECT title FROM episode WHERE id = :eid AND work_id = :wid AND writer_id = :wr"
        ),
        {"eid": episode_id, "wid": ctx.work_id, "wr": ctx.writer_id},
    )
    row = r.fetchone()
    if row is None:
        return {"error": "episode_not_found_in_work"}

    if severity not in ("critical", "warning", "info"):
        return {"error": "invalid_severity", "got": severity}

    payload = {
        "episode_id": episode_id,
        "lines": list(lines),
        "severity": severity,
        "type": issue_type,
        "description": description,
        "suggestion": suggestion,
    }
    return await _insert_suggestion(
        session,
        ctx,
        entity_type="review_issue",
        suggested_name=description[:200],
        payload=payload,
        episode_id=__import__("uuid").UUID(episode_id),
    )


async def propose_spelling_fix(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    episode_id: str,
    line: int,
    original: str,
    suggestion: str,
    fix_type: str,
    reason: str | None = None,
) -> dict[str, Any]:
    """회차 본문 한국어 표기 오류 1건을 자동 적용 가능한 형태로 작가 승인 큐에 적재.

    propose_review_issue 와 달리 ★ 승인 시 자동 치환 적용 ★ — backend SuggestionApplier 가
    해당 line 의 TipTap text 블록에서 original → suggestion 으로 1회 치환 후 episode 재저장.
    PowerSync 가 모든 클라이언트로 sync.

    제약:
      - 1 propose = 1 치환 (line + original + suggestion 1쌍).
      - 같은 line 에 여러 오류면 각각 propose 호출.
      - original 이 본문에 둘 이상 있으면 backend 가 첫 매치만 적용 (line 격리로 보통 안전).
      - 마크 (굵게/기울임) 가 걸친 텍스트는 backend 가 1차 단일 text 노드만 지원.
        실패 시 작가에게 'manual fix required' 응답 → 작가가 직접 수정.

    Args:
      episode_id: 대상 회차 id (uuid 36자, list_episodes / fetch_episode_plaintext / check_spelling 응답의 id)
      line: 오류 위치 line 번호 (1-based, check_spelling 결과의 line 또는 fetch_episode_plaintext(with_line_numbers=True) [N])
      original: 본문에 등장하는 정확한 문자열 (그대로 복사 — 한 글자도 빠뜨리거나 더하지 말 것)
      suggestion: 교정 후 들어갈 문자열 (original 자리를 1:1 대체)
      fix_type: 'typo' | 'spacing' | 'punctuation' (분류 라벨)
      reason: (옵션) 수정 사유 — 작가 검토 시 판단 근거
    """
    # episode 격리 검증 + updated_at fetch (race window 차단용 — 작가가 그 사이 본문 편집 시 적용 거부)
    r = await session.execute(
        sa_text(
            "SELECT title, updated_at FROM episode "
            "WHERE id = :eid AND work_id = :wid AND writer_id = :wr"
        ),
        {"eid": episode_id, "wid": ctx.work_id, "wr": ctx.writer_id},
    )
    row = r.fetchone()
    if row is None:
        return {"error": "episode_not_found_in_work"}

    if fix_type not in ("typo", "spacing", "punctuation"):
        return {"error": "invalid_fix_type", "got": fix_type}
    if not original or not suggestion:
        return {"error": "original_and_suggestion_required"}
    if original == suggestion:
        return {"error": "no_change"}
    if not isinstance(line, int) or line < 1:
        return {"error": "invalid_line"}

    payload = {
        "episode_id": episode_id,
        "line": line,
        "original": original,
        "suggestion": suggestion,
        "fix_type": fix_type,
        "reason": reason,
        # race window 차단 — backend 적용 시점에 episode.updated_at 과 비교, 변하면 409 거부
        "expected_updated_at": row[1].isoformat() if row[1] is not None else None,
    }
    return await _insert_suggestion(
        session,
        ctx,
        entity_type="spelling_fix",
        suggested_name=f"L{line} {original} → {suggestion}",
        payload=payload,
        episode_id=uuid.UUID(episode_id),
    )


async def propose_spelling_fix_batch(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    episode_id: str,
    fixes: list[dict[str, Any]],
) -> dict[str, Any]:
    """회차 본문 표기 오류 N건을 1개의 체크리스트 제안으로 묶어 적재.

    propose_spelling_fix 와 달리 1 propose = N 치환. 작가는 작업물 / 검토 오버레이에서
    항목별 체크박스로 OK / NG 선별 후 [√ 적용] 클릭 → backend 가 선택된 항목만 일괄 자동
    치환.

    Args:
      episode_id: 대상 회차 UUID
      fixes: ``[{line, original, suggestion, fix_type, reason?}]`` — check_spelling 의
              issues 결과를 거의 그대로 매핑. 각 fix 의 line/original/suggestion 은
              propose_spelling_fix 와 동일 의미.

    검증:
      - 빈 배열 거부
      - 각 fix 의 fix_type / line / original / suggestion 필수
      - original == suggestion 이면 해당 fix 제외 (no_change 노이즈)
    """
    r = await session.execute(
        sa_text(
            "SELECT title, updated_at FROM episode "
            "WHERE id = :eid AND work_id = :wid AND writer_id = :wr"
        ),
        {"eid": episode_id, "wid": ctx.work_id, "wr": ctx.writer_id},
    )
    row = r.fetchone()
    if row is None:
        return {"error": "episode_not_found_in_work"}
    if not isinstance(fixes, list) or len(fixes) == 0:
        return {"error": "fixes_required_non_empty_list"}

    cleaned: list[dict[str, Any]] = []
    for i, raw in enumerate(fixes):
        if not isinstance(raw, dict):
            continue
        fix_type = str(raw.get("fix_type") or raw.get("type") or "").strip().lower()
        if fix_type not in ("typo", "spacing", "punctuation"):
            continue
        line_v = raw.get("line")
        if not isinstance(line_v, int) or line_v < 1:
            continue
        original = str(raw.get("original") or "").strip()
        suggestion = str(raw.get("suggestion") or "").strip()
        if not original or not suggestion or original == suggestion:
            continue
        reason = raw.get("reason")
        cleaned.append({
            "idx": i,
            "line": line_v,
            "original": original,
            "suggestion": suggestion,
            "fix_type": fix_type,
            "reason": str(reason) if reason else None,
        })

    if not cleaned:
        return {"error": "no_valid_fixes_after_validation"}

    payload = {
        "episode_id": episode_id,
        "fixes": cleaned,
        "expected_updated_at": row[1].isoformat() if row[1] is not None else None,
    }
    suggested_name = (
        f"맞춤법 {len(cleaned)}건 — "
        + ", ".join(f"L{f['line']}" for f in cleaned[:5])
        + ("..." if len(cleaned) > 5 else "")
    )
    return await _insert_suggestion(
        session,
        ctx,
        entity_type="spelling_batch",
        suggested_name=suggested_name,
        payload=payload,
        episode_id=uuid.UUID(episode_id),
    )


async def propose_episode_draft(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    title: str,
    content: str,
    parent_id: str | None = None,
    reference_episodes: list[int] | None = None,
) -> dict[str, Any]:
    if parent_id:
        r = await session.execute(
            sa_text(
                "SELECT 1 FROM episode WHERE id = :pid AND work_id = :wid AND writer_id = :wr"
            ),
            {"pid": parent_id, "wid": ctx.work_id, "wr": ctx.writer_id},
        )
        if r.fetchone() is None:
            return {"error": "parent_episode_not_found_in_work"}
    payload = {
        "title": title,
        "content": content,
        "parent_id": parent_id,
        "reference_episodes": reference_episodes or [],
    }
    return await _insert_suggestion(
        session,
        ctx,
        entity_type="episode_draft",
        suggested_name=title,
        payload=payload,
    )

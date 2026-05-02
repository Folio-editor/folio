"""POST /v1/extract-settings - 원고에서 신규/변경 설정 후보 추출.

이 엔드포인트는 AI 개발/스크립트 전용이며 사용자 암호화 플로우(드래프트/검수)에 포함되지
않는다. 따라서 PR5 페이로드 입력으로 전환하지 않고, 기존 DB 직접 SELECT 방식을 유지한다.
v1: 암호문 컬럼은 _is_ciphertext 가드로 결과에서 제외해 AI 서버가 평문을 못 보는 일관성을
유지한다.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text as sa_text

from app.db.session import async_session
from app.middleware.auth import require_internal_api_key
from app.services.providers import get_llm
from app.services.text_extractor import extract_plain_text

router = APIRouter(
    prefix="/extract-settings",
    tags=["extract-settings"],
    dependencies=[Depends(require_internal_api_key)],
)

EXTRACT_SETTINGS_SYSTEM_PROMPT = """당신은 웹소설 설정 분석 전문가입니다.
주어진 원고를 읽고, 기존 설정집과 비교하여 새로운 인물/세계관 설정/복선을 추출합니다.
기존 목록에 이미 있는 항목은 제외하고, 새로운 것만 추출합니다.
기존 인물이지만 새로운 정보가 발견된 경우 업데이트 제안으로 분류합니다.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트를 포함하지 마세요."""

EXTRACT_SETTINGS_SCHEMA_HINT = """{
  "new_characters": [
    {"name": "이름", "description": "이 원고에서 드러난 정보 요약"}
  ],
  "updated_characters": [
    {"name": "기존 인물 이름", "field": "어떤 정보", "change": "새로 발견된 내용"}
  ],
  "new_world_notes": [
    {"name": "설정 이름", "description": "설정 내용"}
  ],
  "updated_world_notes": [
    {"name": "기존 설정 이름", "field": "어떤 정보", "change": "새로 발견된 내용"}
  ],
  "foreshadowing": [
    {"name": "복선 이름", "description": "복선 내용"}
  ]
}"""

EXPECTED_KEYS = (
    "new_characters",
    "updated_characters",
    "new_world_notes",
    "updated_world_notes",
    "foreshadowing",
)


class ExtractSettingsRequest(BaseModel):
    work_id: str
    writer_id: str
    content: str


class ExtractSettingsResponse(BaseModel):
    new_characters: list[dict[str, Any]]
    updated_characters: list[dict[str, Any]]
    new_world_notes: list[dict[str, Any]]
    updated_world_notes: list[dict[str, Any]]
    foreshadowing: list[dict[str, Any]]
    usage: dict[str, int]


def _format_existing_characters(rows: list[tuple[Any, ...]]) -> str:
    if not rows:
        return "(없음)"

    lines: list[str] = []
    for name, gender, age, personality, content in rows:
        parts = [str(name)]
        if gender:
            parts.append(f"성별:{gender}")
        if age:
            parts.append(f"나이:{age}")
        if personality:
            parts.append(f"성격:{personality}")
        if content:
            parts.append(f"설명:{extract_plain_text(content)[:200]}")
        lines.append("- " + " / ".join(parts))
    return "\n".join(lines)


def _format_existing_world_notes(rows: list[tuple[Any, ...]]) -> str:
    if not rows:
        return "(없음)"

    lines: list[str] = []
    for name, content in rows:
        description = extract_plain_text(content)[:200] if content else ""
        if description:
            lines.append(f"- {name}: {description}")
        else:
            lines.append(f"- {name}")
    return "\n".join(lines)


def _normalize_result(result: dict[str, Any]) -> ExtractSettingsResponse:
    payload: dict[str, Any] = {}
    for key in EXPECTED_KEYS:
        value = result.get(key, [])
        payload[key] = value if isinstance(value, list) else []
    payload["usage"] = {"input_tokens": 0, "output_tokens": 0}
    return ExtractSettingsResponse(**payload)


def _is_ciphertext(value: Any) -> bool:
    """Plan C v1 암호문 판별. 'v1:' 접두사로 시작하는 문자열만 암호문."""
    return isinstance(value, str) and value.startswith("v1:")


async def _load_existing_settings(work_id: str) -> tuple[list[tuple[Any, ...]], list[tuple[Any, ...]]]:
    """기존 등장인물·세계관 노트를 DB에서 직접 조회한다.

    PR5 이후 settings_loader.load_settings는 클라이언트 평문 페이로드만 입력받는 순수
    함수로 바뀌었기 때문에, 이 엔드포인트(스크립트 전용)는 자체 SELECT를 유지한다.
    v1: 암호문 행은 결과에서 제외해 평문만 LLM에 노출된다.
    """
    work_uuid = uuid.UUID(work_id)
    async with async_session() as session:
        character_result = await session.execute(
            sa_text(
                "SELECT c.name, c.gender, c.age, "
                "       pn.content AS personality, "
                "       '' AS content "
                "FROM character c "
                "LEFT JOIN character_note pn "
                "  ON pn.character_id = c.id AND pn.kind = 'personality' "
                "WHERE c.work_id = :wid "
                "ORDER BY c.sort_order"
            ),
            {"wid": work_uuid},
        )
        world_note_result = await session.execute(
            sa_text(
                "SELECT name, content FROM world_note "
                "WHERE work_id = :wid ORDER BY sort_order"
            ),
            {"wid": work_uuid},
        )
        characters = [
            row for row in character_result.fetchall()
            if not _is_ciphertext(row[0])
        ]
        world_notes = [
            row for row in world_note_result.fetchall()
            if not _is_ciphertext(row[0]) and not _is_ciphertext(row[1])
        ]
    return characters, world_notes


@router.post("", response_model=ExtractSettingsResponse)
async def extract_settings(req: ExtractSettingsRequest):
    # LLM 호출 동안 DB 커넥션을 점유하지 않도록, 설정 조회만 짧게 마치고 풀에 반납한다.
    characters, world_notes = await _load_existing_settings(req.work_id)
    existing_characters = _format_existing_characters(characters)
    existing_world_notes = _format_existing_world_notes(world_notes)
    cleaned_content = extract_plain_text(req.content)

    user_prompt = (
        f"## 기존 등장인물\n{existing_characters}\n\n"
        f"## 기존 세계관 설정\n{existing_world_notes}\n\n"
        f"## 분석할 원고\n{cleaned_content}\n\n"
        f"## 응답 형식\n{EXTRACT_SETTINGS_SCHEMA_HINT}"
    )

    llm = get_llm()
    raw_result = await llm.generate_json(
        EXTRACT_SETTINGS_SYSTEM_PROMPT,
        user_prompt,
        EXTRACT_SETTINGS_SCHEMA_HINT,
    )
    normalized = _normalize_result(raw_result)
    return normalized.model_copy(update={"usage": llm.last_usage})

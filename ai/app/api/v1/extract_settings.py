"""POST /v1/extract-settings - 원고에서 신규/변경 설정 후보 추출."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.db.session import async_session
from app.middleware.auth import require_internal_api_key
from app.services.providers import get_llm
from app.services.settings_loader import load_settings
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


@router.post("", response_model=ExtractSettingsResponse)
async def extract_settings(req: ExtractSettingsRequest):
    # LLM 호출 동안 DB 커넥션을 점유하지 않도록, 설정 조회만 짧게 마치고 풀에 반납한다.
    async with async_session() as session:
        settings_bundle = await load_settings(session, req.work_id)

    if settings_bundle["mode"] == "full":
        existing_characters = _format_existing_characters(settings_bundle["characters"])
        existing_world_notes = _format_existing_world_notes(settings_bundle["world_notes"])
    else:
        existing_characters = settings_bundle["characters_text"]
        existing_world_notes = settings_bundle["world_notes_text"]
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

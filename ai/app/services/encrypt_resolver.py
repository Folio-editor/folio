"""Backend `/internal/works/{work_id}/encrypt-fields` 호출 helper (Phase 4.6).

청크 / 요약 INSERT 전 자유형 텍스트 필드 일괄 암호화. decrypt_resolver 의 거울.

평문은 호출 직전 메모리에만, 로그·DB 기록 0. 암호화 실패 시 raise.
"""

from __future__ import annotations

import logging
from typing import Mapping
from uuid import UUID

import httpx

from app.config import settings

log = logging.getLogger(__name__)

_PATH = "/internal/works/{work_id}/encrypt-fields"


class EncryptResolverError(RuntimeError):
    """server_encrypted_dek 미발급, 인증 실패, 네트워크 오류, 암호화 실패 등."""


def _needs_encrypt(value: object) -> bool:
    """평문 문자열이고 비어있지 않고 이미 v1: 가 아닌 경우만 암호화 필요."""
    return (
        isinstance(value, str)
        and bool(value)
        and not value.startswith("v1:")
    )


# Phase 4.6 — episode_summary 의 자유형 서사 텍스트만 암호화.
# 평문 유지 (SQL 매칭 / GIN 인덱스 사용):
#   - pov_character (idx_episode_summary_pov, character_arc 의 is_pov 비교)
#   - tone          (search_episode_summaries scope='tone:...' 매칭)
#   - JSONB 전부    (present_characters / present_locations / key_events /
#                    keywords / foreshadow_planted / foreshadow_paid_off /
#                    referenced_world_notes — track_foreshadow / character_arc 등 분석)
_SUMMARY_TEXT_FIELDS = (
    "oneline_summary",
    "summary",
    "time_progression",
    "cliffhanger",
)


def summary_text_fields() -> tuple[str, ...]:
    """episode_summary 의 자유형 텍스트 필드 (암호화 대상). JSONB 분석용 필드는 제외."""
    return _SUMMARY_TEXT_FIELDS


async def encrypt_summary_text_fields(
    work_id: UUID | str,
    summary_dict: dict,
) -> dict:
    """summary dict 의 텍스트 필드만 암호화하여 새 dict 반환 (다른 필드는 원본 유지).

    JSONB / 정수 / bool / None 필드는 그대로 통과. 텍스트 필드 중 빈/None 도 그대로.
    """
    payload: dict[str, str | None] = {}
    for k in _SUMMARY_TEXT_FIELDS:
        v = summary_dict.get(k)
        if isinstance(v, str):
            payload[k] = v
    if not payload:
        return dict(summary_dict)
    enc = await encrypt_fields(work_id, payload)
    out = dict(summary_dict)
    for k, v in enc.items():
        out[k] = v
    return out


async def encrypt_fields(
    work_id: UUID | str,
    fields: Mapping[str, str | None],
) -> dict[str, str | None]:
    """평문 dict 을 일괄 암호화. None / 빈 문자열 / 이미 v1: 인 값은 그대로 echo.

    네트워크 / Vault 미발급 / 암호화 실패 → EncryptResolverError. 호출자는 catch
    후 INSERT 중단 결정 (평문 적재 절대 금지).
    """
    if not any(_needs_encrypt(v) for v in fields.values()):
        # 모두 None / 빈 / 이미 ciphertext — backend 호출 생략
        return dict(fields)

    url = settings.backend_internal_url.rstrip("/") + _PATH.format(work_id=str(work_id))
    headers = {"X-Internal-Api-Key": settings.internal_api_key}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json={"fields": dict(fields)})
    except httpx.HTTPError as e:
        raise EncryptResolverError(f"backend 호출 실패: {e}") from e

    if resp.status_code == 409:
        raise EncryptResolverError(
            f"server_encrypted_dek 미발급 work={work_id} (클라이언트 pending 처리 대기)"
        )
    if resp.status_code != 200:
        raise EncryptResolverError(
            f"backend 암호화 실패 status={resp.status_code} body={resp.text[:200]}"
        )
    data = resp.json()
    return dict(data.get("fields") or {})

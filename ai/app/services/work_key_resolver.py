"""Backend 내부 복호화 API 경유 episode 평문 fetch.

curious-wiggling-thacker plan V-7. AI 서버는 Vault 토큰 미보유 — backend 가
WorkKeyService + AesGcmCipher 로 복호화한 결과만 응답받는다.

평문은 메모리에만, 로그·DB 기록 0.
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings

log = logging.getLogger(__name__)

_DECRYPT_PATH = "/internal/works/{work_id}/decrypt-episode/{episode_id}"


class WorkKeyResolverError(RuntimeError):
    """server_encrypted_dek 미발급, 인증 실패, 네트워크 오류 등."""


async def resolve_episode_plaintext(episode_id: str, work_id: str) -> str:
    """Backend 호출하여 episode 본문 평문 반환.

    - 409: server_encrypted_dek 미발급 (오프라인 신규 작품, 클라이언트 pending) → skip 권장
    - 401: internal api key 불일치
    - 404: episode/work 없음
    """
    url = settings.backend_internal_url.rstrip("/") + _DECRYPT_PATH.format(
        work_id=work_id, episode_id=episode_id
    )
    headers = {"X-Internal-Api-Key": settings.internal_api_key}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers)
    except httpx.HTTPError as e:
        raise WorkKeyResolverError(f"backend 호출 실패: {e}") from e

    if resp.status_code == 409:
        raise WorkKeyResolverError(
            f"server_encrypted_dek 미발급 work={work_id} (클라이언트 pending 처리 대기)"
        )
    if resp.status_code != 200:
        raise WorkKeyResolverError(
            f"backend 복호화 실패 status={resp.status_code} body={resp.text[:200]}"
        )
    data = resp.json()
    plaintext = data.get("plaintext")
    if plaintext is None:
        raise WorkKeyResolverError("응답에 plaintext 누락")
    return plaintext

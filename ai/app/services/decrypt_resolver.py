"""Backend `/internal/works/{work_id}/decrypt-fields` 호출 helper.

MCP 도구 (character / world_note / plot 등) 가 v1: ciphertext 컬럼을 만나면
batch 로 backend 에 전달 → 평문 dict 받아 메모리에서만 사용.

평문은 메모리에만, 로그·DB 기록 0.
"""

from __future__ import annotations

import logging
from typing import Mapping
from uuid import UUID

import httpx

from app.config import settings

log = logging.getLogger(__name__)

_PATH = "/internal/works/{work_id}/decrypt-fields"


class DecryptResolverError(RuntimeError):
    """server_encrypted_dek 미발급, 인증 실패, 네트워크 오류 등."""


def _is_ciphertext(value: object) -> bool:
    return isinstance(value, str) and value.startswith("v1:")


async def decrypt_fields(work_id: UUID | str, fields: Mapping[str, str | None]) -> dict[str, str | None]:
    """v1: 값을 일괄 복호화. 평문/None 은 그대로 반환.

    네트워크 / Vault 미발급 / 인증 실패 → DecryptResolverError. 호출자는 catch 후
    fallback (예: 'v1:' 그대로 전달 차단) 결정.
    """
    # ciphertext 가 하나도 없으면 backend 호출 생략 — 비용 절감
    if not any(_is_ciphertext(v) for v in fields.values()):
        return dict(fields)

    url = settings.backend_internal_url.rstrip("/") + _PATH.format(work_id=str(work_id))
    headers = {"X-Internal-Api-Key": settings.internal_api_key}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json={"fields": dict(fields)})
    except httpx.HTTPError as e:
        raise DecryptResolverError(f"backend 호출 실패: {e}") from e

    if resp.status_code == 409:
        raise DecryptResolverError(
            f"server_encrypted_dek 미발급 work={work_id} (클라이언트 pending 처리 대기)"
        )
    if resp.status_code != 200:
        raise DecryptResolverError(
            f"backend 복호화 실패 status={resp.status_code} body={resp.text[:200]}"
        )
    data = resp.json()
    return dict(data.get("fields") or {})


async def decrypt_rows(
    work_id: UUID | str,
    rows: list[dict],
    field_names: list[str],
) -> list[dict]:
    """여러 행의 같은 필드 집합을 batch 복호화.

    개별 행마다 backend 호출하지 않고 전체 ciphertext 를 1회 호출로 묶는다.
    각 행에 (row_idx, field_name) → unique key 매핑. 결과 dict 으로 풀어
    원본 row 의 값을 평문으로 갱신해 반환 (얕은 복사).
    """
    if not rows:
        return rows

    flat: dict[str, str | None] = {}
    for ri, row in enumerate(rows):
        for fn in field_names:
            v = row.get(fn)
            if _is_ciphertext(v):
                flat[f"{ri}:{fn}"] = v  # type: ignore[assignment]

    if not flat:
        return [dict(r) for r in rows]

    decrypted = await decrypt_fields(work_id, flat)

    out: list[dict] = []
    for ri, row in enumerate(rows):
        new_row = dict(row)
        for fn in field_names:
            key = f"{ri}:{fn}"
            if key in decrypted:
                new_row[fn] = decrypted[key]
        out.append(new_row)
    return out

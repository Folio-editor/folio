"""Backend 영수증 발행 callback (Phase 4 §L-6).

AI runner 가 사용 토큰 합계를 backend 의 INTERNAL 엔드포인트로 POST →
backend 가 token_receipt + token_receipt_line INSERT + token_wallet 차감 + token_transaction 적재.

호출 실패는 runner 가 catch 하여 receipt_callback_failed 응답으로 표기.
Phase 5 에서 Redis 재시도 큐 도입 예정.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

log = logging.getLogger(__name__)

_PATH = "/internal/v1/token-receipts"


async def issue_receipt(*, writer_id: str, work_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    body = {"writer_id": writer_id, "work_id": work_id, **payload}
    url = settings.backend_internal_url.rstrip("/") + _PATH
    headers = {"X-Internal-Api-Key": settings.internal_api_key}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=body)
    except httpx.HTTPError as e:
        log.warning("token_receipt.callback_network_error: %s", e)
        return {"error": "network", "detail": str(e)[:200]}
    if resp.status_code >= 400:
        log.warning(
            "token_receipt.callback_failed status=%s body=%s",
            resp.status_code,
            resp.text[:200],
        )
        return {"error": "http", "status": resp.status_code, "body": resp.text[:200]}
    return resp.json()

"""JSON 객체/배열 안의 string leaf 를 deep-walk 하여 일괄 암호화/복호화.

agent_session.messages, extraction_suggestion.payload 처럼 구조화된 JSON 의
**텍스트 값만** AES-GCM(work_key) 으로 변환. 구조 키(role, type, name 등) 와
숫자/bool/null 은 그대로 유지.

backend `/internal/works/{id}/encrypt-fields` + `/decrypt-fields` 를 단일 호출로
batch 처리 — 트리에 string 100개 있어도 round-trip 1회.

평문 boundary:
- 너무 짧은 (5자 미만) string 은 enum 값일 가능성 높아 평문 유지 옵션 (skip_short).
- "v1:" 으로 이미 시작하면 암호화 skip (멱등).
- 빈 문자열 / None 은 skip.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.services.decrypt_resolver import decrypt_fields
from app.services.encrypt_resolver import encrypt_fields


# 평문 유지할 키 화이트리스트 (구조 식별용 — 절대 사용자 데이터 아님).
# Anthropic message 스펙: role/type/id/name 등.
# extraction_suggestion payload 구조 키: character_id/world_note_id/episode_id/plot_id/
#   parent_id/field/status/gender/age/category/kind/severity/source/scenario.
_STRUCTURAL_KEYS = frozenset({
    "role",
    "type",
    "id",
    "tool_use_id",
    "tool_name",
    "name",          # tool_use.name (e.g. "propose_character") — 평문 도구명
    "scenario",
    "status",
    "kind",
    "field",
    "gender",
    "category",
    "severity",
    "source",
    "actor",
    "step_type",
    "model",
    # entity FK id 들
    "character_id",
    "world_note_id",
    "episode_id",
    "plot_id",
    "work_id",
    "writer_id",
    "thread_id",
    "parent_id",
    # 정량
    "input_tokens",
    "output_tokens",
    "user_tokens",
    "max_tokens",
    "iterations",
    "seq",
    "duration_ms",
    "sort_order",
    "level",
    "start",
    "reference_episodes",
})


def _is_structural_key(key: str) -> bool:
    return key in _STRUCTURAL_KEYS


def _collect_strings(node: Any, path: str, out: dict[str, str], structural: bool = False) -> None:
    """node 트리 walk 하며 leaf string 을 path → value 로 평탄화."""
    if isinstance(node, str):
        if structural:
            return
        if not node:
            return
        out[path] = node
        return
    if isinstance(node, dict):
        for k, v in node.items():
            child_path = f"{path}.{k}" if path else k
            _collect_strings(v, child_path, out, structural=_is_structural_key(k))
        return
    if isinstance(node, list):
        for i, v in enumerate(node):
            child_path = f"{path}[{i}]"
            # 리스트 항목은 부모의 structural 속성 상속 안 함 (예: messages[0] 은 평문 대상)
            _collect_strings(v, child_path, out, structural=False)
        return
    # int / float / bool / None — skip


def _apply_strings(node: Any, path: str, mapped: dict[str, str], structural: bool = False) -> Any:
    """_collect_strings 와 대칭 — 같은 path 의 값을 mapped 의 새 값으로 교체.

    원본 node 는 변형하지 않고 신규 객체 반환 (얕은 재귀 복사).
    """
    if isinstance(node, str):
        if structural:
            return node
        if not node:
            return node
        return mapped.get(path, node)
    if isinstance(node, dict):
        return {
            k: _apply_strings(
                v,
                f"{path}.{k}" if path else k,
                mapped,
                structural=_is_structural_key(k),
            )
            for k, v in node.items()
        }
    if isinstance(node, list):
        return [
            _apply_strings(v, f"{path}[{i}]", mapped, structural=False)
            for i, v in enumerate(node)
        ]
    return node


async def encrypt_json_strings(work_id: UUID | str, payload: Any) -> Any:
    """payload 트리의 모든 비-구조-키 leaf string 을 v1: ciphertext 로 변환.

    빈/이미-v1: 값은 skip. structural 키 (role/type 등) 의 직접 값은 평문 유지.
    """
    flat: dict[str, str] = {}
    _collect_strings(payload, "", flat, structural=False)
    if not flat:
        return payload
    encrypted = await encrypt_fields(work_id, flat)
    # encrypt_fields 는 ciphertext 가 None/평문/v1: 모두 가능 → 그대로 mapped 적용
    str_mapped: dict[str, str] = {k: v for k, v in encrypted.items() if isinstance(v, str)}
    return _apply_strings(payload, "", str_mapped, structural=False)


async def decrypt_json_strings(work_id: UUID | str, payload: Any) -> Any:
    """payload 트리의 모든 v1: leaf string 을 평문으로 변환.

    v1: 가 아닌 값은 그대로. 복호화 실패 (Vault 미발급 등) 시 호출자가 catch.
    """
    flat: dict[str, str] = {}
    _collect_strings(payload, "", flat, structural=False)
    # v1: 가 아닌 string 은 backend round-trip 불필요 — 사전 필터
    cipher_only = {k: v for k, v in flat.items() if v.startswith("v1:")}
    if not cipher_only:
        return payload
    decrypted = await decrypt_fields(work_id, cipher_only)
    str_mapped: dict[str, str] = {k: v for k, v in decrypted.items() if isinstance(v, str)}
    return _apply_strings(payload, "", str_mapped, structural=False)

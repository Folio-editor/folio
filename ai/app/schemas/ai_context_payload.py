"""AI 컨텍스트 페이로드 (PR5 — Plan C 옵션 1).

클라이언트가 KEK + work_key로 복호화한 평문 컨텍스트를 AI 서버로 전달하기 위한 스키마.
AI 서버는 평문을 메모리에서만 사용하고 절대 로깅·영속화하지 않는다.

vector_search 청크와 timeline은 옵션 1 보안 모델의 평문 예외 영역이라
페이로드에 포함하지 않고 AI 서버가 DB에서 직접 읽는다.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class WorkMetaPayload(BaseModel):
    title: str | None = None
    author_name: str | None = None
    description: str | None = None
    status: str | None = None


class CharacterNotePayload(BaseModel):
    kind: str | None = None
    title: str | None = None
    content: str | None = None


class CharacterCustomFieldPayload(BaseModel):
    field_name: str | None = None
    field_value: str | None = None


class CharacterPayload(BaseModel):
    id: str
    name: str | None = None
    gender: str | None = None
    age: str | None = None
    notes: list[CharacterNotePayload] = Field(default_factory=list)
    custom_fields: list[CharacterCustomFieldPayload] = Field(default_factory=list)


class WorldNotePayload(BaseModel):
    name: str | None = None
    content: str | None = None


class ForeshadowPayload(BaseModel):
    title: str | None = None
    status: str | None = None
    importance: str | None = None
    content: str | None = None


class PlotPayload(BaseModel):
    title: str | None = None
    content: str | None = None


class RecentEpisodePayload(BaseModel):
    sort_order: int
    title: str | None = None
    content: str | None = None


class AiContextPayload(BaseModel):
    work_meta: WorkMetaPayload = Field(default_factory=WorkMetaPayload)
    characters: list[CharacterPayload] = Field(default_factory=list)
    world_notes: list[WorldNotePayload] = Field(default_factory=list)
    foreshadows: list[ForeshadowPayload] = Field(default_factory=list)
    plots: list[PlotPayload] = Field(default_factory=list)
    recent_episodes: list[RecentEpisodePayload] = Field(default_factory=list)

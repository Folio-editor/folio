import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EpisodeSummary(Base):
    __tablename__ = "episode_summary"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    episode_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("episode.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    work_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("work.id", ondelete="CASCADE"), nullable=False)
    writer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("writer.id", ondelete="CASCADE"), nullable=False)

    # 요약 본문
    oneline_summary: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text, nullable=False)

    # 회차 메타 (AI 탐색·검수·초안용)
    pov_character: Mapped[str | None] = mapped_column(String(100))
    present_characters: Mapped[Any | None] = mapped_column(JSONB)
    present_locations: Mapped[Any | None] = mapped_column(JSONB)
    key_events: Mapped[Any | None] = mapped_column(JSONB)
    # Phase 4.6: 자유형 텍스트 암호화 대상 — ciphertext 가 항상 50자 초과 → TEXT 필수
    time_progression: Mapped[str | None] = mapped_column(Text)
    tone: Mapped[str | None] = mapped_column(String(50))
    cliffhanger: Mapped[str | None] = mapped_column(Text)
    referenced_world_notes: Mapped[Any | None] = mapped_column(JSONB)
    foreshadow_planted: Mapped[Any | None] = mapped_column(JSONB)
    foreshadow_paid_off: Mapped[Any | None] = mapped_column(JSONB)
    keywords: Mapped[Any | None] = mapped_column(JSONB)
    word_count: Mapped[int | None] = mapped_column(Integer)

    # 작가 승인
    is_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    # 호출 메타 / 폭주 가드
    model_used: Mapped[str | None] = mapped_column(String(50))
    raw_result: Mapped[Any | None] = mapped_column(JSONB)
    content_hash: Mapped[str | None] = mapped_column(String(64))
    generation_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_generated_at: Mapped[datetime | None]

    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(nullable=False, server_default="now()")
    # summary_tsv: GENERATED column — read-only, ORM 매핑 제외 (raw SQL 검색용).

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ExtractionSuggestion(Base):
    __tablename__ = "extraction_suggestion"
    __table_args__ = (UniqueConstraint("work_id", "entity_type", "suggested_name"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    writer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("writer.id", ondelete="CASCADE"), nullable=False)
    work_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("work.id", ondelete="CASCADE"), nullable=False)
    episode_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("episode.id", ondelete="SET NULL"))
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    suggested_name: Mapped[str] = mapped_column(String(200), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="'{}'::jsonb")
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="'pending'")
    confirmed_target_id: Mapped[uuid.UUID | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(nullable=False, server_default="now()")

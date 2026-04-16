import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AiJob(Base):
    __tablename__ = "ai_job"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    writer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("writer.id", ondelete="CASCADE"), nullable=False)
    work_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("work.id", ondelete="CASCADE"), nullable=False)
    episode_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("episode.id", ondelete="SET NULL"))
    job_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="'pending'")
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(nullable=False, server_default="now()")

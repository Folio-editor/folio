import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AgentSession(Base):
    __tablename__ = "agent_session"

    thread_id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    work_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("work.id", ondelete="CASCADE"), nullable=False)
    writer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("writer.id", ondelete="CASCADE"), nullable=False)
    scenario: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str | None] = mapped_column(String(200))
    messages: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="'[]'::jsonb")
    summary_so_far: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="'active'")
    last_activity_at: Mapped[datetime] = mapped_column(nullable=False, server_default="now()")
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default="now()")

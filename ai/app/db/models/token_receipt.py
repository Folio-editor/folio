import uuid
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TokenReceipt(Base):
    __tablename__ = "token_receipt"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    writer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("writer.id", ondelete="CASCADE"), nullable=False)
    work_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("work.id", ondelete="SET NULL"))
    feature: Mapped[str] = mapped_column(String(40), nullable=False)
    scenario: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_type: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    total_user_tokens: Mapped[int] = mapped_column(nullable=False, default=0)
    total_input_raw: Mapped[int] = mapped_column(nullable=False, default=0)
    total_output_raw: Mapped[int] = mapped_column(nullable=False, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(nullable=False, default=0)
    cache_create_tokens: Mapped[int] = mapped_column(nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    abort_reason: Mapped[str | None] = mapped_column(String(40))
    duration_ms: Mapped[int | None] = mapped_column()
    idempotency_key: Mapped[str | None] = mapped_column(String(200), unique=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default="now()")


class TokenReceiptLine(Base):
    __tablename__ = "token_receipt_line"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    receipt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("token_receipt.id", ondelete="CASCADE"), nullable=False
    )
    seq: Mapped[int] = mapped_column(nullable=False)
    step_type: Mapped[str] = mapped_column(String(40), nullable=False)
    actor: Mapped[str] = mapped_column(String(40), nullable=False)
    tool_name: Mapped[str | None] = mapped_column(String(60))
    input_tokens: Mapped[int] = mapped_column(nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(nullable=False, default=0)
    user_tokens: Mapped[int] = mapped_column(nullable=False, default=0)
    detail: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="'{}'::jsonb")
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default="now()")

import os

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Doppler가 빈 문자열로 주입하는 ANTHROPIC_BASE_URL은 Anthropic SDK가
# 유효한 base URL로 잘못 해석한다. 빈/공백이면 아예 언셋해 SDK 기본값을 쓰게 한다.
_raw_base_url = os.environ.get("ANTHROPIC_BASE_URL")
if _raw_base_url is not None and not _raw_base_url.strip():
    os.environ.pop("ANTHROPIC_BASE_URL", None)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("anthropic_base_url", mode="before")
    @classmethod
    def _empty_base_url_to_none(cls, v: object) -> object:
        if isinstance(v, str) and not v.strip():
            return None
        return v

    app_env: str = Field(default="dev")
    app_port: int = Field(default=8000)
    log_level: str = Field(default="INFO")

    internal_api_key: str = Field(default="change-me")

    database_url: str = Field(
        default="postgresql+asyncpg://storyzip:storyzip@localhost:5432/storyzip"
    )

    redis_url: str = Field(default="redis://localhost:6379/0")
    celery_broker_url: str = Field(default="redis://localhost:6379/1")
    celery_result_backend: str = Field(default="redis://localhost:6379/2")

    anthropic_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("ANTHROPIC_API_KEY", "CLAUDE_API_KEY"),
    )
    anthropic_base_url: str | None = Field(default=None)
    openai_api_key: str = Field(default="")
    embedding_model: str = Field(default="text-embedding-3-small")
    claude_sonnet_model: str = Field(default="claude-sonnet-4-6")
    claude_haiku_model: str = Field(default="claude-haiku-4-5-20251001")
    claude_opus_model: str = Field(default="claude-opus-4-7")

    # Provider 토글 — SSAFY GMS 키 발급 전: "fake" / 발급 후: "openai", "anthropic"
    embedding_provider: str = Field(default="fake")
    llm_provider: str = Field(default="fake")


settings = Settings()

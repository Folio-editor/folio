from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

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

    anthropic_api_key: str = Field(default="")
    openai_api_key: str = Field(default="")
    embedding_model: str = Field(default="text-embedding-3-small")
    claude_sonnet_model: str = Field(default="claude-sonnet-4-5")
    claude_haiku_model: str = Field(default="claude-haiku-4-5-20251001")

    # Provider 토글 — SSAFY GMS 키 발급 전: "fake" / 발급 후: "openai", "anthropic"
    embedding_provider: str = Field(default="fake")
    llm_provider: str = Field(default="fake")


settings = Settings()

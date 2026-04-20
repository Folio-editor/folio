from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_DATABASE_URL = "postgresql+asyncpg://storyzip:storyzip@localhost:5432/storyzip"
DEFAULT_REDIS_URL = "redis://localhost:6379/0"
DEFAULT_CELERY_BROKER_URL = "redis://localhost:6379/1"
DEFAULT_CELERY_RESULT_BACKEND = "redis://localhost:6379/2"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = Field(
        default="dev",
        validation_alias=AliasChoices("APP_ENV", "DOPPLER_ENVIRONMENT"),
    )
    app_port: int = Field(
        default=8000,
        validation_alias=AliasChoices("APP_PORT", "SERVER_PORT"),
    )
    log_level: str = Field(default="INFO", validation_alias="LOG_LEVEL")

    internal_api_key: str = Field(default="change-me", validation_alias="INTERNAL_API_KEY")

    database_url: str = Field(default="", validation_alias="DATABASE_URL")
    db_host: str | None = Field(default=None, validation_alias="DB_HOST")
    db_port: int = Field(default=5432, validation_alias="DB_PORT")
    db_name: str | None = Field(default=None, validation_alias="DB_NAME")
    db_username: str | None = Field(default=None, validation_alias="DB_USERNAME")
    db_password: str | None = Field(default=None, validation_alias="DB_PASSWORD")

    redis_url: str = Field(default="", validation_alias="REDIS_URL")
    redis_host: str | None = Field(default=None, validation_alias="REDIS_HOST")
    redis_port: int = Field(default=6379, validation_alias="REDIS_PORT")
    redis_password: str | None = Field(default=None, validation_alias="REDIS_PASSWORD")
    celery_broker_url: str = Field(default="", validation_alias="CELERY_BROKER_URL")
    celery_result_backend: str = Field(default="", validation_alias="CELERY_RESULT_BACKEND")

    anthropic_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("ANTHROPIC_API_KEY", "CLAUDE_API_KEY"),
    )
    openai_api_key: str = Field(default="", validation_alias="OPENAI_API_KEY")
    embedding_model: str = Field(default="text-embedding-3-small", validation_alias="EMBEDDING_MODEL")
    claude_sonnet_model: str = Field(
        default="claude-sonnet-4-5",
        validation_alias="CLAUDE_SONNET_MODEL",
    )
    claude_haiku_model: str = Field(
        default="claude-haiku-4-5-20251001",
        validation_alias="CLAUDE_HAIKU_MODEL",
    )
    claude_opus_model: str = Field(
        default="claude-opus-4-5-20250514",
        validation_alias="CLAUDE_OPUS_MODEL",
    )

    # Provider defaults stay in code when Doppler does not define them.
    embedding_provider: str = Field(default="fake", validation_alias="EMBEDDING_PROVIDER")
    llm_provider: str = Field(default="fake", validation_alias="LLM_PROVIDER")

    @model_validator(mode="after")
    def populate_composed_urls(self) -> "Settings":
        if not self.database_url:
            self.database_url = self._build_database_url()
        if not self.redis_url:
            self.redis_url = self._build_redis_url(db_index=0, fallback=DEFAULT_REDIS_URL)
        if not self.celery_broker_url:
            self.celery_broker_url = self._build_redis_url(
                db_index=1,
                fallback=DEFAULT_CELERY_BROKER_URL,
            )
        if not self.celery_result_backend:
            self.celery_result_backend = self._build_redis_url(
                db_index=2,
                fallback=DEFAULT_CELERY_RESULT_BACKEND,
            )
        return self

    def _build_database_url(self) -> str:
        if self.db_host and self.db_name and self.db_username and self.db_password is not None:
            return (
                f"postgresql+asyncpg://{self.db_username}:{self.db_password}"
                f"@{self.db_host}:{self.db_port}/{self.db_name}"
            )
        return DEFAULT_DATABASE_URL

    def _build_redis_url(self, db_index: int, fallback: str) -> str:
        if self.redis_host:
            auth = f":{self.redis_password}@" if self.redis_password else ""
            return f"redis://{auth}{self.redis_host}:{self.redis_port}/{db_index}"
        return fallback


settings = Settings()

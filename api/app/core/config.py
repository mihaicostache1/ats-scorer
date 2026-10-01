"""Application Settings and Environment Configuration."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Pydantic Settings for Environment Configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # General Project Info
    PROJECT_NAME: str = "AI-Assisted ATS Platform"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = Field(default="development", alias="ENVIRONMENT")
    DEBUG: bool = Field(default=False, alias="DEBUG")

    # CORS Settings
    CORS_ORIGINS: list[str] = Field(default=["http://localhost:3000", "http://127.0.0.1:3000"])

    # Database Settings
    DATABASE_URL: str = Field(
        default="postgresql://ats:ats@localhost:5432/ats", alias="DATABASE_URL"
    )

    # Redis Settings
    REDIS_URL: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # Security Settings
    SECRET_KEY: str = Field(
        default="dev-secret-key-change-in-production-32bytes-min",
        alias="SECRET_KEY",
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Logging Settings
    LOG_LEVEL: str = Field(default="INFO", alias="LOG_LEVEL")


settings = Settings()

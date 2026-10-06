"""Application Settings and Environment Configuration."""

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Pydantic Settings for Environment Configuration."""

    model_config = SettingsConfigDict(
        env_file=[".env", "../.env"],  # api/.env (Docker) or repo root .env (local dev)
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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15  # short-lived access token
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Cookie Settings (httpOnly delivery agreed with frontend)
    COOKIE_DOMAIN: str = Field(default="", alias="COOKIE_DOMAIN")  # empty = current domain
    COOKIE_SECURE: bool = Field(default=False, alias="COOKIE_SECURE")  # True in production
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
    ACCESS_COOKIE_NAME: str = "access_token"
    REFRESH_COOKIE_NAME: str = "refresh_token"

    # Rate limiting – login endpoint
    LOGIN_RATE_LIMIT: str = "10/minute"

    # Logging Settings
    LOG_LEVEL: str = Field(default="INFO", alias="LOG_LEVEL")


settings = Settings()

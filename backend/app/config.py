"""Application configuration loaded from environment variables."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration."""

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    # FastAPI
    debug: bool = True
    environment: str = "development"

    # Email
    smtp_server: str
    smtp_port: int
    smtp_username: str
    smtp_password: str

    # Agent API Keys
    groq_api_key: str | None = None
    openai_api_key: str | None = None

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"


settings = Settings()

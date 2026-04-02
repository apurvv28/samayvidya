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
    allow_anonymous_api: bool = True
    anonymous_user_id: str = "00000000-0000-0000-0000-000000000000"
    anonymous_user_email: str = "anonymous@local"

    # Email
    smtp_server: str
    smtp_port: int
    smtp_username: str
    smtp_password: str

    # Agent API Keys
    groq_api_key: str | None = None
    groq_model: str = "meta-llama/llama-4-scout-17b-16e-instruct"

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"


settings = Settings()

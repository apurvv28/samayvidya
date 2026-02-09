"""Supabase client initialization and management."""
from supabase import create_client, Client
from app.config import settings


class SupabaseClients:
    """Manages Supabase clients for both user and service role operations."""

    _user_client: Client | None = None
    _service_client: Client | None = None

    @classmethod
    def get_user_client(cls) -> Client:
        """
        Get Supabase client with anon key (user-level requests).
        
        This client respects Row Level Security policies.
        Use for all user-facing API operations.
        """
        if cls._user_client is None:
            cls._user_client = create_client(
                supabase_url=settings.supabase_url,
                supabase_key=settings.supabase_anon_key,
            )
        return cls._user_client

    @classmethod
    def get_service_client(cls) -> Client:
        """
        Get Supabase client with service role key (system operations).
        
        This client BYPASSES Row Level Security.
        Use ONLY for internal system/agent operations that need full access.
        NEVER expose this client to frontend-facing endpoints.
        """
        if cls._service_client is None:
            cls._service_client = create_client(
                supabase_url=settings.supabase_url,
                supabase_key=settings.supabase_service_role_key,
            )
        return cls._service_client


# Export convenience functions
def get_user_supabase() -> Client:
    """Returns user-level Supabase client (RLS enforced)."""
    return SupabaseClients.get_user_client()


def get_service_supabase() -> Client:
    """Returns service role Supabase client (RLS bypassed)."""
    return SupabaseClients.get_service_client()

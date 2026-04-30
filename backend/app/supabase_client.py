"""Supabase client initialization and management."""
from supabase import create_client, Client
from app.config import settings
from contextvars import ContextVar
from typing import Optional

# Context variable to store JWT claims for RLS
_jwt_claims: ContextVar[Optional[dict]] = ContextVar('jwt_claims', default=None)


class SupabaseClients:
    """Manages Supabase clients for both user and service role operations."""

    _user_client: Client | None = None
    _service_client: Client | None = None

    @classmethod
    def get_user_client(cls, jwt_token: str | None = None) -> Client:
        """
        Get Supabase client with anon key (user-level requests).
        
        This client respects Row Level Security policies.
        Use for all user-facing API operations.
        
        Args:
            jwt_token: Optional JWT token to set in headers for RLS
        """
        if cls._user_client is None:
            cls._user_client = create_client(
                supabase_url=settings.supabase_url,
                supabase_key=settings.supabase_anon_key,
            )
        
        # Set JWT token in headers if provided
        if jwt_token:
            cls._user_client.auth.set_session(jwt_token)
            # Also set in postgrest headers for RLS
            cls._user_client.postgrest.auth(jwt_token)
        
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
def get_user_supabase(jwt_token: str | None = None) -> Client:
    """
    Returns user-level Supabase client (RLS enforced).
    
    Args:
        jwt_token: Optional JWT token for RLS context
    """
    return SupabaseClients.get_user_client(jwt_token)


def get_service_supabase() -> Client:
    """Returns service role Supabase client (RLS bypassed)."""
    return SupabaseClients.get_service_client()


def set_jwt_claims(claims: dict):
    """Set JWT claims in context for RLS."""
    _jwt_claims.set(claims)


def get_jwt_claims() -> Optional[dict]:
    """Get JWT claims from context for RLS."""
    return _jwt_claims.get()

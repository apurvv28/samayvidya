"""Authentication dependency for extracting and validating JWT tokens."""
from fastapi import Request, HTTPException, status
from jwt import decode, DecodeError, ExpiredSignatureError
from pydantic import BaseModel
from uuid import UUID
from app.config import settings


class CurrentUser(BaseModel):
    """Current authenticated user information extracted from JWT."""

    uid: str
    """User ID from auth.uid()."""
    email: str | None = None
    """User email from token claims."""
    aud: str = "authenticated"
    """Audience claim."""


async def get_current_user(request: Request) -> CurrentUser:
    """
    Extract and validate JWT token from Authorization header.
    
    Decodes the JWT and extracts user information from the Authorization header.
    NOTE: Token is NOT verified here (Supabase will verify via RLS).
    This extracts the sub (user ID) claim for identification.
    
    Args:
        request: FastAPI request object containing headers
        
    Returns:
        CurrentUser: Authenticated user information
        
    Raises:
        HTTPException: If token is invalid or missing
    """
    # Extract Authorization header
    auth_header = request.headers.get("authorization")

    def _safe_anonymous_uid() -> str:
        candidate = (settings.anonymous_user_id or "").strip()
        try:
            return str(UUID(candidate))
        except ValueError:
            return "00000000-0000-0000-0000-000000000000"
    
    if not auth_header:
        if settings.allow_anonymous_api:
            return CurrentUser(
                uid=_safe_anonymous_uid(),
                email=settings.anonymous_user_email,
                aud="anonymous",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Parse "Bearer <token>"
    try:
        scheme, token = auth_header.split(" ")
        if scheme.lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authorization scheme",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        # Decode without verification - Supabase RLS will enforce security
        # We're only extracting the user ID for request context
        payload = decode(
            token,
            options={"verify_signature": False},
            audience="authenticated",
        )

        uid: str = payload.get("sub")
        email: str | None = payload.get("email")

        if uid is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing 'sub' claim",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return CurrentUser(uid=uid, email=email, aud=payload.get("aud", "authenticated"))

    except DecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token decode error: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except HTTPException:
        # Re-raise HTTPException as is
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

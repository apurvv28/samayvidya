"""Authentication dependency for extracting and validating JWT tokens."""
from fastapi import Request, HTTPException, status, Depends
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
    role: str | None = None
    """User role (STUDENT, FACULTY, COORDINATOR, HOD, ADMIN)."""
    department_id: str | None = None
    """Department ID if user is assigned to one."""
    is_hod: bool = False
    """Whether user is a Head of Department."""
    is_coordinator: bool = False
    """Whether user is a Timetable Coordinator."""
    prn: str | None = None
    """Student PRN."""
    division: str | None = None
    """Student division."""


def _normalize_role(value: str | None) -> str | None:
    """Normalize role variants from JWT/profile to canonical uppercase DB roles."""
    if not value:
        return None
    text = str(value).strip().upper().replace("-", " ").replace("_", " ")
    text = " ".join(text.split())
    mapping = {
        "TIME TABLE COORDINATOR": "COORDINATOR",
        "TIMETABLE COORDINATOR": "COORDINATOR",
        "HEAD OF DEPT": "HOD",
        "HEAD OF DEPARTMENT": "HOD",
        "HOD": "HOD",
        "FACULTY": "FACULTY",
        "STUDENT": "STUDENT",
        "COORDINATOR": "COORDINATOR",
        "ADMIN": "ADMIN",
    }
    return mapping.get(text, text)


async def get_current_user(request: Request) -> CurrentUser:
    """
    Extract and validate JWT token from Authorization header.
    
    Decodes the JWT and extracts user information from the Authorization header.
    Verifies custom JWT tokens created by our login endpoint.
    
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
        # Try to decode as custom JWT first (with verification)
        try:
            payload = decode(
                token,
                settings.supabase_service_role_key,
                algorithms=["HS256"],
            )
            
            # Custom JWT format
            uid: str = payload.get("sub")
            email: str | None = payload.get("email")
            token_role = _normalize_role(payload.get("role"))
            department_id = payload.get("department_id")

            if uid is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: missing 'sub' claim",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            return CurrentUser(
                uid=uid,
                email=email,
                aud="authenticated",
                role=token_role,
                department_id=department_id,
            )
        except (DecodeError, ExpiredSignatureError):
            # If custom JWT fails, try Supabase JWT format (backward compatibility)
            payload = decode(
                token,
                options={"verify_signature": False},
                audience="authenticated",
            )

            uid: str = payload.get("sub")
            email: str | None = payload.get("email")
            user_meta = payload.get("user_metadata") or {}
            token_role = _normalize_role(user_meta.get("role"))

            if uid is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: missing 'sub' claim",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            return CurrentUser(
                uid=uid,
                email=email,
                aud=payload.get("aud", "authenticated"),
                role=token_role,
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


async def get_current_user_with_profile(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """
    Get current user with their profile information including role and department.
    
    Fetches the user's role, department, and other profile details from the database.
    
    Args:
        current_user: Base user information from JWT token
        
    Returns:
        CurrentUser: Enhanced user information with role and department
        
    Raises:
        HTTPException: If profile not found or database error
    """
    if current_user.aud == "anonymous":
        # Anonymous users don't have profiles
        return current_user
    
    try:
        from app.supabase_client import get_user_supabase
        
        supabase = get_user_supabase()
        
        profile = None
        # Prefer `user_id` mapping (newer profile shape)
        try:
            response = (
                supabase.table("user_profiles")
                .select("*")
                .eq("user_id", current_user.uid)
                .single()
                .execute()
            )
            profile = response.data
        except Exception:
            profile = None

        # Backward compatibility: some rows were created with `id` instead of `user_id`
        if not profile:
            try:
                response = (
                    supabase.table("user_profiles")
                    .select("*")
                    .eq("id", current_user.uid)
                    .single()
                    .execute()
                )
                profile = response.data
            except Exception:
                profile = None

        if not profile:
            return current_user
        
        # Enhance CurrentUser with profile information
        current_user.role = _normalize_role(profile.get("role")) or current_user.role
        current_user.department_id = profile.get("department_id")
        current_user.is_hod = profile.get("is_hod", False)
        current_user.is_coordinator = profile.get("is_coordinator", False)
        current_user.prn = profile.get("prn")
        current_user.division = profile.get("division")

        # Last-resort role derivation from flags
        if not current_user.role:
            if current_user.is_hod:
                current_user.role = "HOD"
            elif current_user.is_coordinator:
                current_user.role = "COORDINATOR"
        
        return current_user
        
    except Exception as e:
        # If profile fetch fails, return user without profile info
        # This allows basic operations to continue
        print(f"Failed to fetch user profile: {str(e)}")
        return current_user


# Role checking utilities
def require_role(*allowed_roles: str):
    """
    Dependency factory that creates a role checker.
    
    Usage:
        @router.get("/admin-endpoint")
        async def admin_endpoint(current_user: CurrentUser = Depends(require_role("ADMIN", "COORDINATOR"))):
            ...
    
    Args:
        allowed_roles: Variable number of allowed role strings
        
    Returns:
        Callable: Dependency function for FastAPI
    """
    async def role_checker(
        current_user: CurrentUser = Depends(get_current_user_with_profile),
    ) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {', '.join(allowed_roles)}",
            )
        return current_user
    
    return role_checker


def require_hod():
    """
    Dependency that requires user to be a Head of Department.
    
    Usage:
        @router.get("/hod-endpoint")
        async def hod_endpoint(current_user: CurrentUser = Depends(require_hod())):
            ...
    
    Returns:
        Callable: Dependency function for FastAPI
    """
    async def hod_checker(
        current_user: CurrentUser = Depends(get_current_user_with_profile),
    ) -> CurrentUser:
        if not current_user.is_hod:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Only Head of Department can access this resource.",
            )
        return current_user
    
    return hod_checker


def require_coordinator():
    """
    Dependency that requires user to be a Timetable Coordinator.
    
    Usage:
        @router.get("/coordinator-endpoint")
        async def coordinator_endpoint(current_user: CurrentUser = Depends(require_coordinator())):
            ...
    
    Returns:
        Callable: Dependency function for FastAPI
    """
    async def coordinator_checker(
        current_user: CurrentUser = Depends(get_current_user_with_profile),
    ) -> CurrentUser:
        if not current_user.is_coordinator:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Only Timetable Coordinator can access this resource.",
            )
        return current_user
    
    return coordinator_checker


def require_department(*dept_ids: str | None):
    """
    Dependency that checks if user belongs to specified department(s).
    
    Usage:
        @router.get("/dept-endpoint/{dept_id}")
        async def dept_endpoint(
            dept_id: str,
            current_user: CurrentUser = Depends(require_department)
        ):
            # This will verify user belongs to dept_id
    
    Args:
        dept_ids: Department IDs user must belong to (optional)
        
    Returns:
        Callable: Dependency function for FastAPI
    """
    async def department_checker(
        current_user: CurrentUser = Depends(get_current_user_with_profile),
    ) -> CurrentUser:
        if not current_user.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is not assigned to any department.",
            )
        
        if dept_ids and current_user.department_id not in dept_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. User does not belong to this department.",
            )
        
        return current_user
    
    return department_checker

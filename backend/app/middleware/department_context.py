"""Middleware to set department context for RLS policies."""
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
import jwt


class DepartmentContextMiddleware(BaseHTTPMiddleware):
    """
    Middleware that extracts department_id from JWT and sets it in request context.
    
    This ensures RLS policies can access the user's department_id via
    current_setting('request.jwt.claims').
    """
    
    async def dispatch(self, request: Request, call_next):
        # Extract JWT token from Authorization header
        auth_header = request.headers.get("authorization", "")
        
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            
            try:
                # Decode JWT without verification (already verified in auth dependency)
                from app.config import settings
                payload = jwt.decode(
                    token,
                    settings.supabase_service_role_key,
                    algorithms=["HS256"],
                )
                
                # Store JWT claims in request state for RLS
                request.state.jwt_claims = payload
                request.state.department_id = payload.get("department_id")
                request.state.user_role = payload.get("role")
                
            except Exception as e:
                # If decode fails, continue without setting context
                print(f"[MIDDLEWARE] Failed to decode JWT: {str(e)}")
                pass
        
        response = await call_next(request)
        return response

"""Authentication and user profile routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase, get_service_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str
    phone: str
    department: str
    role: str


@router.post("/signup", response_model=SuccessResponse)
async def signup(request: SignupRequest) -> dict:
    """
    Register a new user and create their profile.
    
    Uses service role to safely create user and profile, bypassing RLS.
    """
    try:
        supabase = get_service_supabase()

        # 1. Create Supabase Auth User
        # Using admin.create_user auto-confirms email by default usually, 
        # or we allows sign_up if we want verification flow.
        # For "smooth" flow mentioned by user, let's use sign_up but handle the profile creation with admin rights.
        
        # Actually, using admin.create_user is safer for backend-driven registration
        user_attributes = {
            "email": request.email,
            "password": request.password,
            "email_confirm": True, # Auto-confirm for smoother testing/demo
            "user_metadata": {
                "display_name": request.name,
                "phone": request.phone,
                "department": request.department,
                "role": request.role
            }
        }
        
        auth_response = supabase.auth.admin.create_user(user_attributes)
        
        if not auth_response.user:
            raise Exception("Failed to create user")
            
        user_id = auth_response.user.id

        # 2. Create User Profile
        # Map frontend role name to DB role enum (Allowed: STUDENT, FACULTY, ADMIN, HOD)
        db_role = "ADMIN" # Defaulting 'Time Table Coordinator' to 'ADMIN' as COORDINATOR is not in DB constraint
        if request.role == "Head of Dept":
            db_role = "HOD"
        elif request.role == "Student":
            db_role = "STUDENT"
            
        profile_data = {
            "user_id": user_id,
            "role": db_role,
        }

        # Using service client bypasses RLS
        supabase.table("user_profiles").insert(profile_data).execute()

        return {
            "data": {"user_id": user_id},
            "message": "User registered successfully",
        }

    except Exception as e:
        # Check for specific Supabase errors if needed
        error_msg = str(e)
        print(f"Signup Error: {error_msg}") # Log to console for debugging
        
        # Try to extract more details if it's an HTTP error
        if hasattr(e, 'response') and hasattr(e.response, 'text'):
            print(f"Upstream Response: {e.response.text}")
            error_msg += f" | Details: {e.response.text}"

        if "User already exists" in error_msg:
             raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User already exists",
            )
        
        # Pass through 422 validation errors from Supabase (e.g. password too short)
        if "422" in error_msg or "Unprocessable Entity" in error_msg:
             raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Validation failed (Password must be at least 6 chars): {error_msg}",
            )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Signup failed: {error_msg}",
        )


@router.get("/me", response_model=SuccessResponse)
async def get_current_user_profile(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """
    Get current authenticated user's profile.
    
    Returns basic user information from JWT token and user_profiles table.
    """
    try:
        supabase = get_user_supabase()

        # Fetch user profile from user_profiles table
        # RLS will filter based on current user ID
        response = (
            supabase.table("user_profiles")
            .select("*")
            .eq("user_id", current_user.uid)
            .single()
            .execute()
        )

        return {
            "data": response.data,
            "message": "User profile retrieved successfully",
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch user profile: {str(e)}",
        )


@router.post("/logout", response_model=SuccessResponse)
async def logout(current_user: CurrentUser = Depends(get_current_user)) -> dict:
    """
    Handle user logout.
    
    Frontend should discard JWT token after this call.
    """
    return {"data": None, "message": "Logout successful"}

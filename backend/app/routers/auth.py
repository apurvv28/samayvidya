"""Authentication and user profile routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/auth", tags=["auth"])


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

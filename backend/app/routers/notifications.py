"""Notification management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_service_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=SuccessResponse)
async def list_notifications(
    recipient_email: str,
    limit: int = 10,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List notifications for a specific recipient email."""
    try:
        supabase = get_service_supabase()
        
        response = (
            supabase.table("notification_log")
            .select("*")
            .eq("recipient_email", recipient_email)
            .order("sent_at", desc=True)
            .limit(limit)
            .execute()
        )
        
        return {
            "data": response.data,
            "message": "Notifications retrieved successfully"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch notifications: {str(e)}"
        )


@router.post("/{notification_id}/read", response_model=SuccessResponse)
async def mark_notification_as_read(
    notification_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Mark a notification as read."""
    try:
        supabase = get_service_supabase()
        
        response = (
            supabase.table("notification_log")
            .update({"status": "READ"})
            .eq("notification_id", notification_id)
            .execute()
        )
        
        return {
            "data": response.data,
            "message": "Notification marked as read"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to mark notification as read: {str(e)}"
        )


@router.post("/mark-all-read", response_model=SuccessResponse)
async def mark_all_notifications_as_read(
    recipient_email: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Mark all notifications as read for a recipient."""
    try:
        supabase = get_service_supabase()
        
        response = (
            supabase.table("notification_log")
            .update({"status": "READ"})
            .eq("recipient_email", recipient_email)
            .execute()
        )
        
        return {
            "data": {"updated_count": len(response.data or [])},
            "message": "All notifications marked as read"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to mark all notifications as read: {str(e)}"
        )

"""Password reset and change routes."""
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_service_supabase
from app.schemas.common import SuccessResponse
import secrets
import hashlib

router = APIRouter(prefix="/password", tags=["password"])


class ChangePasswordRequest(BaseModel):
    """Change password with current password verification."""
    current_password: str
    new_password: str
    confirm_password: str


class RequestOTPRequest(BaseModel):
    """Request OTP for password reset."""
    email: EmailStr


class ResetPasswordWithOTPRequest(BaseModel):
    """Reset password using OTP."""
    email: EmailStr
    otp: str
    new_password: str
    confirm_password: str


def _hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    import bcrypt
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def _hash_otp(otp: str) -> str:
    """Hash OTP using SHA-256 (OTPs are temporary, simpler hash is fine)."""
    import hashlib
    return hashlib.sha256(otp.encode()).hexdigest()


def _generate_otp() -> str:
    """Generate a 6-digit OTP."""
    return str(secrets.randbelow(900000) + 100000)


def _send_otp_email(email: str, otp: str, name: str = "User"):
    """Send OTP via email using the email service."""
    from app.services.email_service import _send_email
    
    subject = "Password Reset OTP - Timetable Scheduler"
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #007bff;">Password Reset Request</h2>
                <p>Hello {name},</p>
                <p>You have requested to reset your password. Please use the following One-Time Password (OTP) to proceed:</p>
                
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center;">
                    <h1 style="color: #007bff; font-size: 36px; letter-spacing: 8px; margin: 0;">{otp}</h1>
                </div>
                
                <div style="background-color: #fff3cd; padding: 10px; border-left: 3px solid #ffc107; margin: 20px 0;">
                    <strong>Important:</strong> This OTP is valid for <strong>10 minutes</strong> only.
                </div>
                
                <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
                
                <br>
                <p>Best regards,</p>
                <p><strong>Timetable Scheduler Team</strong></p>
            </div>
        </body>
    </html>
    """
    
    return _send_email(email, subject, html_content)


@router.post("/change", response_model=SuccessResponse)
async def change_password(
    request: ChangePasswordRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Change password with current password verification."""
    import bcrypt
    
    try:
        # Validate new password matches confirmation
        if request.new_password != request.confirm_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password and confirmation do not match"
            )
        
        # Validate new password is different from current
        if request.current_password == request.new_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be different from current password"
            )
        
        # Validate password strength
        if len(request.new_password) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 6 characters long"
            )
        
        supabase = get_service_supabase()
        
        # Get user profile
        user_response = (
            supabase.table("user_profiles")
            .select("user_id, email, password_hash, name")
            .eq("user_id", current_user.uid)
            .single()
            .execute()
        )
        
        if not user_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found"
            )
        
        user_data = user_response.data
        stored_hash = user_data.get("password_hash")
        
        if not stored_hash:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No password set for this account"
            )
        
        # Verify current password using bcrypt
        try:
            if not bcrypt.checkpw(request.current_password.encode('utf-8'), stored_hash.encode('utf-8')):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Current password is incorrect"
                )
        except ValueError:
            # Invalid hash format
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Current password is incorrect"
            )
        
        # Hash new password
        new_hash = _hash_password(request.new_password)
        
        # Update password
        update_response = (
            supabase.table("user_profiles")
            .update({
                "password_hash": new_hash,
                "updated_at": datetime.utcnow().isoformat()
            })
            .eq("user_id", current_user.uid)
            .execute()
        )
        
        print(f"[PASSWORD CHANGE] Password changed successfully for {user_data.get('email')}")
        
        return {
            "data": {"success": True},
            "message": "Password changed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to change password: {str(e)}"
        )


@router.post("/request-otp", response_model=SuccessResponse)
async def request_password_reset_otp(
    request: RequestOTPRequest,
) -> dict:
    """Request OTP for password reset."""
    try:
        supabase = get_service_supabase()
        
        # Check if user exists
        user_response = (
            supabase.table("user_profiles")
            .select("user_id, email, name, role")
            .eq("email", request.email)
            .single()
            .execute()
        )
        
        if not user_response.data:
            # Don't reveal if email exists or not (security best practice)
            return {
                "data": {"success": True},
                "message": "If the email exists, an OTP has been sent"
            }
        
        user_data = user_response.data
        
        # Generate OTP
        otp = _generate_otp()
        otp_hash = _hash_otp(otp)
        expires_at = datetime.utcnow() + timedelta(minutes=10)
        
        # Store OTP in database (create table if needed)
        # Check if OTP record exists
        existing_otp = (
            supabase.table("password_reset_otps")
            .select("id")
            .eq("email", request.email)
            .execute()
        )
        
        if existing_otp.data:
            # Update existing
            supabase.table("password_reset_otps").update({
                "otp_hash": otp_hash,
                "expires_at": expires_at.isoformat(),
                "used": False,
                "created_at": datetime.utcnow().isoformat()
            }).eq("email", request.email).execute()
        else:
            # Insert new
            supabase.table("password_reset_otps").insert({
                "email": request.email,
                "otp_hash": otp_hash,
                "expires_at": expires_at.isoformat(),
                "used": False
            }).execute()
        
        # Send OTP via email (NOT notification_log)
        email_sent = _send_otp_email(
            email=request.email,
            otp=otp,
            name=user_data.get("name", "User")
        )
        
        if not email_sent:
            print(f"[PASSWORD RESET] Failed to send OTP email to {request.email}")
        
        return {
            "data": {"success": True},
            "message": "OTP sent to your email. Valid for 10 minutes."
        }
        
    except Exception as e:
        # Don't reveal specific errors
        print(f"OTP request error: {e}")
        return {
            "data": {"success": True},
            "message": "If the email exists, an OTP has been sent"
        }


@router.post("/reset-with-otp", response_model=SuccessResponse)
async def reset_password_with_otp(
    request: ResetPasswordWithOTPRequest,
) -> dict:
    """Reset password using OTP."""
    try:
        # Validate new password matches confirmation
        if request.new_password != request.confirm_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password and confirmation do not match"
            )
        
        # Validate password strength
        if len(request.new_password) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 6 characters long"
            )
        
        supabase = get_service_supabase()
        
        # Get OTP record
        otp_response = (
            supabase.table("password_reset_otps")
            .select("*")
            .eq("email", request.email)
            .eq("used", False)
            .single()
            .execute()
        )
        
        if not otp_response.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired OTP"
            )
        
        otp_data = otp_response.data
        
        # Check if OTP is expired
        expires_at = datetime.fromisoformat(otp_data["expires_at"].replace("Z", "+00:00"))
        if datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OTP has expired. Please request a new one."
            )
        
        # Verify OTP
        otp_hash = _hash_otp(request.otp)
        if otp_data["otp_hash"] != otp_hash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid OTP"
            )
        
        # Mark OTP as used
        supabase.table("password_reset_otps").update({
            "used": True
        }).eq("email", request.email).execute()
        
        # Get user
        user_response = (
            supabase.table("user_profiles")
            .select("user_id, email, full_name, role")
            .eq("email", request.email)
            .single()
            .execute()
        )
        
        if not user_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        user_data = user_response.data
        
        # Hash new password
        new_hash = _hash_password(request.new_password)
        
        # Update password
        supabase.table("user_profiles").update({
            "password_hash": new_hash,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("user_id", user_data["user_id"]).execute()
        
        print(f"[PASSWORD RESET] Password reset successful for {request.email}")
        
        return {
            "data": {"success": True},
            "message": "Password reset successfully. You can now login with your new password."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset password: {str(e)}"
        )


@router.post("/verify-otp", response_model=SuccessResponse)
async def verify_otp(
    email: EmailStr,
    otp: str,
) -> dict:
    """Verify OTP without resetting password (for UI validation)."""
    try:
        supabase = get_service_supabase()
        
        # Get OTP record
        otp_response = (
            supabase.table("password_reset_otps")
            .select("*")
            .eq("email", email)
            .eq("used", False)
            .single()
            .execute()
        )
        
        if not otp_response.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired OTP"
            )
        
        otp_data = otp_response.data
        
        # Check if OTP is expired
        expires_at = datetime.fromisoformat(otp_data["expires_at"].replace("Z", "+00:00"))
        if datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OTP has expired"
            )
        
        # Verify OTP
        otp_hash = _hash_otp(otp)
        if otp_data["otp_hash"] != otp_hash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid OTP"
            )
        
        return {
            "data": {"valid": True},
            "message": "OTP verified successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP"
        )

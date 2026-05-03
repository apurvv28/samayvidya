"""Coordinator department ownership transfer (email OTP, two-party verification)."""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr, Field

from app.dependencies.auth import get_current_user_with_profile, CurrentUser, require_role, canonical_department_id
from app.supabase_client import get_service_supabase
from app.schemas.common import SuccessResponse
from app.services.email_service import (
    send_coordinator_transfer_old_otp_email,
    send_coordinator_transfer_new_otp_email,
    send_coordinator_transfer_complete_notice,
    send_user_credentials,
)

router = APIRouter(prefix="/auth/coordinator-transfer", tags=["coordinator-transfer"])

OTP_TTL_MINUTES = 10


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.strip().encode()).hexdigest()


def _generate_otp() -> str:
    return str(secrets.randbelow(900000) + 100000)


def _generate_eight_digit_password() -> str:
    return "".join(str(secrets.randbelow(10)) for _ in range(8))


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class VerifyOldOtpBody(BaseModel):
    otp: str = Field(..., min_length=4, max_length=12)


class SendNewCoordinatorBody(BaseModel):
    new_name: str = Field(..., min_length=1, max_length=200)
    new_email: EmailStr


class CompleteTransferBody(BaseModel):
    new_coordinator_otp: str = Field(..., min_length=4, max_length=12)


def _profile_row(supabase, user_id: str) -> dict | None:
    try:
        r = supabase.table("user_profiles").select("*").eq("user_id", user_id).limit(1).execute()
        if r.data:
            return r.data[0]
    except Exception:
        pass
    try:
        r = supabase.table("user_profiles").select("*").eq("id", user_id).limit(1).execute()
        if r.data:
            return r.data[0]
    except Exception:
        pass
    return None


def _cancel_open_sessions(supabase, old_user_id: str) -> None:
    try:
        (
            supabase.table("coordinator_transfer_sessions")
            .delete()
            .eq("old_user_id", old_user_id)
            .in_("status", ["pending_old_otp", "old_verified", "pending_new_otp"])
            .execute()
        )
    except Exception as e:
        print(f"[coordinator-transfer] cancel_open_sessions: {e}")


@router.post("/request-old-otp", response_model=SuccessResponse)
async def request_old_coordinator_otp(
    current_user: CurrentUser = Depends(require_role("COORDINATOR")),
) -> dict:
    """Send OTP to the current coordinator's email to start a transfer."""
    dept = canonical_department_id(current_user.department_id)
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No department assigned to your account.",
        )
    supabase = get_service_supabase()
    prof = _profile_row(supabase, current_user.uid)
    if not prof or not prof.get("email"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Profile not found.")

    otp = _generate_otp()
    otp_hash = _hash_otp(otp)
    expires = (_utcnow() + timedelta(minutes=OTP_TTL_MINUTES)).isoformat()

    try:
        _cancel_open_sessions(supabase, current_user.uid)
        ins = (
            supabase.table("coordinator_transfer_sessions")
            .insert(
                {
                    "department_id": dept,
                    "old_user_id": current_user.uid,
                    "old_email": prof["email"],
                    "old_otp_hash": otp_hash,
                    "old_otp_expires_at": expires,
                    "status": "pending_old_otp",
                }
            )
            .execute()
        )
        if not ins.data:
            raise RuntimeError("insert returned no data")
    except Exception as e:
        print(f"[coordinator-transfer] request-old-otp DB error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Transfer service unavailable. Ensure SQL migration "
                "`backend/sql/002_coordinator_transfer_sessions.sql` is applied."
            ),
        )

    name = prof.get("name") or "Coordinator"
    if not send_coordinator_transfer_old_otp_email(prof["email"], otp, name):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send OTP email. Check SMTP configuration.",
        )

    return {"data": {"expires_in_minutes": OTP_TTL_MINUTES}, "message": "OTP sent to your email."}


@router.post("/verify-old-otp", response_model=SuccessResponse)
async def verify_old_coordinator_otp(
    body: VerifyOldOtpBody,
    current_user: CurrentUser = Depends(require_role("COORDINATOR")),
) -> dict:
    supabase = get_service_supabase()
    try:
        res = (
            supabase.table("coordinator_transfer_sessions")
            .select("*")
            .eq("old_user_id", current_user.uid)
            .eq("status", "pending_old_otp")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception as e:
        print(f"[coordinator-transfer] verify-old-otp: {e}")
        raise HTTPException(status_code=503, detail="Transfer service unavailable.")

    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=400, detail="No active transfer. Request a new OTP first.")

    sess = rows[0]
    exp_raw = sess.get("old_otp_expires_at")
    if exp_raw:
        exp = datetime.fromisoformat(str(exp_raw).replace("Z", "+00:00"))
        if _utcnow() > exp:
            raise HTTPException(status_code=400, detail="OTP expired. Request a new one.")

    if _hash_otp(body.otp) != sess.get("old_otp_hash"):
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    sid = sess["session_id"]
    supabase.table("coordinator_transfer_sessions").update(
        {
            "old_verified_at": _utcnow().isoformat(),
            "old_otp_hash": None,
            "old_otp_expires_at": None,
            "status": "old_verified",
            "updated_at": _utcnow().isoformat(),
        }
    ).eq("session_id", sid).execute()

    return {"data": {"session_id": sid}, "message": "Identity verified. Enter the new coordinator details."}


@router.post("/send-new-coordinator-otp", response_model=SuccessResponse)
async def send_new_coordinator_otp(
    body: SendNewCoordinatorBody,
    current_user: CurrentUser = Depends(require_role("COORDINATOR")),
) -> dict:
    new_email = str(body.new_email).strip().lower()
    supabase = get_service_supabase()

    existing = (
        supabase.table("user_profiles").select("user_id").eq("email", new_email).limit(1).execute().data
        or []
    )
    if existing:
        raise HTTPException(status_code=400, detail="That email is already registered. Use a different email.")

    prof = _profile_row(supabase, current_user.uid)
    if prof and prof.get("email", "").strip().lower() == new_email:
        raise HTTPException(status_code=400, detail="New coordinator email must differ from your current email.")

    try:
        res = (
            supabase.table("coordinator_transfer_sessions")
            .select("*")
            .eq("old_user_id", current_user.uid)
            .eq("status", "old_verified")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception as e:
        print(f"[coordinator-transfer] send-new: {e}")
        raise HTTPException(status_code=503, detail="Transfer service unavailable.")

    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=400, detail="Verify your email OTP first.")

    sess = rows[0]
    otp = _generate_otp()
    otp_hash = _hash_otp(otp)
    expires = (_utcnow() + timedelta(minutes=OTP_TTL_MINUTES)).isoformat()

    supabase.table("coordinator_transfer_sessions").update(
        {
            "new_coordinator_name": body.new_name.strip(),
            "new_coordinator_email": new_email,
            "new_otp_hash": otp_hash,
            "new_otp_expires_at": expires,
            "status": "pending_new_otp",
            "updated_at": _utcnow().isoformat(),
        }
    ).eq("session_id", sess["session_id"]).execute()

    if not send_coordinator_transfer_new_otp_email(
        new_email,
        otp,
        body.new_name.strip(),
        sess.get("old_email") or "",
    ):
        raise HTTPException(status_code=502, detail="Failed to send OTP to the new coordinator email.")

    return {
        "data": {"session_id": sess["session_id"]},
        "message": "OTP sent to the new coordinator email. Enter it below to complete the transfer.",
    }


@router.post("/complete", response_model=SuccessResponse)
async def complete_coordinator_transfer(
    body: CompleteTransferBody,
    current_user: CurrentUser = Depends(require_role("COORDINATOR")),
) -> dict:
    supabase = get_service_supabase()
    try:
        res = (
            supabase.table("coordinator_transfer_sessions")
            .select("*")
            .eq("old_user_id", current_user.uid)
            .eq("status", "pending_new_otp")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception as e:
        print(f"[coordinator-transfer] complete: {e}")
        raise HTTPException(status_code=503, detail="Transfer service unavailable.")

    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=400, detail="No transfer awaiting the new coordinator OTP.")

    sess = rows[0]
    exp_raw = sess.get("new_otp_expires_at")
    if exp_raw:
        exp = datetime.fromisoformat(str(exp_raw).replace("Z", "+00:00"))
        if _utcnow() > exp:
            raise HTTPException(status_code=400, detail="OTP expired. Start the process again.")

    if _hash_otp(body.new_coordinator_otp) != sess.get("new_otp_hash"):
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    new_email = sess.get("new_coordinator_email")
    new_name = sess.get("new_coordinator_name")
    dept_id = sess.get("department_id")
    old_uid = sess.get("old_user_id")
    old_email = sess.get("old_email")

    if not new_email or not new_name or not dept_id:
        raise HTTPException(status_code=500, detail="Transfer session is corrupted.")

    dup = (
        supabase.table("user_profiles").select("user_id").eq("email", new_email).limit(1).execute().data or []
    )
    if dup:
        raise HTTPException(status_code=409, detail="New email was registered during the transfer. Aborting.")

    plain_password = _generate_eight_digit_password()
    password_hash = _hash_password(plain_password)
    new_user_id = str(uuid.uuid4())

    profile_payload = {
        "user_id": new_user_id,
        "email": new_email,
        "password_hash": password_hash,
        "name": new_name,
        "phone": "",
        "role": "COORDINATOR",
        "department_id": dept_id,
        "is_hod": False,
        "is_coordinator": True,
    }

    try:
        supabase.table("user_profiles").insert(profile_payload).execute()
    except Exception as e:
        print(f"[coordinator-transfer] insert new user: {e}")
        raise HTTPException(status_code=500, detail="Could not create the new coordinator account.")

    # Remove old coordinator login (support legacy rows keyed by id)
    try:
        supabase.table("user_profiles").delete().eq("user_id", old_uid).execute()
    except Exception:
        pass
    try:
        supabase.table("user_profiles").delete().eq("id", old_uid).execute()
    except Exception:
        pass

    supabase.table("coordinator_transfer_sessions").update(
        {"status": "completed", "updated_at": _utcnow().isoformat()}
    ).eq("session_id", sess["session_id"]).execute()

    send_user_credentials(
        to_email=new_email,
        name=new_name,
        password=plain_password,
        role="COORDINATOR",
        identifier=None,
    )
    if old_email:
        send_coordinator_transfer_complete_notice(
            old_email=old_email,
            new_name=new_name,
            new_email=new_email,
        )

    return {
        "data": {"new_coordinator_email": new_email},
        "message": "Ownership transferred. The new coordinator received login credentials by email. Please sign out.",
    }

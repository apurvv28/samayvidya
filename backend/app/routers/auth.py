"""Authentication and user profile routes."""
import csv
import io
import secrets
import string
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser, get_current_user_with_profile, require_role
from app.supabase_client import get_user_supabase, get_service_supabase
from app.schemas.common import SuccessResponse
from app.services.email_service import send_user_credentials

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str
    phone: str
    department_id: str | None = None
    """Department UUID if user is coordinator/HOD"""
    department_name: str | None = None
    """Department name as fallback (will be resolved to ID)"""
    role: str
    """Role: 'Time Table Coordinator', 'Head of Dept', or 'Student'"""


class CoordinatorUserCreateRequest(BaseModel):
    name: str
    email: str
    department_id: str
    role: str


class StudentEnrollmentUpdateRequest(BaseModel):
    department_id: str
    division: str


def _generate_random_password(length: int = 12) -> str:
    chars = string.ascii_letters + string.digits + "!@#$%&*"
    return "".join(secrets.choice(chars) for _ in range(length))


def _normalize_role(value: str) -> str:
    mapping = {
        "FACULTY": "FACULTY",
        "HOD": "HOD",
        "HEAD OF DEPT": "HOD",
        "HEAD OF DEPARTMENT": "HOD",
        "COORDINATOR": "COORDINATOR",
        "TIME TABLE COORDINATOR": "COORDINATOR",
        "STUDENT": "STUDENT",
    }
    key = " ".join(str(value or "").strip().upper().replace("-", " ").replace("_", " ").split())
    return mapping.get(key, key)


def _upsert_profile_with_compat(supabase, payload: dict) -> None:
    """Support both old/new user_profiles shapes across environments."""
    user_id = payload.get("user_id")
    try:
        supabase.table("user_profiles").upsert(payload).execute()
        return
    except Exception:
        pass

    fallback = dict(payload)
    if user_id:
        fallback["id"] = user_id
    fallback.pop("user_id", None)
    supabase.table("user_profiles").upsert(fallback).execute()


@router.post("/signup", response_model=SuccessResponse)
async def signup(request: SignupRequest) -> dict:
    """
    Register a new user and create their profile with role-based access.
    
    Handles role assignment:
    - 'Time Table Coordinator' -> COORDINATOR role
    - 'Head of Dept' -> HOD role
    - 'Student' -> STUDENT role
    
    Uses service role to safely create user and profile, bypassing RLS.
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Public registration is disabled. Please contact coordinator for account creation.",
    )


@router.post("/coordinator/users", response_model=SuccessResponse)
async def coordinator_create_user(
    request: CoordinatorUserCreateRequest,
    current_user: CurrentUser = Depends(require_role("COORDINATOR", "ADMIN")),
) -> dict:
    """Coordinator-only manual creation for FACULTY/HOD users."""
    role = _normalize_role(request.role)
    if role not in {"FACULTY", "HOD"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only FACULTY or HOD can be created via this endpoint.",
        )
    if current_user.role == "COORDINATOR" and current_user.department_id and request.department_id != current_user.department_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Coordinators can only create users in their own department.",
        )

    try:
        supabase = get_service_supabase()
        password = _generate_random_password()

        user_attributes = {
            "email": request.email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {
                "display_name": request.name,
                "role": role,
                "department_id": request.department_id,
            },
        }
        auth_response = supabase.auth.admin.create_user(user_attributes)
        if not auth_response.user:
            raise Exception("Failed to create auth user")

        user_id = str(auth_response.user.id)
        profile_payload = {
            "user_id": user_id,
            "email": request.email,
            "role": role,
            "department_id": request.department_id,
            "is_hod": role == "HOD",
            "is_coordinator": False,
        }
        _upsert_profile_with_compat(supabase, profile_payload)

        # Email only for FACULTY/HOD as requested
        send_user_credentials(
            to_email=request.email,
            name=request.name,
            password=password,
            role=role,
            identifier=user_id,
        )

        return {
            "data": {
                "user_id": user_id,
                "email": request.email,
                "role": role,
                "department_id": request.department_id,
            },
            "message": f"{role} user created successfully.",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create user: {str(e)}",
        )


@router.post("/coordinator/students/upload", response_model=SuccessResponse)
async def coordinator_upload_students_csv(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_role("COORDINATOR", "ADMIN")),
) -> dict:
    """Coordinator-only CSV upload to create STUDENT accounts (password=PRN, no email sent)."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a valid CSV file.")

    try:
        content = await file.read()
        decoded = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(decoded))
        if not reader.fieldnames:
            raise HTTPException(status_code=400, detail="CSV file has no headers.")

        headers = {h.strip().lower(): h for h in reader.fieldnames if h}
        required = ["name", "email", "prn", "department_id", "division"]
        missing = [col for col in required if col not in headers]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required columns: {', '.join(missing)}",
            )

        supabase = get_service_supabase()
        created = 0
        failed = 0
        errors: list[str] = []

        for idx, row in enumerate(reader, start=2):
            try:
                name = (row.get(headers["name"]) or "").strip()
                email = (row.get(headers["email"]) or "").strip().lower()
                prn = (row.get(headers["prn"]) or "").strip()
                department_id = (row.get(headers["department_id"]) or "").strip()
                division = (row.get(headers["division"]) or "").strip()

                if not email or not prn or not department_id or not division:
                    raise ValueError("email, prn, department_id and division are required")
                if (
                    current_user.role == "COORDINATOR"
                    and current_user.department_id
                    and department_id != current_user.department_id
                ):
                    raise ValueError("coordinator cannot create students outside their department")

                auth_response = supabase.auth.admin.create_user(
                    {
                        "email": email,
                        "password": prn,
                        "email_confirm": True,
                        "user_metadata": {
                            "display_name": name or email,
                            "role": "STUDENT",
                            "prn": prn,
                            "department_id": department_id,
                            "division": division,
                        },
                    }
                )
                if not auth_response.user:
                    raise ValueError("Auth user creation failed")

                user_id = str(auth_response.user.id)
                _upsert_profile_with_compat(
                    supabase,
                    {
                        "user_id": user_id,
                        "email": email,
                        "role": "STUDENT",
                        "department_id": department_id,
                        "prn": prn,
                        "division": division,
                        "is_hod": False,
                        "is_coordinator": False,
                    },
                )
                created += 1
            except Exception as row_error:
                failed += 1
                errors.append(f"Row {idx}: {str(row_error)}")

        return {
            "data": {
                "created": created,
                "failed": failed,
                "errors": errors[:25],
            },
            "message": f"Student CSV processed. Created {created}, failed {failed}.",
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process student CSV: {str(e)}",
        )


@router.get("/me", response_model=SuccessResponse)
async def get_current_user_profile(
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """
    Get current authenticated user's profile with role and department info.
    
    Returns complete user information including role, department, and access flags.
    """
    try:
        return {
            "data": {
                "user_id": current_user.uid,
                "email": current_user.email,
                "role": current_user.role,
                "department_id": current_user.department_id,
                "prn": current_user.prn,
                "division": current_user.division,
                "is_hod": current_user.is_hod,
                "is_coordinator": current_user.is_coordinator,
            },
            "message": "User profile retrieved successfully",
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch user profile: {str(e)}",
        )


@router.put("/me/enrollment", response_model=SuccessResponse)
async def update_student_enrollment(
    payload: StudentEnrollmentUpdateRequest,
    current_user: CurrentUser = Depends(require_role("STUDENT")),
) -> dict:
    """Persist student department/division enrollment on profile."""
    try:
        supabase = get_service_supabase()
        update_payload = {
            "department_id": payload.department_id,
            "division": payload.division,
        }

        response = (
            supabase.table("user_profiles")
            .update(update_payload)
            .eq("user_id", current_user.uid)
            .execute()
        )
        if not (response.data or []):
            # Fallback for legacy profile rows keyed by `id`
            response = (
                supabase.table("user_profiles")
                .update(update_payload)
                .eq("id", current_user.uid)
                .execute()
            )

        return {
            "data": {
                "department_id": payload.department_id,
                "division": payload.division,
            },
            "message": "Student enrollment updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update enrollment: {str(e)}",
        )


@router.post("/logout", response_model=SuccessResponse)
async def logout(current_user: CurrentUser = Depends(get_current_user)) -> dict:
    """
    Handle user logout.
    
    Frontend should discard JWT token after this call.
    """
    return {"data": None, "message": "Logout successful"}


@router.get("/departments", response_model=SuccessResponse)
async def get_departments() -> dict:
    """
    Get list of all available departments for signup/assignment.
    
    This is a public endpoint used during signup to let users select their department.
    """
    try:
        supabase = get_service_supabase()
        
        response = (
            supabase.table("departments")
            .select("department_id, department_name")
            .execute()
        )
        
        return {
            "data": response.data or [],
            "message": "Departments retrieved successfully",
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch departments: {str(e)}",
        )


@router.get("/users-by-role", response_model=SuccessResponse)
async def get_users_by_role(
    role: str = None,
    department_id: str = None,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """
    Get list of users filtered by role and/or department.
    
    Only coordinators and admins can access this endpoint.
    """
    try:
        # Check if user has permission to view users
        if current_user.role not in ["COORDINATOR", "ADMIN"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only coordinators and admins can view user lists",
            )
        
        supabase = get_user_supabase()
        
        query = supabase.table("user_profiles").select("*")
        
        if role:
            query = query.eq("role", role)
        
        if department_id and current_user.role == "COORDINATOR":
            # Coordinators can only see users in their department
            if current_user.department_id != department_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only view users in your department",
                )
            query = query.eq("department_id", department_id)
        elif department_id:
            query = query.eq("department_id", department_id)
        
        response = query.execute()
        
        return {
            "data": response.data or [],
            "message": "Users retrieved successfully",
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch users: {str(e)}",
        )

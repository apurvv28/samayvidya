"""Authentication and user profile routes."""
import csv
import io
import secrets
import string
import bcrypt
import uuid
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
    new_department_name: str | None = None
    """New department name for coordinator self-registration"""
    new_department_code: str | None = None
    """New department code for coordinator self-registration"""
    role: str
    """Role: 'Time Table Coordinator', 'Head of Dept', or 'Student'"""


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict


class CoordinatorUserCreateRequest(BaseModel):
    name: str
    email: str
    department_id: str
    role: str


class StudentEnrollmentUpdateRequest(BaseModel):
    department_id: str
    division: str


class StaffProfileUpdateRequest(BaseModel):
    """Update name / phone on user_profiles (staff)."""

    name: str | None = None
    phone: str | None = None


def _generate_random_password(length: int = 12) -> str:
    chars = string.ascii_letters + string.digits + "!@#$%&*"
    return "".join(secrets.choice(chars) for _ in range(length))


def _hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def _verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


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
    Register a new coordinator and create their department.
    
    Uses custom authentication (no Supabase Auth) - stores credentials in user_profiles table.
    
    Coordinators create their own department during registration.
    """
    try:
        supabase = get_service_supabase()
        
        # Normalize role
        role = _normalize_role(request.role)
        print(f"[SIGNUP] Starting signup for {request.email} with role {role}")
        
        # Check if email already exists
        existing_user = (
            supabase.table("user_profiles")
            .select("email")
            .eq("email", request.email)
            .execute()
        )
        
        if existing_user.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered. Please use a different email or login.",
            )
        
        # Handle department creation for coordinators
        department_id = request.department_id
        
        if role == "COORDINATOR":
            # Coordinator must create a new department
            if request.new_department_name and request.new_department_code:
                print(f"[SIGNUP] Creating new department: {request.new_department_name} ({request.new_department_code})")
                
                # Create new department
                dept_data = {
                    "department_name": request.new_department_name.strip(),
                    "department_code": request.new_department_code.strip().upper(),
                }
                
                # Check if department code already exists
                try:
                    existing_dept = (
                        supabase.table("departments")
                        .select("department_id")
                        .eq("department_code", dept_data["department_code"])
                        .execute()
                    )
                    print(f"[SIGNUP] Department code check result: {existing_dept.data}")
                except Exception as dept_check_error:
                    print(f"[SIGNUP ERROR] Failed to check department code: {str(dept_check_error)}")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Database error checking department code: {str(dept_check_error)}",
                    )
                
                if existing_dept.data:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Department code '{dept_data['department_code']}' already exists. Please choose a different code.",
                    )
                
                # Create department
                try:
                    dept_response = (
                        supabase.table("departments")
                        .insert(dept_data)
                        .execute()
                    )
                    print(f"[SIGNUP] Department created: {dept_response.data}")
                except Exception as dept_create_error:
                    print(f"[SIGNUP ERROR] Failed to create department: {str(dept_create_error)}")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Failed to create department: {str(dept_create_error)}",
                    )
                
                if not dept_response.data:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Failed to create department - no data returned",
                    )
                
                department_id = dept_response.data[0]["department_id"]
                print(f"[SIGNUP] Department ID: {department_id}")
            
            elif not department_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Coordinator must provide department information",
                )
        
        elif role in ["HOD", "FACULTY"]:
            # HOD and Faculty must select existing department
            if not department_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{role} must be assigned to an existing department",
                )
        
        # Hash the password
        print(f"[SIGNUP] Hashing password for {request.email}")
        password_hash = _hash_password(request.password)
        
        # Generate user ID
        user_id = str(uuid.uuid4())
        
        # Create user profile with hashed password
        print(f"[SIGNUP] Creating user profile for {request.email}")
        profile_payload = {
            "user_id": user_id,
            "email": request.email,
            "password_hash": password_hash,
            "name": request.name,
            "phone": request.phone,
            "role": role,
            "department_id": department_id,
            "is_hod": role == "HOD",
            "is_coordinator": role == "COORDINATOR",
        }
        
        try:
            profile_response = (
                supabase.table("user_profiles")
                .insert(profile_payload)
                .execute()
            )
            print(f"[SIGNUP] User profile created successfully")
        except Exception as profile_error:
            print(f"[SIGNUP ERROR] Failed to create user profile: {str(profile_error)}")
            # If profile creation fails, try to clean up the department
            if role == "COORDINATOR" and department_id:
                try:
                    supabase.table("departments").delete().eq("department_id", department_id).execute()
                    print(f"[SIGNUP] Cleaned up department {department_id} after profile creation failure")
                except:
                    pass
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to create user profile: {str(profile_error)}",
            )
        
        print(f"[SIGNUP] Signup completed successfully for {request.email}")
        return {
            "data": {
                "user_id": user_id,
                "email": request.email,
                "role": role,
                "department_id": department_id,
            },
            "message": "Account created successfully! Please log in.",
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[SIGNUP ERROR] Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create account: {str(e)}",
        )


@router.post("/login")
async def login(request: LoginRequest) -> dict:
    """
    Custom login endpoint using email and password.
    
    Verifies credentials against user_profiles table (for staff) or students table (for students).
    Returns a JWT token.
    """
    try:
        supabase = get_service_supabase()
        
        print(f"[LOGIN] Login attempt for {request.email}")
        
        # Try user_profiles first (for coordinators, HOD, faculty)
        user_response = (
            supabase.table("user_profiles")
            .select("*")
            .eq("email", request.email)
            .execute()
        )
        
        if user_response.data:
            # Staff login (coordinator, HOD, faculty)
            user = user_response.data[0]
            
            # Verify password
            if not user.get("password_hash"):
                print(f"[LOGIN] No password hash for user: {request.email}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password",
                )
            
            if not _verify_password(request.password, user["password_hash"]):
                print(f"[LOGIN] Invalid password for user: {request.email}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password",
                )
            
            # Generate JWT token for staff
            from datetime import datetime, timedelta
            import jwt
            from app.config import settings
            
            payload = {
                "sub": user["user_id"],
                "email": user["email"],
                "role": user["role"],
                "department_id": user.get("department_id"),
                "exp": datetime.utcnow() + timedelta(days=7),
                "iat": datetime.utcnow(),
            }
            
            token = jwt.encode(payload, settings.supabase_service_role_key, algorithm="HS256")
            
            print(f"[LOGIN] Staff login successful for {request.email}")
            
            return {
                "access_token": token,
                "token_type": "bearer",
                "user": {
                    "user_id": user["user_id"],
                    "email": user["email"],
                    "name": user.get("name"),
                    "role": user["role"],
                    "department_id": user.get("department_id"),
                    "is_hod": user.get("is_hod", False),
                    "is_coordinator": user.get("is_coordinator", False),
                },
            }
        
        # Try students table (for student login)
        student_response = (
            supabase.table("students")
            .select("*, divisions(department_id)")
            .eq("email", request.email)
            .execute()
        )
        
        if not student_response.data:
            print(f"[LOGIN] User/Student not found: {request.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        
        student = student_response.data[0]
        
        # Verify password
        if not student.get("password_hash"):
            print(f"[LOGIN] No password hash for student: {request.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        
        if not _verify_password(request.password, student["password_hash"]):
            print(f"[LOGIN] Invalid password for student: {request.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        
        # Generate JWT token for student
        from datetime import datetime, timedelta
        import jwt
        from app.config import settings
        
        # Get department_id from division
        department_id = student.get("divisions", {}).get("department_id") if student.get("divisions") else None
        
        # Use student_id as the unique identifier (not user_id which may be null)
        student_id = student.get("student_id")
        
        payload = {
            "sub": student_id,  # Use student_id instead of user_id
            "email": student["email"],
            "role": "STUDENT",
            "department_id": department_id,
            "division_id": student.get("division_id"),
            "prn": student.get("prn_number"),
            "exp": datetime.utcnow() + timedelta(days=7),
            "iat": datetime.utcnow(),
        }
        
        token = jwt.encode(payload, settings.supabase_service_role_key, algorithm="HS256")
        
        print(f"[LOGIN] Student login successful for {request.email}")
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "user_id": student_id,  # Use student_id
                "email": student["email"],
                "name": student.get("student_name"),
                "role": "STUDENT",
                "department_id": department_id,
                "division_id": student.get("division_id"),
                "prn": student.get("prn_number"),
                "is_hod": False,
                "is_coordinator": False,
            },
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[LOGIN ERROR] Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {str(e)}",
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
    Works with both custom JWT and Supabase Auth tokens.
    """
    try:
        name = None
        phone = None
        try:
            supabase = get_service_supabase()
            row = None
            try:
                r = (
                    supabase.table("user_profiles")
                    .select("name, phone")
                    .eq("user_id", current_user.uid)
                    .limit(1)
                    .execute()
                )
                if r.data:
                    row = r.data[0]
            except Exception:
                pass
            if not row:
                r2 = (
                    supabase.table("user_profiles")
                    .select("name, phone")
                    .eq("id", current_user.uid)
                    .limit(1)
                    .execute()
                )
                if r2.data:
                    row = r2.data[0]
            if row:
                name = row.get("name")
                phone = row.get("phone")
        except Exception:
            pass

        return {
            "data": {
                "user_id": current_user.uid,
                "email": current_user.email,
                "name": name,
                "phone": phone,
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


@router.put("/me/profile", response_model=SuccessResponse)
async def update_staff_profile(
    payload: StaffProfileUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Update staff user name/phone on user_profiles (coordinator, HOD, faculty, admin)."""
    if current_user.role not in {"COORDINATOR", "HOD", "FACULTY", "ADMIN"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only staff accounts can update this profile.",
        )
    if payload.name is None and payload.phone is None:
        raise HTTPException(status_code=400, detail="Nothing to update.")

    update_data: dict = {}
    if payload.name is not None:
        update_data["name"] = payload.name.strip() or None
    if payload.phone is not None:
        update_data["phone"] = payload.phone.strip() or None

    try:
        supabase = get_service_supabase()
        res = (
            supabase.table("user_profiles")
            .update(update_data)
            .eq("user_id", current_user.uid)
            .execute()
        )
        if not (res.data or []):
            res = (
                supabase.table("user_profiles")
                .update(update_data)
                .eq("id", current_user.uid)
                .execute()
            )
        if not (res.data or []):
            raise HTTPException(status_code=404, detail="User profile not found.")
        return {"data": update_data, "message": "Profile updated successfully."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update profile: {str(e)}",
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

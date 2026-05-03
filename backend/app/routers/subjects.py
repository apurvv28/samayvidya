"""Subjects management routes."""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import (
    get_current_user_with_profile,
    CurrentUser,
    resolve_effective_department_id,
)
from app.supabase_client import get_user_supabase, get_service_supabase
from app.schemas.common import SuccessResponse, SubjectTypeEnum

router = APIRouter(prefix="/subjects", tags=["subjects"])


def _expand_year_aliases(year: str) -> list[str]:
    normalized = (year or "").strip()
    lowered = normalized.casefold()

    aliases: set[str] = {normalized, lowered}
    if lowered in {"sy", "second year", "second year (sy)"}:
        aliases.update({"SY", "sy", "Second Year", "second year", "Second Year (SY)", "second year (sy)"})
    elif lowered in {"ty", "third year", "third year (ty)"}:
        aliases.update({"TY", "ty", "Third Year", "third year", "Third Year (TY)", "third year (ty)"})
    elif lowered in {"btech", "b.tech", "b tech", "be", "b.e."}:
        aliases.update({"BTech", "btech", "B.Tech", "b.tech", "B Tech", "b tech", "BE", "be", "B.E.", "b.e."})

    return sorted(aliases)


class SubjectCreate(BaseModel):
    """Create subject request."""

    subject_id: str
    subject_name: str
    subject_type: SubjectTypeEnum
    credits: int
    hours_per_week: int
    theory_hours: int = 0
    lab_hours: int = 0
    tutorial_hours: int = 0
    requires_continuity: bool
    department_id: str
    year: str
    delivery_mode: str = "OFFLINE"
    is_theory_online: bool = False
    is_lab_online: bool = False
    is_tutorial_online: bool = False
    sub_short_form: str | None = None


class SubjectUpdate(BaseModel):
    """Update subject request."""

    subject_name: str | None = None
    subject_type: SubjectTypeEnum | None = None
    credits: int | None = None
    hours_per_week: int | None = None
    theory_hours: int | None = None
    lab_hours: int | None = None
    tutorial_hours: int | None = None
    requires_continuity: bool | None = None
    delivery_mode: str | None = None
    is_theory_online: bool | None = None
    is_lab_online: bool | None = None
    is_tutorial_online: bool | None = None
    sub_short_form: str | None = None


@router.get("", response_model=SuccessResponse)
async def list_subjects(
    year: str | None = None,
    department_id: str | None = None,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """List subjects with department filtering enforced."""
    try:
        supabase = get_service_supabase()

        target_dept_id = resolve_effective_department_id(current_user, department_id)

        print(f"[SUBJECTS] User: {current_user.email}, Role: {current_user.role}, Department: {target_dept_id}")

        if current_user.role != "ADMIN":
            if not target_dept_id:
                print(f"[SUBJECTS] No department assigned for user {current_user.email}")
                return {
                    "data": [],
                    "message": "No subjects found. Please contact admin to assign you to a department.",
                }

        # Fetch subjects from public.subjects with department name for semester view.
        query = supabase.table("subjects").select(
            "subject_id, subject_name, subject_type, credits, hours_per_week, requires_continuity, "
            "department_id, theory_hours, lab_hours, tutorial_hours, year, delivery_mode, "
            "is_theory_online, is_lab_online, is_tutorial_online, sub_short_form, "
            "departments(department_name)"
        )

        if year:
            query = query.eq("year", year)
            print(f"[SUBJECTS] Filtering by year: {year}")

        if current_user.role != "ADMIN":
            query = query.eq("department_id", target_dept_id)
            print(f"[SUBJECTS] Filtering by department_id: {target_dept_id}")
        elif target_dept_id:
            query = query.eq("department_id", target_dept_id)
            print(f"[SUBJECTS] Admin filter department_id: {target_dept_id}")
            
        response = query.order("subject_name").execute()
        print(f"[SUBJECTS] Found {len(response.data or [])} subjects")
        
        # Return helpful message if no data
        if not response.data:
            return {
                "data": [],
                "message": "No subjects found. Click 'Add Subject' to create your first subject."
            }
        
        return {"data": response.data, "message": "Subjects retrieved successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[SUBJECTS ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch subjects: {str(e)}",
        )


@router.get("/{subject_id}", response_model=SuccessResponse)
async def get_subject(
    subject_id: str,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Get a specific subject by ID."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("subjects")
            .select("*")
            .eq("subject_id", subject_id)
            .single()
            .execute()
        )
        return {
            "data": response.data,
            "message": "Subject retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Subject not found: {str(e)}",
        )


@router.post("", response_model=SuccessResponse)
async def create_subject(
    subject: SubjectCreate,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Create a new subject with department validation."""
    try:
        # Validate user can create subjects for this department
        if current_user.role != "ADMIN" and subject.department_id != current_user.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only create subjects for your own department",
            )
        
        supabase = get_service_supabase()
        response = (
            supabase.table("subjects").insert(subject.model_dump()).execute()
        )
        return {
            "data": response.data,
            "message": "Subject created successfully",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create subject: {str(e)}",
        )


@router.put("/{subject_id}", response_model=SuccessResponse)
async def update_subject(
    subject_id: str,
    subject: SubjectUpdate,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Update a subject."""
    try:
        supabase = get_user_supabase()
        update_data = subject.model_dump(exclude_unset=True)
        response = (
            supabase.table("subjects")
            .update(update_data)
            .eq("subject_id", subject_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Subject updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update subject: {str(e)}",
        )


@router.delete("/{subject_id}", response_model=SuccessResponse)
async def delete_subject(
    subject_id: str,
    current_user: CurrentUser = Depends(get_current_user_with_profile),
) -> dict:
    """Delete a subject (Service Role - Bypasses RLS)."""
    try:
        supabase = get_service_supabase()
        response = (
            supabase.table("subjects")
            .delete()
            .eq("subject_id", subject_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Subject deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete subject: {str(e)}",
        )

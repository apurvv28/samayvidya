"""Divisions management routes."""
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase, get_service_supabase
from app.schemas.common import SuccessResponse
import csv
import io
import asyncio
from typing import List

router = APIRouter(prefix="/divisions", tags=["divisions"])


class DivisionCreate(BaseModel):
    """Create division request."""

    division_name: str
    year: str
    department_id: str
    student_count: int
    min_working_days: int
    max_working_days: int
    earliest_start_time: str
    latest_end_time: str


class DivisionUpdate(BaseModel):
    """Update division request."""

    division_name: str | None = None
    year: str | None = None
    student_count: int | None = None
    min_working_days: int | None = None
    max_working_days: int | None = None
    earliest_start_time: str | None = None
    latest_end_time: str | None = None


@router.get("", response_model=SuccessResponse)
async def list_divisions(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all divisions (Service Role - Bypasses RLS)."""
    try:
        supabase = get_service_supabase()
        response = supabase.table("divisions").select("*").execute()
        return {"data": response.data, "message": "Divisions retrieved successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch divisions: {str(e)}",
        )
# ... (skip get_division) ...
@router.post("", response_model=SuccessResponse)
async def create_division(
    division: DivisionCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Create a new division."""
    try:
        supabase = get_service_supabase()
        response = (
            supabase.table("divisions").insert(division.model_dump()).execute()
        )
        return {
            "data": response.data,
            "message": "Division created successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create division: {str(e)}",
        )


@router.put("/{division_id}", response_model=SuccessResponse)
async def update_division(
    division_id: str,
    division: DivisionUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Update a division."""
    try:
        supabase = get_user_supabase()
        update_data = division.model_dump(exclude_unset=True)
        response = (
            supabase.table("divisions")
            .update(update_data)
            .eq("division_id", division_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Division updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update division: {str(e)}",
        )


@router.delete("/{division_id}", response_model=SuccessResponse)
async def delete_division(
    division_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete a division."""
    try:
        supabase = get_user_supabase()
        response = (
            supabase.table("divisions")
            .delete()
            .eq("division_id", division_id)
            .execute()
        )
        return {
            "data": response.data,
            "message": "Division deleted successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete division: {str(e)}",
        )


@router.post("/{division_id}/students/upload", response_model=SuccessResponse)
async def upload_student_csv(
    division_id: str,
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Upload and process student CSV for a division."""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a CSV file.")

    try:
        content = await file.read()
        decoded_content = content.decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(decoded_content))
        
        # Verify Headers
        required_headers = ['Student Name', 'PRN Number', 'Email']
        if not all(header in csv_reader.fieldnames for header in required_headers):
             raise HTTPException(status_code=400, detail=f"Invalid CSV headers. Required: {', '.join(required_headers)}")

        students_to_process = list(csv_reader)
        if not students_to_process:
             raise HTTPException(status_code=400, detail="CSV file is empty.")

        supabase = get_service_supabase() # Use service role for Auth and Insert
        results = {"success": 0, "failed": 0, "errors": []}

        # Validate Division Exists
        div_check = supabase.table("divisions").select("division_id").eq("division_id", division_id).execute()
        if not div_check.data:
            raise HTTPException(status_code=404, detail="Division not found.")

        # Process each student
        for row in students_to_process:
            name = row.get('Student Name', '').strip()
            prn = row.get('PRN Number', '').strip()
            email = row.get('Email', '').strip()

            if not all([name, prn, email]):
                results["failed"] += 1
                results["errors"].append(f"Skipped row with missing data: {row}")
                continue

            try:
                # 1. Create Supabase Auth User
                user_id = None
                try:
                    user_attributes = {
                        "email": email,
                        "password": prn, # PRN as password
                        "email_confirm": True,
                        "user_metadata": {
                            "full_name": name,
                            "role": "STUDENT",
                            "prn": prn
                        }
                    }
                    auth_response = supabase.auth.admin.create_user(user_attributes)
                    user_id = auth_response.user.id
                except Exception as auth_error:
                    if "User already registered" in str(auth_error) or "duplicate key" in str(auth_error):
                         results["failed"] += 1
                         results["errors"].append(f"User already exists: {email}")
                         continue
                    else:
                        raise auth_error

                # 2. Create Profile
                if user_id:
                     profile_data = {
                        "id": user_id,
                        "email": email,
                        "full_name": name,
                        "role": "STUDENT",
                        "is_active": True
                    }
                     supabase.table("user_profiles").upsert(profile_data).execute()

                # 3. Insert into Students Table
                if user_id:
                    student_data = {
                        "student_name": name,
                        "prn_number": prn,
                        "email": email,
                        "division_id": division_id,
                        "user_id": user_id
                    }
                    supabase.table("students").upsert(student_data, on_conflict="prn_number").execute()
                    results["success"] += 1

            except Exception as e:
                results["failed"] += 1
                results["errors"].append(f"Error processing {email}: {str(e)}")

        error_msg = ""
        if results["errors"]:
            error_msg = f" First error: {results['errors'][0]}"

        return {
            "data": results,
            "message": f"Processed {len(students_to_process)} students. Success: {results['success']}, Failed: {results['failed']}.{error_msg}"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV processing failed: {str(e)}",
        )

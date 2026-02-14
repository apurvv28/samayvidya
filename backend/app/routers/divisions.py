"""Divisions management routes."""
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase, get_service_supabase
from app.schemas.common import SuccessResponse
import csv
import io
import asyncio
import math
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


import math

# ... (imports)

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
        total_students = len(students_to_process)
        if not students_to_process:
             raise HTTPException(status_code=400, detail="CSV file is empty.")

        supabase = get_service_supabase() # Use service role for Auth and Insert
        results = {"success": 0, "failed": 0, "errors": []}

        # Validate Division Exists
        div_check = supabase.table("divisions").select("division_id").eq("division_id", division_id).execute()
        if not div_check.data:
            raise HTTPException(status_code=404, detail="Division not found.")

        # --- Batch Logic ---
        # Determine number of batches
        # Rule: >= 70 students -> 3 batches, < 70 -> 2 batches
        num_batches = 3 if total_students >= 70 else 2
        batch_codes = [f"B{i+1}" for i in range(num_batches)]
        
        # Create/Get Batches
        batch_map = {} # Code -> ID
        for code in batch_codes:
            # Check/Create batch
            # We use upsert or select then insert. 
            # Upsert on (division_id, batch_code) unique constraint
            batch_data = {
                "division_id": division_id,
                "batch_code": code,
                "is_active": True,
                "max_students": math.ceil(total_students / num_batches) + 5 # Buffer
            }
            # Need to get the ID back.
            # Upserting and returning ID.
            # Warning: On conflict replace might change ID if we aren't careful, but here we just want the ID for this code.
            # Ideally we select first.
            existing = supabase.table("batches").select("batch_id").eq("division_id", division_id).eq("batch_code", code).execute()
            if existing.data:
                batch_id = existing.data[0]['batch_id']
                # Update max_students maybe?
                supabase.table("batches").update({"max_students": batch_data["max_students"]}).eq("batch_id", batch_id).execute()
            else:
                new_batch = supabase.table("batches").insert(batch_data).execute()
                batch_id = new_batch.data[0]['batch_id']
            
            batch_map[code] = batch_id

        # Calculate Split Points for Balanced Distribution
        # We want to distribute ~evenly.
        # Simple approach: distribute sequentially.
        # Students 0 to split1 -> B1
        # split1 to split2 -> B2
        # ...
        
        batch_size = math.ceil(total_students / num_batches)
        
        # Process each student
        for index, row in enumerate(students_to_process):
            name = row.get('Student Name', '').strip()
            prn = row.get('PRN Number', '').strip()
            email = row.get('Email', '').strip()

            if not all([name, prn, email]):
                results["failed"] += 1
                results["errors"].append(f"Skipped row with missing data: {row}")
                continue

            try:
                # Assign Roll Number (1-based index)
                roll_number = index + 1
                
                # Assign Batch
                # Determine which batch index this student belongs to
                batch_idx = min(index // batch_size, num_batches - 1)
                batch_code = batch_codes[batch_idx]
                batch_id = batch_map[batch_code]

                # Insert into Students Table
                # We are no longer creating Auth users for students.
                # user_id will be NULL for students now.
                
                student_data = {
                    "student_name": name,
                    "prn_number": prn,
                    "email": email,
                    "division_id": division_id,
                    "user_id": None, # No auth user
                    "roll_number": roll_number,
                    "batch_id": batch_id
                }
                supabase.table("students").upsert(student_data, on_conflict="prn_number").execute()
                results["success"] += 1

            except Exception as e:
                results["failed"] += 1
                results["errors"].append(f"Error processing {email}: {str(e)}")

        error_msg = ""
        if results["errors"]:
            # Simplify error message for frontend
            unique_errors = list(set([e.split(':')[0] for e in results["errors"]]))
            error_msg = f" Encountered errors. Check logs."

        return {
            "data": results,
            "message": f"Processed {len(students_to_process)} students. Created {num_batches} batches. Success: {results['success']}, Failed: {results['failed']}."
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV processing failed: {str(e)}",
        )

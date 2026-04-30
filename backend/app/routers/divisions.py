"""Divisions management routes."""
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser, require_role
from app.supabase_client import get_user_supabase, get_service_supabase
from app.schemas.common import SuccessResponse
import csv
import io
import math

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
    current_user: CurrentUser = Depends(require_role("COORDINATOR", "ADMIN")),
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


@router.get("/{division_id}/students", response_model=SuccessResponse)
async def get_division_students(
    division_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get all students in a division with their details."""
    try:
        supabase = get_service_supabase()
        
        # Get students from students table with batch information
        response = (
            supabase.table("students")
            .select("*, batches(batch_code)")
            .eq("division_id", division_id)
            .order("roll_number")
            .execute()
        )
        
        return {
            "data": response.data or [],
            "message": f"Retrieved {len(response.data or [])} students",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch students: {str(e)}",
        )


import math

# ... (imports)

@router.post("/{division_id}/students/upload", response_model=SuccessResponse)
async def upload_student_csv(
    division_id: str,
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_role("COORDINATOR", "ADMIN")),
) -> dict:
    """Upload student CSV, create auth users, and map to selected division/department."""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a CSV file.")

    try:
        content = await file.read()
        decoded_content = content.decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(decoded_content))

        if not csv_reader.fieldnames:
            raise HTTPException(status_code=400, detail="CSV file has no headers.")

        header_map = {h.strip().lower(): h for h in csv_reader.fieldnames if h}
        def resolve_header(*aliases: str) -> str | None:
            for alias in aliases:
                key = alias.strip().lower()
                if key in header_map:
                    return header_map[key]
            return None

        name_key = resolve_header("student name", "name")
        email_key = resolve_header("email", "student email")
        prn_key = resolve_header("prn", "prn number", "prn_number")
        if not name_key or not email_key or not prn_key:
            raise HTTPException(
                status_code=400,
                detail="Invalid CSV headers. Required columns: name/student name, email, prn/prn number.",
            )

        students_to_process = list(csv_reader)
        total_students = len(students_to_process)
        if not students_to_process:
             raise HTTPException(status_code=400, detail="CSV file is empty.")

        supabase = get_service_supabase() # Use service role for Auth and Insert
        results = {"success": 0, "failed": 0, "errors": []}

        # Validate Division Exists
        div_check = (
            supabase.table("divisions")
            .select("division_id, department_id")
            .eq("division_id", division_id)
            .single()
            .execute()
        )
        if not div_check.data:
            raise HTTPException(status_code=404, detail="Division not found.")
        division_department_id = str(div_check.data.get("department_id") or "")
        if not division_department_id:
            raise HTTPException(status_code=400, detail="Division has no department mapping.")

        if (
            current_user.role == "COORDINATOR"
            and current_user.department_id
            and str(current_user.department_id) != division_department_id
        ):
            raise HTTPException(
                status_code=403,
                detail="You can upload students only for divisions in your department.",
            )

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
            name = row.get(name_key, '').strip()
            prn = row.get(prn_key, '').strip()
            email = row.get(email_key, '').strip().lower()

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
                
                # Hash password (PRN) using bcrypt
                import bcrypt
                password_hash = bcrypt.hashpw(prn.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

                # Create student record with authentication (students table only - no user_profiles)
                # Note: user_id is optional now since we removed the foreign key constraint
                student_data = {
                    "student_name": name,
                    "prn_number": prn,
                    "email": email,
                    "password_hash": password_hash,  # Add password hash for authentication
                    "division_id": division_id,
                    "roll_number": roll_number,
                    "batch_id": batch_id,
                }
                
                try:
                    supabase.table("students").upsert(student_data, on_conflict="prn_number").execute()
                    results["success"] += 1
                except Exception as student_error:
                    print(f"[STUDENT UPLOAD] Student creation error for {email}: {str(student_error)}")
                    raise ValueError(f"Failed to create student: {str(student_error)}")

            except Exception as e:
                results["failed"] += 1
                error_msg = f"Error processing {email}: {str(e)}"
                print(f"[STUDENT UPLOAD] {error_msg}")
                results["errors"].append(error_msg)

        error_msg = ""
        if results["errors"]:
            # Simplify error message for frontend
            unique_errors = list(set([e.split(':')[0] for e in results["errors"]]))
            error_msg = f" Encountered errors. Check logs."

        return {
            "data": results,
            "message": (
                f"Processed {len(students_to_process)} students for division {division_id}. "
                f"Created {num_batches} batches. Users created: {results['success']}, Failed: {results['failed']}."
            ),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV processing failed: {str(e)}",
        )

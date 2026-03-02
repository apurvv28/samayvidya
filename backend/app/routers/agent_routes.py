from fastapi import APIRouter, HTTPException, status, Depends
from typing import Dict, Any, List
import json
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_service_supabase
from app.schemas.common import SuccessResponse
from app.services.load_management_agents import LoadManagementCrew

router = APIRouter(prefix="/agents", tags=["agents"])

@router.post("/generate-faculty-load", response_model=SuccessResponse)
async def generate_faculty_load(
    # Optional filtering by department or year can be added later
    department_id: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Generate optimal faculty load distribution using AI Agents."""
    try:
        supabase = get_service_supabase()
        
        # 1. Fetch faculties
        faculty_query = supabase.table("faculty").select("faculty_id, faculty_name, priority_level, role, designation")
        if department_id:
            faculty_query = faculty_query.eq("department_id", department_id)
        faculty_data_res = faculty_query.execute()
        faculties = faculty_data_res.data
        
        if not faculties:
            raise HTTPException(status_code=400, detail="No faculties found to distribute load.")

        # 2. Fetch Subjects
        subject_query = supabase.table("subjects").select("subject_id, subject_name, subject_type, credits, hours_per_week, theory_hours, lab_hours, tutorial_hours")
        if department_id:
            subject_query = subject_query.eq("department_id", department_id)
        subjects_data_res = subject_query.execute()
        subjects = subjects_data_res.data
        
        if not subjects:
             raise HTTPException(status_code=400, detail="No subjects found to distribute.")

        # 3. Fetch Divisions and Batches to accurately calculate required hours
        divisions_res = supabase.table("divisions").select("division_id, division_name, department_id").execute()
        batches_res = supabase.table("batches").select("batch_id, batch_code, division_id").execute()
        
        # 4. Fetch existing mappings
        mappings_res = supabase.table("faculty_subject_mapping").select("*").execute()
        mappings_data = mappings_res.data

        # Build curriculum payload
        curriculum_payload = {
            "subjects": subjects,
            "divisions": divisions_res.data,
            "batches": batches_res.data
        }
        
        # Build faculty payload
        faculty_payload = faculties

        # 5. Initialize and Run Crew for Load Calculation
        crew = LoadManagementCrew()
        result_json_str = crew.calculate_and_validate_load(
            curriculum_data=curriculum_payload,
            faculties_data=faculty_payload,
            mapping_data=mappings_data
        )
        
        # 6. Parse output and return
        try:
            result_data = json.loads(result_json_str)
            
            # Save strictly total hours back to Database
            assignments = result_data.get("assignments", [])
            for assign in assignments:
                f_id = assign.get("faculty_id")
                # Update total assigned load in faculty table based on AI agent logic output 
                # (You might want to break this down into theory vs lab if the output supports it, but total is safer for now based on the pydantic schema)
                tot_hours = assign.get("total_assigned_hours", 0)
                
                if f_id:
                    supabase.table("faculty").update({
                        "target_theory_load": tot_hours # Currently overwriting target_theory_load as a general placeholder for test verification.
                    }).eq("faculty_id", f_id).execute()

        except json.JSONDecodeError:
            result_data = {"raw_output": result_json_str}

        return {
            "data": result_data,
            "message": "Faculty load generated successfully by AI Agents."
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agent process failed: {str(e)}",
        )

from fastapi import APIRouter, HTTPException, status, Depends
import json
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_service_supabase
from app.schemas.common import SuccessResponse
from app.services.load_management_agents import LoadManagementCrew

router = APIRouter(prefix="/agents", tags=["agents"])

@router.post("/generate-faculty-load", response_model=SuccessResponse)
async def generate_faculty_load(
    department_id: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Summarize load distribution rows for timetable generation."""
    try:
        supabase = get_service_supabase()

        load_query = (
            supabase.table("load_distribution")
            .select("load_distribution_id, faculty_name, year, division, subject, theory_hrs, lab_hrs, tutorial_hrs, batch, total_hrs_per_week, created_at")
            .eq("uploaded_by", current_user.uid)
        )

        load_rows_res = load_query.execute()
        load_rows = load_rows_res.data or []

        if not load_rows:
            raise HTTPException(status_code=400, detail="No load distribution rows found.")

        crew = LoadManagementCrew()
        result_json_str = crew.calculate_and_validate_load(load_rows)

        try:
            result_data = json.loads(result_json_str)

        except json.JSONDecodeError:
            result_data = {"raw_output": result_json_str}

        return {
            "data": result_data,
            "message": "Load distribution summarized successfully."
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agent process failed: {str(e)}",
        )

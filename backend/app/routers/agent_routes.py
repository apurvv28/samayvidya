from fastapi import APIRouter, HTTPException, status, Depends
import json
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from app.config import settings
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_service_supabase
from app.schemas.common import SuccessResponse
from app.services.load_management_agents import LoadManagementCrew
from app.services.timetable_orchestrator import TimetableOrchestrationEngine

router = APIRouter(prefix="/agents", tags=["agents"])


def _is_anonymous_mode_user(current_user: CurrentUser) -> bool:
    return settings.allow_anonymous_api and current_user.aud == "anonymous"


class TimetableOrchestrationRequest(BaseModel):
    department_id: str | None = None
    reason: str | None = None
    dry_run: bool = False


@router.post("/generate-faculty-load", response_model=SuccessResponse)
async def generate_faculty_load(
    department_id: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Summarize load distribution rows for timetable generation."""
    try:
        supabase = get_service_supabase()

        load_query = supabase.table("load_distribution").select(
            "load_distribution_id, faculty_name, year, division, subject, theory_hrs, lab_hrs, tutorial_hrs, batch, total_hrs_per_week, created_at"
        )
        if not _is_anonymous_mode_user(current_user):
            load_query = load_query.eq("uploaded_by", current_user.uid)

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


@router.post("/create-timetable", response_model=SuccessResponse)
async def create_timetable_with_agents(
    payload: TimetableOrchestrationRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Run multi-agent orchestration to build a timetable from persisted master data."""
    try:
        orchestrator = TimetableOrchestrationEngine()
        result = orchestrator.run(
            user_id=None if _is_anonymous_mode_user(current_user) else current_user.uid,
            department_id=payload.department_id,
            persist=not payload.dry_run,
            reason=payload.reason,
        )
        return {
            "data": result,
            "message": "Multi-agent timetable orchestration completed successfully.",
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Timetable orchestration failed: {str(e)}",
        )


@router.post("/create-timetable/stream")
async def create_timetable_with_agents_stream(
    payload: TimetableOrchestrationRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Stream real-time stage updates for timetable orchestration using SSE."""

    def event_stream():
        try:
            orchestrator = TimetableOrchestrationEngine()
            for event in orchestrator.run_stream(
                user_id=None if _is_anonymous_mode_user(current_user) else current_user.uid,
                department_id=payload.department_id,
                persist=not payload.dry_run,
                reason=payload.reason,
            ):
                event_type = event.get("type", "message")
                yield f"event: {event_type}\n"
                yield f"data: {json.dumps(event)}\n\n"
        except ValueError as e:
            error_event = {
                "type": "error",
                "status_code": 400,
                "detail": str(e),
            }
            yield "event: error\n"
            yield f"data: {json.dumps(error_event)}\n\n"
        except Exception as e:
            error_event = {
                "type": "error",
                "status_code": 500,
                "detail": f"Timetable orchestration failed: {str(e)}",
            }
            yield "event: error\n"
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

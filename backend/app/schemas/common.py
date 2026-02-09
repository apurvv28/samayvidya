"""Common schemas and types used across the application."""
from enum import Enum
from pydantic import BaseModel, ConfigDict
from datetime import datetime


class SubjectTypeEnum(str, Enum):
    """Subject type enumeration."""

    THEORY = "THEORY"
    LAB = "LAB"
    TUTORIAL = "TUTORIAL"


class RoomTypeEnum(str, Enum):
    """Room type enumeration."""

    CLASSROOM = "CLASSROOM"
    LAB = "LAB"


class FacultyRoleEnum(str, Enum):
    """Faculty role enumeration."""

    FACULTY = "FACULTY"
    LAB_INCHARGE = "LAB_INCHARGE"
    COORDINATOR = "COORDINATOR"
    HOD = "HOD"


class LeaveStatusEnum(str, Enum):
    """Leave status enumeration."""

    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class EventTypeEnum(str, Enum):
    """Campus event type enumeration."""

    ACADEMIC = "ACADEMIC"
    NON_ACADEMIC = "NON_ACADEMIC"


class UserRoleEnum(str, Enum):
    """User role enumeration."""

    STUDENT = "STUDENT"
    FACULTY = "FACULTY"
    ADMIN = "ADMIN"


# Base model configuration for Supabase integration
class SupabaseModel(BaseModel):
    """Base model with Supabase-compatible configuration."""

    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={
            datetime: lambda v: v.isoformat() if v else None,
        },
    )


class ErrorResponse(BaseModel):
    """Standard error response."""

    detail: str
    status_code: int


class SuccessResponse(BaseModel):
    """Standard success response wrapper."""

    data: dict | list | None = None
    message: str = "Success"

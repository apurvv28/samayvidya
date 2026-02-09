"""Main FastAPI application entry point."""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Routers
from app.routers import (
    auth,
    departments,
    divisions,
    subjects,
    faculty,
    rooms,
    batches,
    days,
    time_slots,
    timetable_versions,
    timetable_entries,
    faculty_leaves,
    campus_events,
    academic_years,
)
from app.config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title="Timetable Scheduler API",
    description="Production-ready backend for departmental timetable scheduling with Supabase integration",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Application startup event."""
    logger.info(f"Starting Timetable Scheduler API in {settings.environment} mode")
    logger.info(f"Supabase URL: {settings.supabase_url}")


@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown event."""
    logger.info("Shutting down Timetable Scheduler API")


@app.get("/health", tags=["health"])
async def health_check() -> dict:
    """
    Health check endpoint.
    
    Returns basic status information about the API.
    """
    return {
        "status": "healthy",
        "environment": settings.environment,
        "service": "Timetable Scheduler API",
    }


# Include routers
app.include_router(auth.router)
app.include_router(departments.router)
app.include_router(divisions.router)
app.include_router(subjects.router)
app.include_router(faculty.router)
app.include_router(rooms.router)
app.include_router(batches.router)
app.include_router(days.router)
app.include_router(time_slots.router)
app.include_router(timetable_versions.router)
app.include_router(timetable_entries.router)
app.include_router(faculty_leaves.router)
app.include_router(campus_events.router)
app.include_router(academic_years.router)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Handle uncaught exceptions."""
    logger.exception("Unhandled exception", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


if __name__ == "__main__":
    import uvicorn

    # Run with: python -m app.main
    # Or: uvicorn app.main:app --reload
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )

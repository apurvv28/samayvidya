# Contributing Guidelines

Guide for extending and maintaining the Timetable Scheduler API.

## Code Structure

```
app/
├── main.py           # FastAPI app, router registration, middleware
├── config.py         # Environment variables & settings
├── supabase_client.py # Supabase client factory (anon + service role)
├── dependencies/     # Reusable dependency injection
│   └── auth.py       # JWT validation
├── routers/          # API endpoint definitions (CRUD for each table)
└── schemas/          # Pydantic models & enums
```

## Adding a New Entity

### 1. Create Supabase Table

In Supabase console, create table with RLS policies:

```sql
CREATE TABLE your_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  department_id UUID REFERENCES departments(department_id),
  created_at TIMESTAMP DEFAULT now()
);

-- Enable RLS
ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;

-- Example policy
CREATE POLICY "users_can_view_own_dept" ON your_table
  FOR SELECT
  USING (
    department_id IN (
      SELECT department_id FROM user_profiles 
      WHERE user_id = auth.uid()
    )
  );
```

### 2. Add Schemas

`app/schemas/common.py`:

```python
class YourEntityCreate(BaseModel):
    """Create your_table request."""
    name: str
    department_id: str

class YourEntityUpdate(BaseModel):
    """Update your_table request."""
    name: str | None = None
```

### 3. Create Router

`app/routers/your_table.py`:

```python
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.dependencies.auth import get_current_user, CurrentUser
from app.supabase_client import get_user_supabase
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/your-table", tags=["your-table"])

@router.get("", response_model=SuccessResponse)
async def list_items(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """List all items (RLS enforced)."""
    try:
        supabase = get_user_supabase()
        response = supabase.table("your_table").select("*").execute()
        return {"data": response.data, "message": "Items retrieved"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch items: {str(e)}",
        )

# ... implement other CRUD operations
```

### 4. Register Router

`app/main.py`:

```python
from app.routers import your_table

app.include_router(your_table.router)
```

## Naming Conventions

- **Tables**: `snake_case` (eg: `user_profiles`, `faculty_availability`)
- **Routers**: `snake_case.py` files (eg: `user_profiles.py`)
- **Routes**: kebab-case prefix (eg: `/user-profiles`)
- **Functions**: `snake_case` (eg: `get_current_user`)
- **Classes**: `PascalCase` (eg: `CurrentUser`, `FacultyCreate`)

## Key Principles

### ✅ DO

- Use RLS for all access control
- Handle exceptions gracefully
- Return consistent response format
- Keep routers simple (just CRUD)
- Use type hints everywhere
- Document with docstrings
- Validate with Pydantic
- Use `get_user_supabase()` by default
- Log errors appropriately

### ❌ DON'T

- Implement business logic in routers
- Bypass RLS with service role
- Hardcode permissions
- Expose sensitive error details
- Return raw database errors
- Skip input validation
- Mix multiple concerns in one file
- Use `get_service_supabase()` in user-facing routes

## Error Handling

Always return proper HTTP status codes:

```python
from fastapi import HTTPException, status

# 400 Bad Request
raise HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail="Invalid input"
)

# 401 Unauthorized
raise HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid token",
    headers={"WWW-Authenticate": "Bearer"},
)

# 404 Not Found
raise HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="Resource not found"
)

# 500 Internal Server Error  
raise HTTPException(
    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    detail="Internal server error"
)
```

## Using Supabase Client

### User Requests (RLS Applied)

```python
supabase = get_user_supabase()

# List
response = supabase.table("departments").select("*").execute()

# Get one
response = supabase.table("departments") \
    .select("*") \
    .eq("department_id", id) \
    .single() \
    .execute()

# Create
response = supabase.table("departments") \
    .insert({"name": "CS"}) \
    .execute()

# Update
response = supabase.table("departments") \
    .update({"name": "Computer Science"}) \
    .eq("department_id", id) \
    .execute()

# Delete
response = supabase.table("departments") \
    .delete() \
    .eq("department_id", id) \
    .execute()
```

### System Operations (RLS Bypassed)

```python
# ONLY for internal agents/system operations!
supabase_service = get_service_supabase()

# This bypasses RLS - use carefully
response = supabase_service.table("timetable_entries") \
    .select("*") \
    .execute()
```

## Response Format

All successful responses:

```json
{
  "data": [...],
  "message": "Operation successful"
}
```

## Testing Endpoints

```bash
# Get your JWT token from Supabase Auth
TOKEN="eyJhbGc..."

# Test with curl
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/departments
```

## Logging

```python
import logging

logger = logging.getLogger(__name__)

logger.info("Operation completed")
logger.warning("Unusual situation")
logger.error("Error occurred", exc_info=exc)
```

## API Documentation

Endpoints are auto-documented. Add docstrings to routes:

```python
@router.get("/{id}")
async def get_item(id: str, current_user: CurrentUser = Depends(get_current_user)) -> dict:
    """
    Get a specific item by ID.
    
    Returns the item if current user has RLS permission.
    """
```

## Code Style

- Follow [PEP 8](https://pep8.org/)
- Use type hints
- Max line length: 100 characters (lines can be longer for URLs)
- Use Black formatter (optional but recommended)

```bash
pip install black
black app/
```

## Testing

While this is a CRUD-only backend, test auth and error handling:

```bash
# Test without token
curl http://localhost:8000/departments
# Should get 403 Forbidden

# Test with invalid token  
curl -H "Authorization: Bearer invalid" \
  http://localhost:8000/departments
# Should get 401 Unauthorized

# Test valid request
curl -H "Authorization: Bearer $VALID_TOKEN" \
  http://localhost:8000/departments
# Should get 200 OK with data
```

## Deployment

When deploying changes:

1. Test locally with `uvicorn app.main:app --reload`
2. Verify Supabase tables & RLS policies exist
3. Commit changes to git
4. Push to repository
5. CI/CD pipeline automatically deploys

## Questions?

Refer to:
- FastAPI docs: https://fastapi.tiangolo.com/
- Supabase docs: https://supabase.com/docs
- Python-jose: https://python-jose.readthedocs.io/

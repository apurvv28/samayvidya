# Timetable Scheduler Backend API

Production-ready FastAPI backend for departmental timetable scheduling with Supabase (PostgreSQL) integration.

## Features

- 🔐 **JWT Authentication** via Supabase Auth
- 🛡️ **Row Level Security (RLS)** enforcement on all queries
- 📦 **Complete CRUD APIs** for all academic entities
- 🔑 **Dual client support**: Anon key (user-facing) & Service Role key (system operations)
- ✅ **Pydantic validation** for all requests
- 🚀 **Production-ready** error handling & logging
- 📚 **Auto-generated API documentation** at `/docs`

## Tech Stack

- **Python 3.10+**
- **FastAPI** - Modern web framework
- **Supabase** - PostgreSQL + Auth
- **Pydantic** - Data validation
- **Uvicorn** - ASGI server
- **python-jose** - JWT handling

## Setup

### 1. Clone and Install Dependencies

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create `.env` file with Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
DEBUG=True
ENVIRONMENT=development
```

Get these from your Supabase project settings:
- **SUPABASE_URL**: Project URL
- **SUPABASE_ANON_KEY**: Anon (public) key
- **SUPABASE_SERVICE_ROLE_KEY**: Service Role key (keep secure!)

### 3. Run the Server

```bash
# Development (with auto-reload)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

Server runs at: `http://localhost:8000`

## API Documentation

Once running, access interactive API docs at:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

## Authentication

All API endpoints (except `/health`) require JWT token in Authorization header:

```bash
curl -H "Authorization: Bearer <your-jwt-token>" \
  http://localhost:8000/departments
```

### Getting a JWT Token

1. User signs up/logs in via Supabase Auth (frontend handles this)
2. Supabase returns a JWT token
3. Frontend sends token in every API request
4. Backend validates token and extracts user ID

JWT Structure:
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "aud": "authenticated",
  "exp": 1234567890
}
```

## How RLS Enforcement Works

**Row Level Security** is enforced at the database level:

1. **User requests** use ANON key → Supabase applies RLS policies
2. **System operations** use SERVICE ROLE key → Bypasses RLS (for agents only)

### Example RLS Policy (must exist in Supabase)

```sql
-- Allow users to see departments their division belongs to
CREATE POLICY "departments_rls" ON departments
  FOR SELECT
  USING (
    division_id IN (
      SELECT division_id FROM divisions d
      WHERE d.department_id = auth.uid()
    )
  );
```

### IMPORTANT: Why We Don't Enforce Auth in Backend

✅ **Right approach** (this backend):
- Backend passes JWT to Supabase
- Supabase RLS filters data automatically
- No hardcoded role checks in backend

❌ **Wrong approach**:
- Backend manually checks permissions
- Bypasses database security
- Duplicates logic

## API Endpoints

### Authentication
- `GET /auth/me` - Get current user profile
- `POST /auth/logout` - Logout user

### Academic Data (CRUD)
All follow pattern: `GET /resource`, `POST /resource`, `PUT /resource/{id}`, `DELETE /resource/{id}`

- `/departments` - Departments
- `/divisions` - Divisions
- `/subjects` - Subjects
- `/faculty` - Faculty members
- `/rooms` - Classrooms & labs
- `/batches` - Lab batches
- `/days` - Working days
- `/time-slots` - Time slots
- `/timetable-versions` - Timetable versions
- `/timetable-entries` - Timetable entries
- `/faculty-leaves` - Faculty leave requests
- `/campus-events` - Campus events

### Example Requests

```bash
# List departments
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/departments

# Create department
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"department_name":"CS", "academic_year":"2024-25", "semester":1, "start_date":"2024-08-01", "end_date":"2024-12-15"}' \
  http://localhost:8000/departments

# Get specific department
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/departments/<id>
```

## Project Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app initialization
│   ├── config.py               # Configuration from .env
│   ├── supabase_client.py      # Supabase client factory
│   ├── dependencies/
│   │   ├── auth.py             # JWT validation dependency
│   │   └── __init__.py
│   ├── routers/
│   │   ├── auth.py             # Auth routes
│   │   ├── departments.py      # CRUD routes (template repeated for all entities)
│   │   ├── divisions.py
│   │   ├── subjects.py
│   │   ├── faculty.py
│   │   ├── rooms.py
│   │   ├── batches.py
│   │   ├── days.py
│   │   ├── time_slots.py
│   │   ├── timetable_versions.py
│   │   ├── timetable_entries.py
│   │   ├── faculty_leaves.py
│   │   ├── campus_events.py
│   │   └── __init__.py
│   ├── schemas/
│   │   ├── common.py           # Shared enums & models
│   │   └── __init__.py
│   └── __init__.py
├── .env                        # Environment variables (create this)
├── requirements.txt            # Python dependencies
└── README.md                   # This file
```

## Security Highlights

### ✅ Implemented

- JWT token validation via Supabase
- RLS policies enforced at database level
- Separate anon/service role clients
- No hardcoded permissions in backend
- CORS configured for local development
- Proper error handling without leaking details

### ⚠️ Not Implemented (Intentional)

- Business logic (agent handles this)
- Scheduling/OR-Tools logic (separate service)
- Role-based authorization in backend (RLS does this)
- Complex query optimization (kept simple for clarity)

## Database Integration

### Supabase Connection

```python
from app.supabase_client import get_user_supabase, get_service_supabase

# In your route
supabase = get_user_supabase()  # For user requests (RLS applied)
response = supabase.table("departments").select("*").execute()

# Only for system operations
supabase_service = get_service_supabase()  # Bypasses RLS!
```

### Base Response Format

```json
{
  "data": [...],
  "message": "Success message"
}
```

### Error Responses

```json
{
  "detail": "Error description"
}
```

HTTP Status Codes:
- `200` - Success
- `400` - Bad request / validation error
- `401` - Unauthorized (missing/invalid token)
- `404` - Not found
- `500` - Server error

## Testing

### Test Authentication

```bash
# Get token from Supabase Auth (frontend provides this)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Test endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/auth/me
```

### Test with No Token

```bash
curl http://localhost:8000/departments
# Returns 403 Forbidden
```

## Troubleshooting

### "Invalid token"
- Token expired → User needs to re-login
- Token malformed → Check Supabase auth config
- Missing `sub` claim → Contact Supabase support

### "Row Level Security" error
- RLS policy denies access → User lacks permissions
- Check `user_profiles` table for user role
- Verify RLS policies in Supabase

### "Supabase URL not found"
- `.env` file missing or incorrect path
- Run `python -c "from app.config import settings; print(settings.supabase_url)"`

## Future: Integration Points

This backend is designed to be integrated with:

1. **Scheduling Agent** - Uses service role to modify timetables
2. **OR-Tools Solver** - Optimizes constraints
3. **WebSocket Updates** - Real-time timetable changes
4. **Admin Dashboard** - Management interface

**Note**: All these integrations respect RLS and use appropriate keys.

## Contributing

When adding new entities:

1. Create router: `app/routers/entity_name.py`
2. Add schemas to `app/schemas/common.py`
3. Include in `app/main.py`: `app.include_router(entity_name.router)`
4. Ensure Supabase table & RLS policies exist

## License

Internal use only - VIT Specific-domain Timetable Solution

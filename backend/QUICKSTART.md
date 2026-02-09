# Quick Start Guide (5 Minutes)

Get the Timetable Scheduler API running in 5 minutes.

## Step 1: Prerequisites

- [Python 3.10+](https://www.python.org/downloads/)
- [Supabase Account](https://supabase.com) (free tier works)
- [Git](https://git-scm.com/)

## Step 2: Get Supabase Credentials

1. Go to [supabase.com](https://supabase.com) and create a project
2. Navigate to **Project Settings** → **API**
3. Copy these values:
   - Project URL → `SUPABASE_URL`
   - Anon Public Key → `SUPABASE_ANON_KEY`
   - Service Role Key → `SUPABASE_SERVICE_ROLE_KEY`

## Step 3: Clone & Configure

```bash
# Clone/navigate to project
cd backend

# Create Python environment
python -m venv venv

# Activate it (Windows)
venv\Scripts\activate

# Or macOS/Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Step 4: Add Environment Variables

Create/edit `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
DEBUG=True
ENVIRONMENT=development
```

## Step 5: Run Server

```bash
uvicorn app.main:app --reload --port 8000
```

You should see:
```
INFO:     Application startup complete
INFO:     Uvicorn running on http://0.0.0.0:8000
```

## Step 6: Test It

### In Browser

Visit `http://localhost:8000/docs` for interactive API explorer

### In Terminal

```bash
# 1. Get a JWT from Supabase (frontend gets this)
# For now, generate a test JWT at https://jwt.io

# 2. Test endpoint with the token
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:8000/health
```

## What's Next?

- Read the full [README.md](./README.md) for detailed API docs
- Check [CONTRIBUTING.md](./CONTRIBUTING.md) to add new endpoints
- View [DEPLOYMENT.md](./DEPLOYMENT.md) to deploy to production

## Troubleshooting

### "ModuleNotFoundError: No module named 'fastapi'"

```bash
# Ensure you're in virtual environment
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate  # Windows

# Install again
pip install -r requirements.txt
```

### "SUPABASE_URL not configured"

```bash
# Check .env file exists and has correct values
cat .env

# Or test Python can read it
python -c "from app.config import settings; print(settings.supabase_url)"
```

### Port 8000 already in use

```bash
# Use different port
uvicorn app.main:app --reload --port 8001
```

### "Invalid token" error

Your JWT might be expired. Get a fresh one from Supabase Auth (your frontend handles this).

## File Structure

```
backend/
├── app/
│   ├── main.py              # Main app
│   ├── config.py            # Configuration
│   ├── supabase_client.py   # Database
│   ├── dependencies/auth.py # Auth logic
│   ├── routers/             # API endpoints
│   └── schemas/             # Data models
├── .env                     # Your secrets (don't commit!)
├── requirements.txt         # Dependencies
├── README.md               # Full documentation
├── DEPLOYMENT.md           # Deploy to production
├── CONTRIBUTING.md         # Add new features
└── Dockerfile              # For containerization
```

## Next: Create Tables in Supabase

Before using endpoints, create tables in Supabase:

```sql
-- Example: departments table
CREATE TABLE departments (
  department_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_name TEXT NOT NULL,
  academic_year TEXT,
  semester INT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP DEFAULT now()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- Allow users to see departments
CREATE POLICY "departments_select" ON departments
  FOR SELECT
  USING (true);
```

## Key Commands

```bash
# Start server (development)
uvicorn app.main:app --reload --port 8000

# API docs
http://localhost:8000/docs

# Check health
curl http://localhost:8000/health

# List departments (with token)
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:8000/departments
```

## Architecture Overview

```
Frontend (React)
      ↓ (JWT token)
FastAPI (this backend)
      ↓ (uses JWT to filter via RLS)
Supabase (PostgreSQL + Auth)
      ↓ (RLS policies enforce security)
Data (only what user can access)
```

## API Response Format

### Success (200):
```json
{
  "data": [/* records */],
  "message": "Departments retrieved successfully"
}
```

### Error (4xx/5xx):
```json
{
  "detail": "Error description"
}
```

---

**Ready?** Now check out the full [README.md](./README.md)!

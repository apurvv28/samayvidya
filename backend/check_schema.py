import sys
import os

# Add the parent directory to sys.path to allow importing from 'app'
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Manually load .env
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(env_path):
    with open(env_path, 'r') as f:
        for line in f:
            if line.strip() and not line.startswith('#'):
                key, value = line.strip().split('=', 1)
                os.environ[key] = value

from app.supabase_client import get_service_supabase
import asyncio

async def check_schema():
    supabase = get_service_supabase()
    print("Checking students table schema...")
    try:
        # Try to select the new columns. Even if table is empty, this should work if columns exist.
        # If columns don't exist, it will throw an error (usually 400 or similar from PostgREST).
        response = supabase.table("students").select("student_id, roll_number, batch_id").limit(1).execute()
        print("Columns `roll_number` and `batch_id` detected successfully.")
        return True
    except Exception as e:
        print(f"Error checking schema: {e}")
        print("It seems `roll_number` or `batch_id` columns are MISSING.")
        return False

if __name__ == "__main__":
    asyncio.run(check_schema())

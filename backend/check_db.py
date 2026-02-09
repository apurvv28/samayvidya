import asyncio
from app.supabase_client import get_service_supabase

async def check_profiles():
    supabase = get_service_supabase()
    
    # List all users from auth (not possible directly via client usually, but let's check profiles)
    response = supabase.table("user_profiles").select("*").execute()
    print(f"Found {len(response.data)} profiles.")
    for p in response.data:
        print(f"ID: {p['user_id']}, Role: {p['role']}")

if __name__ == "__main__":
    asyncio.run(check_profiles())

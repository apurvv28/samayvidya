import asyncio
from app.supabase_client import get_service_supabase

async def seed_profiles():
    supabase = get_service_supabase()
    
    try:
        users = supabase.auth.admin.list_users()
        print(f"Found {len(users)} users in auth.users")
        
        for user in users:
            print(f"Checking profile for {user.email} ({user.id})")
            
            profile = supabase.table("user_profiles").select("*").eq("user_id", user.id).execute()
            
            if not profile.data:
                print(f"Creating profile for {user.email}")
                # Try FACULTY since ADMIN failed
                data = {
                    "user_id": user.id,
                    "role": "FACULTY" 
                }
                
                try:
                    supabase.table("user_profiles").insert(data).execute()
                    print("Profile created successfully as FACULTY.")
                except Exception as e:
                    print(f"Failed to create profile: {e}")
                    if hasattr(e, 'details'):
                         print(f"Details: {e.details}")
                    if hasattr(e, 'message'):
                         print(f"Message: {e.message}")
            else:
                print(f"Profile exists: {profile.data[0]}")
                
    except Exception as e:
        print(f"Global Error: {e}")

if __name__ == "__main__":
    asyncio.run(seed_profiles())

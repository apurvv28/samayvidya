'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createSupabaseClient } from '../utils/supabase';

const AuthContext = createContext(null);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// Maps DB role → dashboard path
export const ROLE_DASHBOARD = {
  COORDINATOR: '/dashboard/coordinator',
  ADMIN: '/dashboard/coordinator', // ADMIN gets coordinator dashboard
  HOD: '/dashboard/hod',
  FACULTY: '/dashboard/faculty',
  STUDENT: '/dashboard/student',
};

// Which roles are allowed on each dashboard path
export const ROUTE_ROLES = {
  '/dashboard/coordinator': ['COORDINATOR'],
  '/dashboard/hod': ['HOD'],
  '/dashboard/faculty': ['FACULTY'],
  '/dashboard/student': ['STUDENT'],
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // Supabase auth user
  const [profile, setProfile] = useState(null); // { role, department_id, is_hod, is_coordinator }
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const supabase = createSupabaseClient();

  const fetchProfile = useCallback(async (accessToken) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        const p = await fetchProfile(session.access_token);
        setProfile(p);
        setProfileLoaded(true);
        // Keep token in localStorage for legacy API calls
        localStorage.setItem('authToken', session.access_token);
      } else {
        setProfileLoaded(true);
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          setUser(session.user);
          const p = await fetchProfile(session.access_token);
          setProfile(p);
          setProfileLoaded(true);
          localStorage.setItem('authToken', session.access_token);
        } else {
          setUser(null);
          setProfile(null);
          setProfileLoaded(true);
          localStorage.removeItem('authToken');
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    localStorage.removeItem('authToken');
  }, [supabase]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, profileLoaded, signOut, supabase }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

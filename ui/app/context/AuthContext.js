'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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
  const [user, setUser] = useState(null);       // Custom auth user (from JWT)
  const [profile, setProfile] = useState(null); // { role, department_id, is_hod, is_coordinator }
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Decode JWT token to get user info
  const decodeToken = useCallback((token) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('[AUTH] Failed to decode token:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    console.log('[AUTH] Initializing auth context...');
    
    // Helper to get cookie value
    const getCookie = (name) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(';').shift();
      return null;
    };
    
    // Check for custom JWT token in localStorage or cookie
    const token = localStorage.getItem('authToken') || getCookie('authToken');
    
    if (token) {
      console.log('[AUTH] Token found');
      const decoded = decodeToken(token);
      
      if (decoded) {
        console.log('[AUTH] Token decoded:', { email: decoded.email, role: decoded.role });
        
        // Check if token is expired
        if (decoded.exp && decoded.exp * 1000 > Date.now()) {
          console.log('[AUTH] Token is valid');
          // Token is valid
          setUser({
            id: decoded.sub,
            email: decoded.email,
          });
          setProfile({
            role: decoded.role,
            department_id: decoded.department_id,
            division_id: decoded.division_id, // For students
            prn: decoded.prn, // For students
            email: decoded.email,
            is_hod: decoded.role === 'HOD',
            is_coordinator: decoded.role === 'COORDINATOR',
          });
          setProfileLoaded(true);
        } else {
          console.log('[AUTH] Token expired');
          // Token expired
          localStorage.removeItem('authToken');
          document.cookie = 'authToken=; path=/; max-age=0';
          setProfileLoaded(true);
        }
      } else {
        console.log('[AUTH] Failed to decode token');
        localStorage.removeItem('authToken');
        document.cookie = 'authToken=; path=/; max-age=0';
        setProfileLoaded(true);
      }
    } else {
      console.log('[AUTH] No token found');
      setProfileLoaded(true);
    }
    
    setLoading(false);
  }, [decodeToken]);

  const signOut = useCallback(() => {
    console.log('[AUTH] Signing out...');
    setUser(null);
    setProfile(null);
    localStorage.removeItem('authToken');
    // Clear cookie
    document.cookie = 'authToken=; path=/; max-age=0';
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, profileLoaded, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, ROLE_DASHBOARD } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

/**
 * Wraps a dashboard page and ensures only users with the correct role can view it.
 * Redirects unauthenticated users to /auth and wrong-role users to their own dashboard.
 */
export default function RoleGuard({ allowedRole, children }) {
  const { user, profile, loading, profileLoaded } = useAuth();
  const router = useRouter();

  // allowedRole can be a string or array of strings
  const allowed = Array.isArray(allowedRole) ? allowedRole : [allowedRole];

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/auth');
      return;
    }

    if (!profileLoaded) return;

    if (!profile?.role) {
      router.replace('/auth');
      return;
    }

    if (!allowed.includes(profile.role)) {
      const dest = ROLE_DASHBOARD[profile.role] || '/auth';
      router.replace(dest);
    }
  }, [user, profile, loading, profileLoaded, router, allowed]);

  if (loading || !profileLoaded || !user || !profile?.role || !allowed.includes(profile.role)) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return children;
}

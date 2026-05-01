'use client';

import { useEffect, useMemo } from 'react';
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
  const allowed = useMemo(
    () => (Array.isArray(allowedRole) ? allowedRole : [allowedRole]),
    [allowedRole]
  );

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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return children;
}

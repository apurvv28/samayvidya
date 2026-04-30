import { NextResponse } from 'next/server';

const PROTECTED_ROUTES = [
  '/dashboard/coordinator',
  '/dashboard/hod',
  '/dashboard/faculty',
  '/dashboard/student',
];

// Decode JWT token without verification (just to check if it exists and is not expired)
function decodeToken(token) {
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
  } catch {
    return null;
  }
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Only run on dashboard routes
  const isProtected = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  if (!isProtected) return NextResponse.next();

  // Check for custom JWT token in cookies or Authorization header
  const token = request.cookies.get('authToken')?.value || 
                request.headers.get('authorization')?.replace('Bearer ', '');

  // If no token, redirect to login
  if (!token) {
    const loginUrl = new URL('/auth', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Decode token to check expiration
  const decoded = decodeToken(token);
  
  // If token is invalid or expired, redirect to login
  if (!decoded || !decoded.exp || decoded.exp * 1000 < Date.now()) {
    const loginUrl = new URL('/auth', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Token is valid, allow access
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};

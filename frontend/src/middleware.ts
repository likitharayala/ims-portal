import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '?'),
  );

  const token = request.cookies.get('accessToken')?.value;
  const userRole = request.cookies.get('userRole')?.value;

  // Admin routes — require admin role
  if (pathname.startsWith('/admin')) {
    if (!token || userRole !== 'admin') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  // Student routes — require student role
  if (pathname.startsWith('/student')) {
    if (!token || userRole !== 'student') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  // Teacher routes — require teacher role
  if (pathname.startsWith('/teacher')) {
    if (!token || userRole !== 'teacher') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  // Root — redirect authenticated users to their dashboard, otherwise show landing page
  if (pathname === '/') {
    if (token && userRole === 'admin') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }
    if (token && userRole === 'student') {
      return NextResponse.redirect(new URL('/student/dashboard', request.url));
    }
    if (token && userRole === 'teacher') {
      return NextResponse.redirect(new URL('/teacher/dashboard', request.url));
    }
    return NextResponse.next(); // unauthenticated → show landing page
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin/:path*', '/student/:path*', '/teacher/:path*', '/admin/profile'],
};

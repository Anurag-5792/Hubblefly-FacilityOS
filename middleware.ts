import { NextRequest, NextResponse } from 'next/server';
import { FACILITYOS_SESSION_COOKIE } from './lib/auth/frappe-session';

export function middleware(request: NextRequest) {
  if (process.env.FACILITYOS_AUTH_SOURCE !== 'frappe') {
    return NextResponse.next();
  }

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  if (sid) return NextResponse.next();

  const login = new URL('/login', request.url);
  login.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    '/inventory/:path*',
    '/mis/:path*',
    '/admin/:path*',
  ],
};

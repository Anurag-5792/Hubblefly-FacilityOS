import { NextRequest, NextResponse } from 'next/server';
import {
  FACILITYOS_SESSION_COOKIE,
  logoutFrappe,
  usesFrappeAuth,
} from '../../../../lib/auth/frappe-session';

export async function POST(request: NextRequest) {
  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value ?? '';
  if (usesFrappeAuth()) await logoutFrappe(sid);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(FACILITYOS_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

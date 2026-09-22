import { NextRequest, NextResponse } from 'next/server';
import {
  FACILITYOS_SESSION_COOKIE,
  loginToFrappe,
  previewSession,
  readFrappeIdentity,
  usesFrappeAuth,
} from '../../../../lib/auth/frappe-session';

export async function POST(request: NextRequest) {
  if (!usesFrappeAuth()) {
    return NextResponse.json(previewSession());
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json() as { username?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid login request.' }, { status: 400 });
  }

  if (!body.username?.trim() || !body.password) {
    return NextResponse.json({ ok: false, error: 'Username and password are required.' }, { status: 400 });
  }

  try {
    const sid = await loginToFrappe(body.username.trim(), body.password);
    const session = await readFrappeIdentity(sid);
    if (!session.authenticated) {
      return NextResponse.json({ ok: false, error: session.error ?? 'Login failed.' }, { status: 401 });
    }

    const response = NextResponse.json(session);
    response.cookies.set(FACILITYOS_SESSION_COOKIE, sid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12,
    });
    return response;
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Login failed.',
    }, { status: 401 });
  }
}

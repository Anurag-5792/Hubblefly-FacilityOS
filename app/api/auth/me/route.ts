import { NextRequest, NextResponse } from 'next/server';
import {
  FACILITYOS_SESSION_COOKIE,
  previewSession,
  readFrappeIdentity,
  usesFrappeAuth,
} from '../../../../lib/auth/frappe-session';

export async function GET(request: NextRequest) {
  if (!usesFrappeAuth()) return NextResponse.json(previewSession());

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value ?? '';
  const session = await readFrappeIdentity(sid);
  return NextResponse.json(session, { status: session.authenticated ? 200 : 401 });
}

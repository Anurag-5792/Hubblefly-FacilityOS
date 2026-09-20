import { NextRequest, NextResponse } from 'next/server';
import { FACILITYOS_SESSION_COOKIE } from '../../../../lib/auth/frappe-session';
import { getSyncStatus } from '../../../../lib/sync/provider';

export async function GET(request: NextRequest) {
  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const payload = await getSyncStatus(sid);
  return NextResponse.json(payload, { status: payload.ok ? 200 : 401 });
}

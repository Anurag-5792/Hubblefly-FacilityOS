import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../lib/auth/server-guard';
import { FACILITYOS_SESSION_COOKIE } from '../../../../lib/auth/frappe-session';
import { getSyncStatus } from '../../../../lib/sync/provider';

export async function GET(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['mis']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }
  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const payload = await getSyncStatus(sid);
  return NextResponse.json(payload, { status: payload.ok ? 200 : 401 });
}

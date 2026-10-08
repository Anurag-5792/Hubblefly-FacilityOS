import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../lib/auth/server-guard';
import { FACILITYOS_SESSION_COOKIE } from '../../../../lib/auth/frappe-session';
import { getFacilityUsers, updateFacilityUserRoles } from '../../../../lib/admin/users-provider';

export async function GET(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['admin']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const result = await getFacilityUsers(sid);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['admin']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }

  let body: { user?: unknown; roles?: unknown };
  try {
    body = await request.json() as { user?: unknown; roles?: unknown };
  } catch {
    return NextResponse.json({ ok: false, persisted: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const user = String(body.user ?? '').trim();
  const roles = Array.isArray(body.roles) ? body.roles.map((value) => String(value)) : [];
  if (!user) {
    return NextResponse.json({ ok: false, persisted: false, error: 'User is required.' }, { status: 400 });
  }

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const result = await updateFacilityUserRoles(user, roles, sid);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

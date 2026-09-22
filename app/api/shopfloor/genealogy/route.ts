import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../lib/auth/server-guard';
import { FACILITYOS_SESSION_COOKIE } from '../../../../lib/auth/frappe-session';
import { exploreGenealogy } from '../../../../lib/shopfloor/genealogy-provider';

export async function GET(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['shopfloor']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }

  const entityId = request.nextUrl.searchParams.get('entity')?.trim() ?? '';
  const depth = Math.min(5, Math.max(1, Number(request.nextUrl.searchParams.get('depth') ?? 3)));

  if (!entityId) {
    return NextResponse.json({ ok: false, error: 'Entity ID is required.' }, { status: 400 });
  }

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const result = await exploreGenealogy(entityId, depth, sid);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}

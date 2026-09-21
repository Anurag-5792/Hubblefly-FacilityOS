import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../lib/auth/server-guard';
import { FACILITYOS_SESSION_COOKIE } from '../../../../lib/auth/frappe-session';
import { getRouteCard } from '../../../../lib/shopfloor/provider';

export async function GET(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['shopfloor']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }

  const routeCardId = request.nextUrl.searchParams.get('id')?.trim() ?? '';
  if (!routeCardId) {
    return NextResponse.json({ ok: false, error: 'Route-card ID is required.' }, { status: 400 });
  }

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const result = await getRouteCard(routeCardId, sid);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}

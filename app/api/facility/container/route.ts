import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../lib/auth/server-guard';
import { getFacilityContainer } from '../../../../lib/facility/provider';

const CONTAINER = /^(BN|BX|BB)-\d{3,}$/;

export async function GET(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['inventory', 'shopfloor']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }
  const id = request.nextUrl.searchParams.get('id')?.trim().toUpperCase() ?? '';
  if (!CONTAINER.test(id)) {
    return NextResponse.json({ ok: false, source: 'sample', error: 'A valid FacilityOS container ID is required.' }, { status: 400 });
  }

  const result = await getFacilityContainer(id);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}

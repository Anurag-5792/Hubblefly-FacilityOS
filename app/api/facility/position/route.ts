import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../lib/auth/server-guard';
import { getFacilityPosition } from '../../../../lib/facility/provider';

const POSITION = /^R\d{2}-L[123]-P\d{2}(?:-S[12])?$/;

export async function GET(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['inventory', 'shopfloor']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }
  const id = request.nextUrl.searchParams.get('id')?.trim().toUpperCase() ?? '';
  if (!POSITION.test(id)) {
    return NextResponse.json({ ok: false, source: 'sample', error: 'A valid FacilityOS position ID is required.' }, { status: 400 });
  }

  const result = await getFacilityPosition(id);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}

import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../lib/auth/server-guard';
import { resolveQr } from '../../../lib/qr-resolver';
import { lookupResolvedEntity } from '../../../lib/erpnext/entity-lookup';

export async function GET(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['inventory', 'shopfloor']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }
  const value = request.nextUrl.searchParams.get('value') ?? '';
  const resolution = resolveQr(value);
  const live = await lookupResolvedEntity(resolution);

  return NextResponse.json({
    resolution,
    live,
  });
}

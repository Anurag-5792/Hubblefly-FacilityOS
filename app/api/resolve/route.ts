import { NextRequest, NextResponse } from 'next/server';
import { resolveQr } from '../../../lib/qr-resolver';
import { lookupResolvedEntity } from '../../../lib/erpnext/entity-lookup';

export async function GET(request: NextRequest) {
  const value = request.nextUrl.searchParams.get('value') ?? '';
  const resolution = resolveQr(value);
  const live = await lookupResolvedEntity(resolution);

  return NextResponse.json({
    resolution,
    live,
  });
}

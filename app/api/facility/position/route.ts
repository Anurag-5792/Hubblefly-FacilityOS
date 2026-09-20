import { NextRequest, NextResponse } from 'next/server';
import { getFacilityPosition } from '../../../../lib/facility/provider';

const POSITION = /^R\d{2}-L[123]-P\d{2}(?:-S[12])?$/;

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')?.trim().toUpperCase() ?? '';
  if (!POSITION.test(id)) {
    return NextResponse.json({ ok: false, source: 'sample', error: 'A valid FacilityOS position ID is required.' }, { status: 400 });
  }

  const result = await getFacilityPosition(id);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}

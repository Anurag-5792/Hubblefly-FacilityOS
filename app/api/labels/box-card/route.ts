import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../lib/auth/server-guard';
import { sampleBoxCard } from '../../../../lib/documents/provider';

export async function GET(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['inventory']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }

  const containerId = request.nextUrl.searchParams.get('id')?.trim().toUpperCase() ?? '';
  if (!containerId) {
    return NextResponse.json({ ok: false, error: 'Container ID is required.' }, { status: 400 });
  }

  // Preview-safe until the FacilityOS Frappe app is installed.
  return NextResponse.json({ ok: true, source: 'sample', card: sampleBoxCard(containerId) });
}

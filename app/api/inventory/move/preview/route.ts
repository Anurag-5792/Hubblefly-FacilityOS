import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../../lib/auth/server-guard';
import { validateMove } from '../../../../../lib/inventory-workflows';

export async function POST(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['inventory']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, errors: ['Invalid JSON body.'] }, { status: 400 });
  }

  const result = validateMove({
    source: String(body.source ?? ''),
    destination: String(body.destination ?? ''),
    quantity: Number(body.quantity ?? 0),
    condition: body.condition ? String(body.condition) : undefined,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

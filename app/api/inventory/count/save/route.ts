import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../../lib/auth/server-guard';
import { FACILITYOS_SESSION_COOKIE } from '../../../../../lib/auth/frappe-session';
import { savePhysicalCount } from '../../../../../lib/inventory/count-provider';
import { validateCount } from '../../../../../lib/inventory-workflows';

export async function POST(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['inventory']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }
  let body: { target?: unknown; quantity?: unknown; condition?: unknown; container?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, persisted: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const input = {
    target: String(body.target ?? ''),
    quantity: Number(body.quantity ?? 0),
    condition: body.condition ? String(body.condition) : undefined,
    container: body.container ? String(body.container) : undefined,
  };

  const validation = validateCount(input);
  if (!validation.ok) {
    return NextResponse.json({
      ok: false,
      persisted: false,
      error: 'Count validation failed.',
      errors: validation.errors,
    }, { status: 422 });
  }

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const result = await savePhysicalCount(input, sid);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

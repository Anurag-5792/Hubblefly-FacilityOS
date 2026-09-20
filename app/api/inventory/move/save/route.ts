import { NextRequest, NextResponse } from 'next/server';
import { FACILITYOS_SESSION_COOKIE } from '../../../../../lib/auth/frappe-session';
import { saveContainerMove } from '../../../../../lib/inventory/move-provider';
import { validateMove } from '../../../../../lib/inventory-workflows';

export async function POST(request: NextRequest) {
  let body: { source?: unknown; destination?: unknown; quantity?: unknown; condition?: unknown; remarks?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, persisted: false, erpNextPosted: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const input = {
    source: String(body.source ?? ''),
    destination: String(body.destination ?? ''),
    quantity: Number(body.quantity ?? 0),
    condition: body.condition ? String(body.condition) : undefined,
  };

  const validation = validateMove(input);
  if (!validation.ok) {
    return NextResponse.json({
      ok: false,
      persisted: false,
      erpNextPosted: false,
      error: 'Move validation failed.',
      errors: validation.errors,
    }, { status: 422 });
  }

  if (validation.source.type !== 'container' || validation.destination.type !== 'position') {
    return NextResponse.json({
      ok: false,
      persisted: false,
      erpNextPosted: false,
      error: 'Only FacilityOS container-to-position moves can be persisted at this stage. Serial/Batch stock moves remain ERPNext-posting gated.',
    }, { status: 409 });
  }

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const result = await saveContainerMove(
    validation.source.normalized,
    validation.destination.normalized,
    body.remarks ? String(body.remarks) : undefined,
    sid,
  );

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

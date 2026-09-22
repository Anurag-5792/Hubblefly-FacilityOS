import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../lib/auth/server-guard';
import { FACILITYOS_SESSION_COOKIE } from '../../../../lib/auth/frappe-session';
import { createPrintJob, listPrintJobs } from '../../../../lib/documents/provider';
import type { PrintLabelKind } from '../../../../lib/documents/types';

export async function GET(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['admin']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error, jobs: [] }, { status: authorization.status });
  }

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const result = await listPrintJobs(sid);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['inventory']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, persisted: false, error: authorization.error }, { status: authorization.status });
  }

  let body: {
    kind?: unknown;
    explicitPrintQty?: unknown;
    itemCode?: unknown;
    containerIds?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, persisted: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const kind = String(body.kind ?? '') as PrintLabelKind;
  const explicitPrintQty = Number(body.explicitPrintQty ?? 0);
  const itemCode = String(body.itemCode ?? '').trim().toUpperCase() || undefined;
  const containerIds = Array.isArray(body.containerIds)
    ? body.containerIds.map((value) => String(value).trim().toUpperCase()).filter(Boolean)
    : [];

  const allowed = new Set(['SERIAL', 'BATCH', 'POSITION', 'CONTAINER', 'BOX_CARD', 'GENERIC_ITEM']);
  if (!allowed.has(kind)) {
    return NextResponse.json({ ok: false, persisted: false, error: 'Valid label kind is required.' }, { status: 400 });
  }
  if (!Number.isInteger(explicitPrintQty) || explicitPrintQty <= 0) {
    return NextResponse.json({ ok: false, persisted: false, error: 'Exact print quantity must be a positive whole number.' }, { status: 400 });
  }
  if (kind === 'BOX_CARD' && containerIds.length !== explicitPrintQty) {
    return NextResponse.json({ ok: false, persisted: false, error: 'Box Card quantity must match the number of container IDs.' }, { status: 400 });
  }

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const result = await createPrintJob({ kind, explicitPrintQty, itemCode, containerIds }, sid);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

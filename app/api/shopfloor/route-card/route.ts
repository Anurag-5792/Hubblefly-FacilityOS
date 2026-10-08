import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../lib/auth/server-guard';
import { FACILITYOS_SESSION_COOKIE } from '../../../../lib/auth/frappe-session';
import { addGenealogyEvent, completeRouteOperation, getRouteCard } from '../../../../lib/shopfloor/provider';

export async function GET(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['shopfloor']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }

  const routeCardId = request.nextUrl.searchParams.get('id')?.trim() ?? '';
  if (!routeCardId) {
    return NextResponse.json({ ok: false, error: 'Route-card ID is required.' }, { status: 400 });
  }

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const result = await getRouteCard(routeCardId, sid);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}


export async function POST(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['shopfloor']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, persisted: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const action = String(body.action ?? '');
  const routeCardId = String(body.routeCardId ?? '').trim();
  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;

  if (!routeCardId) {
    return NextResponse.json({ ok: false, persisted: false, error: 'Route-card ID is required.' }, { status: 400 });
  }

  if (action === 'complete_operation') {
    const sequence = Number(body.sequence ?? 0);
    if (!Number.isInteger(sequence) || sequence < 1) {
      return NextResponse.json({ ok: false, persisted: false, error: 'Valid operation sequence is required.' }, { status: 400 });
    }
    const result = await completeRouteOperation(
      routeCardId,
      sequence,
      body.scannedComponent ? String(body.scannedComponent).trim().toUpperCase() : undefined,
      body.note ? String(body.note) : undefined,
      sid,
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  }

  if (action === 'add_genealogy') {
    const eventType = String(body.eventType ?? '') as 'BUILT_FROM' | 'INSTALLED_IN' | 'REMOVED_FROM' | 'REPLACED_BY';
    const allowed = new Set(['BUILT_FROM', 'INSTALLED_IN', 'REMOVED_FROM', 'REPLACED_BY']);
    const parentId = String(body.parentId ?? '').trim().toUpperCase();
    const childId = String(body.childId ?? '').trim().toUpperCase();
    const replacementId = body.replacementId ? String(body.replacementId).trim().toUpperCase() : undefined;

    if (!allowed.has(eventType) || !parentId || !childId) {
      return NextResponse.json({ ok: false, persisted: false, error: 'Valid genealogy event, parent and child identities are required.' }, { status: 400 });
    }
    if (eventType === 'REPLACED_BY' && !replacementId) {
      return NextResponse.json({ ok: false, persisted: false, error: 'Replacement identity is required for REPLACED_BY.' }, { status: 400 });
    }

    const result = await addGenealogyEvent({
      routeCardId,
      eventType,
      parentId,
      childId,
      replacementId,
      note: body.note ? String(body.note) : undefined,
    }, sid);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  }

  return NextResponse.json({ ok: false, persisted: false, error: 'Unsupported shopfloor action.' }, { status: 400 });
}

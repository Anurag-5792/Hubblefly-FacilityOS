import { NextRequest, NextResponse } from 'next/server';
import { FACILITYOS_SESSION_COOKIE } from '../../../../lib/auth/frappe-session';
import {
  getTraceabilitySummary,
  markUnusedLabels,
  reportMissingSticker,
  resolveTraceabilityException,
} from '../../../../lib/traceability/provider';

export async function GET(request: NextRequest) {
  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const result = await getTraceabilitySummary(sid);
  return NextResponse.json(result, { status: result.ok ? 200 : 401 });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, persisted: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const action = String(body.action ?? '');
  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;

  if (action === 'mark_unused') {
    const labels = Array.isArray(body.labels)
      ? body.labels.map((value) => String(value).trim().toUpperCase()).filter(Boolean)
      : [];
    if (labels.length === 0) {
      return NextResponse.json({ ok: false, persisted: false, error: 'At least one label ID is required.' }, { status: 400 });
    }
    const result = await markUnusedLabels(
      labels,
      body.itemCode ? String(body.itemCode) : undefined,
      body.reference ? String(body.reference) : undefined,
      body.remarks ? String(body.remarks) : undefined,
      sid,
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  }

  if (action === 'missing_sticker') {
    const entityId = String(body.entityId ?? '').trim().toUpperCase();
    const entityType = String(body.entityType ?? '').trim();
    if (!entityId || !entityType) {
      return NextResponse.json({ ok: false, persisted: false, error: 'Entity type and entity ID are required.' }, { status: 400 });
    }
    const result = await reportMissingSticker({
      entityType,
      entityId,
      itemCode: body.itemCode ? String(body.itemCode) : undefined,
      expectedLabel: body.expectedLabel ? String(body.expectedLabel) : undefined,
      sessionName: body.sessionName ? String(body.sessionName) : undefined,
      remarks: body.remarks ? String(body.remarks) : undefined,
    }, sid);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  }

  if (action === 'resolve') {
    const exceptionId = String(body.exceptionId ?? '').trim();
    const remarks = String(body.remarks ?? '').trim();
    if (!exceptionId || !remarks) {
      return NextResponse.json({ ok: false, persisted: false, error: 'Exception ID and resolution remarks are required.' }, { status: 400 });
    }
    const result = await resolveTraceabilityException(exceptionId, remarks, sid);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  }

  return NextResponse.json({ ok: false, persisted: false, error: 'Unsupported traceability action.' }, { status: 400 });
}

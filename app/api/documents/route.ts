import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../lib/auth/server-guard';
import { FACILITYOS_SESSION_COOKIE } from '../../../lib/auth/frappe-session';
import { saveMovementDocument } from '../../../lib/documents/provider';
import type { FacilityMovementDocument } from '../../../lib/documents/types';

const allowedTypes = new Set(['GRN', 'GATE_PASS', 'DELIVERY_CHALLAN']);

export async function POST(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['inventory']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, persisted: false, error: authorization.error }, { status: authorization.status });
  }

  let body: { document?: FacilityMovementDocument };
  try {
    body = await request.json() as { document?: FacilityMovementDocument };
  } catch {
    return NextResponse.json({ ok: false, persisted: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const document = body.document;
  if (!document || !allowedTypes.has(document.type)) {
    return NextResponse.json({ ok: false, persisted: false, error: 'Valid document type is required.' }, { status: 400 });
  }

  if (!document.company?.trim() || !document.warehouse?.trim()) {
    return NextResponse.json({ ok: false, persisted: false, error: 'Company and warehouse are required.' }, { status: 400 });
  }

  if (!Array.isArray(document.lines) || document.lines.length === 0) {
    return NextResponse.json({ ok: false, persisted: false, error: 'At least one item line is required.' }, { status: 400 });
  }

  for (const line of document.lines) {
    if (!line.itemCode?.trim() || !Number.isFinite(line.qty) || line.qty <= 0 || !line.uom?.trim()) {
      return NextResponse.json({ ok: false, persisted: false, error: 'Each line needs Item Code, positive Qty and UOM.' }, { status: 400 });
    }
  }

  if (document.type === 'GRN' && (!document.partyName?.trim() || !document.supplierInvoice?.trim())) {
    return NextResponse.json({ ok: false, persisted: false, error: 'GRN requires Supplier and Supplier Invoice/Challan.' }, { status: 400 });
  }

  if (document.type !== 'GRN' && (!document.recipient?.trim() || !document.purpose?.trim())) {
    return NextResponse.json({ ok: false, persisted: false, error: 'Recipient and Purpose are required.' }, { status: 400 });
  }

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const result = await saveMovementDocument(document, sid);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

import { NextRequest, NextResponse } from 'next/server';
import {
  previewValidation,
  type ValidationAction,
  type ValidationRequest,
  type ValidationRole,
  type ValidationStatus,
} from '../../../../../lib/reconciliation/validation';

const actions = new Set<ValidationAction>([
  'submit',
  'inventory_validate',
  'inventory_reject',
  'admin_approve',
  'admin_reject',
  'reopen',
]);

const roles = new Set<ValidationRole>(['inventory', 'admin']);
const statuses = new Set<ValidationStatus>([
  'DRAFT',
  'SUBMITTED',
  'INVENTORY_VALIDATED',
  'INVENTORY_REJECTED',
  'ADMIN_APPROVED',
  'ADMIN_REJECTED',
]);

export async function POST(request: NextRequest) {
  let body: Partial<ValidationRequest>;
  try {
    body = await request.json() as Partial<ValidationRequest>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.action || !actions.has(body.action)) {
    return NextResponse.json({ ok: false, error: 'Unsupported validation action.' }, { status: 400 });
  }
  if (!body.actorRole || !roles.has(body.actorRole)) {
    return NextResponse.json({ ok: false, error: 'Inventory or Admin role is required.' }, { status: 400 });
  }
  if (!body.currentStatus || !statuses.has(body.currentStatus)) {
    return NextResponse.json({ ok: false, error: 'Valid current validation status is required.' }, { status: 400 });
  }

  const result = previewValidation({
    action: body.action,
    actorRole: body.actorRole,
    currentStatus: body.currentStatus,
    actorName: body.actorName,
    remarks: body.remarks,
    blockingExceptions: Number(body.blockingExceptions ?? 0),
  });

  return NextResponse.json({
    ...result,
    persisted: false,
    note: 'Preview only until FacilityOS authentication and Frappe validation records are connected.',
  }, { status: result.ok ? 200 : 422 });
}

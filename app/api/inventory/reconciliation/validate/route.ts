import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../../lib/auth/server-guard';
import { FACILITYOS_SESSION_COOKIE } from '../../../../../lib/auth/frappe-session';
import {
  executeValidation,
  usesPersistentValidation,
  type ValidationCommand,
} from '../../../../../lib/reconciliation/validation-provider';
import {
  type ValidationAction,
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
  const authorization = await authorizeFacilityRequest(request, ['inventory', 'admin']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }
  let body: Partial<ValidationCommand>;
  try {
    body = await request.json() as Partial<ValidationCommand>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.action || !actions.has(body.action)) {
    return NextResponse.json({ ok: false, error: 'Unsupported validation action.' }, { status: 400 });
  }

  const persistent = usesPersistentValidation();

  if (!persistent) {
    if (!body.actorRole || !roles.has(body.actorRole)) {
      return NextResponse.json({ ok: false, error: 'Inventory or Admin role is required in preview mode.' }, { status: 400 });
    }
    if (!body.currentStatus || !statuses.has(body.currentStatus)) {
      return NextResponse.json({ ok: false, error: 'Valid current validation status is required.' }, { status: 400 });
    }
  }

  if (persistent && !body.sessionName?.trim()) {
    return NextResponse.json({ ok: false, error: 'Physical-count session is required.' }, { status: 400 });
  }

  const currentStatus = body.currentStatus && statuses.has(body.currentStatus)
    ? body.currentStatus
    : 'DRAFT';

  const command: ValidationCommand = {
    action: body.action,
    sessionName: body.sessionName,
    actorRole: body.actorRole ?? 'inventory',
    actorName: body.actorName,
    currentStatus,
    remarks: body.remarks,
    blockingExceptions: Number(body.blockingExceptions ?? 0),
  };

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const result = await executeValidation(command, sid);

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

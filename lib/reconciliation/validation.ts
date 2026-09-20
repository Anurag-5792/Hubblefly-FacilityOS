export type ValidationRole = 'inventory' | 'admin';

export type ValidationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'INVENTORY_VALIDATED'
  | 'INVENTORY_REJECTED'
  | 'ADMIN_APPROVED'
  | 'ADMIN_REJECTED';

export type ValidationAction =
  | 'submit'
  | 'inventory_validate'
  | 'inventory_reject'
  | 'admin_approve'
  | 'admin_reject'
  | 'reopen';

export type ValidationRequest = {
  action: ValidationAction;
  currentStatus: ValidationStatus;
  actorRole: ValidationRole;
  actorName?: string;
  remarks?: string;
  blockingExceptions?: number;
};

export type ValidationPreview = {
  ok: boolean;
  currentStatus: ValidationStatus;
  nextStatus: ValidationStatus;
  openingStockGate: 'BLOCKED' | 'READY_FOR_APPROVAL';
  message: string;
  errors: string[];
  auditEvent?: {
    action: ValidationAction;
    actorRole: ValidationRole;
    actorName: string;
    remarks: string;
    occurredAt: string;
  };
};

function allowed(
  action: ValidationAction,
  status: ValidationStatus,
  role: ValidationRole,
) {
  if (action === 'submit') return status === 'DRAFT' && role === 'inventory';
  if (action === 'inventory_validate') return status === 'SUBMITTED' && role === 'inventory';
  if (action === 'inventory_reject') return status === 'SUBMITTED' && role === 'inventory';
  if (action === 'admin_approve') return status === 'INVENTORY_VALIDATED' && role === 'admin';
  if (action === 'admin_reject') return status === 'INVENTORY_VALIDATED' && role === 'admin';
  if (action === 'reopen') return (status === 'INVENTORY_REJECTED' || status === 'ADMIN_REJECTED') && role === 'inventory';
  return false;
}

function nextStatus(action: ValidationAction): ValidationStatus {
  if (action === 'submit') return 'SUBMITTED';
  if (action === 'inventory_validate') return 'INVENTORY_VALIDATED';
  if (action === 'inventory_reject') return 'INVENTORY_REJECTED';
  if (action === 'admin_approve') return 'ADMIN_APPROVED';
  if (action === 'admin_reject') return 'ADMIN_REJECTED';
  return 'DRAFT';
}

export function previewValidation(input: ValidationRequest): ValidationPreview {
  const errors: string[] = [];
  const blockingExceptions = Number(input.blockingExceptions ?? 0);

  if (!allowed(input.action, input.currentStatus, input.actorRole)) {
    errors.push('This role/action is not allowed from the current validation status.');
  }

  if ((input.action === 'inventory_reject' || input.action === 'admin_reject') && !input.remarks?.trim()) {
    errors.push('Remarks are required when rejecting a validation.');
  }

  if (input.action === 'inventory_validate' && blockingExceptions > 0) {
    errors.push('Inventory validation cannot pass while blocking reconciliation exceptions remain.');
  }

  if (input.action === 'admin_approve' && blockingExceptions > 0) {
    errors.push('Admin approval cannot pass while blocking reconciliation exceptions remain.');
  }

  const proposed = nextStatus(input.action);
  const ok = errors.length === 0;
  const finalStatus = ok ? proposed : input.currentStatus;

  return {
    ok,
    currentStatus: input.currentStatus,
    nextStatus: finalStatus,
    openingStockGate: finalStatus === 'ADMIN_APPROVED' && blockingExceptions === 0
      ? 'READY_FOR_APPROVAL'
      : 'BLOCKED',
    message: ok
      ? finalStatus === 'ADMIN_APPROVED'
        ? 'Admin validation approved. Opening stock is eligible for a separate posting approval step.'
        : `Validation moved to ${finalStatus}.`
      : 'Validation preview failed.',
    errors,
    auditEvent: ok ? {
      action: input.action,
      actorRole: input.actorRole,
      actorName: input.actorName?.trim() || 'Current user',
      remarks: input.remarks?.trim() || '',
      occurredAt: new Date().toISOString(),
    } : undefined,
  };
}

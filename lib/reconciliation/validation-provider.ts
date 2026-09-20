import type { ValidationPreview, ValidationRequest, ValidationStatus } from './validation';
import { previewValidation } from './validation';

export type ValidationCommand = ValidationRequest & {
  sessionName?: string;
};

export type ValidationExecution = ValidationPreview & {
  persisted: boolean;
  note?: string;
  actor?: string;
};

function useFrappeValidation() {
  return process.env.FACILITYOS_OPERATIONS_SOURCE === 'frappe'
    || (!process.env.FACILITYOS_OPERATIONS_SOURCE && process.env.FACILITYOS_MIS_SOURCE === 'frappe');
}

export function usesPersistentValidation() {
  return useFrappeValidation();
}

export async function executeValidation(
  input: ValidationCommand,
  sid?: string,
): Promise<ValidationExecution> {
  if (!useFrappeValidation()) {
    return {
      ...previewValidation(input),
      persisted: false,
      note: 'Preview mode: validation is not persisted.',
    };
  }

  if (!input.sessionName) {
    return {
      ok: false,
      currentStatus: input.currentStatus,
      nextStatus: input.currentStatus,
      openingStockGate: 'BLOCKED',
      message: 'A physical-count session is required.',
      errors: ['No FacilityOS physical-count session was supplied.'],
      persisted: false,
    };
  }

  if (!sid) {
    return {
      ok: false,
      currentStatus: input.currentStatus,
      nextStatus: input.currentStatus,
      openingStockGate: 'BLOCKED',
      message: 'Authentication required.',
      errors: ['Sign in with a FacilityOS/Frappe user before validating inventory.'],
      persisted: false,
    };
  }

  const baseUrl = process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    return {
      ok: false,
      currentStatus: input.currentStatus,
      nextStatus: input.currentStatus,
      openingStockGate: 'BLOCKED',
      message: 'FacilityOS server is not configured.',
      errors: ['ERPNEXT_BASE_URL is missing.'],
      persisted: false,
    };
  }

  try {
    const response = await fetch(`${baseUrl}/api/method/facility_os.api.validation.act`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cookie: `sid=${sid}`,
      },
      body: JSON.stringify({
        session_name: input.sessionName,
        action: input.action,
        remarks: input.remarks ?? '',
      }),
      cache: 'no-store',
    });

    const payload = await response.json() as {
      message?: {
        ok?: boolean;
        currentStatus?: ValidationStatus;
        nextStatus?: ValidationStatus;
        openingStockGate?: 'BLOCKED' | 'READY_FOR_APPROVAL';
        persisted?: boolean;
        message?: string;
        actor?: string;
      };
      exception?: string;
      exc_type?: string;
      message?: unknown;
    };

    if (!response.ok || !payload.message || typeof payload.message !== 'object') {
      throw new Error('FacilityOS validation was rejected by the server.');
    }

    const message = payload.message as {
      ok?: boolean;
      currentStatus?: ValidationStatus;
      nextStatus?: ValidationStatus;
      openingStockGate?: 'BLOCKED' | 'READY_FOR_APPROVAL';
      persisted?: boolean;
      message?: string;
      actor?: string;
    };

    return {
      ok: message.ok === true,
      currentStatus: message.currentStatus ?? input.currentStatus,
      nextStatus: message.nextStatus ?? input.currentStatus,
      openingStockGate: message.openingStockGate ?? 'BLOCKED',
      message: message.message ?? 'Validation recorded.',
      errors: [],
      persisted: message.persisted === true,
      actor: message.actor,
    };
  } catch {
    return {
      ok: false,
      currentStatus: input.currentStatus,
      nextStatus: input.currentStatus,
      openingStockGate: 'BLOCKED',
      message: 'FacilityOS validation failed.',
      errors: ['The validation could not be persisted. Check the signed-in role and FacilityOS server connection.'],
      persisted: false,
    };
  }
}

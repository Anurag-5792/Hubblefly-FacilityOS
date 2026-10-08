import type { ReconciliationSummary } from './types';
import { sampleReconciliation } from './sample-provider';

type FrappeResponse = {
  message?: ReconciliationSummary;
};

function useFrappeOperations() {
  return process.env.FACILITYOS_OPERATIONS_SOURCE === 'frappe'
    || (!process.env.FACILITYOS_OPERATIONS_SOURCE && process.env.FACILITYOS_MIS_SOURCE === 'frappe');
}

export async function getReconciliationSummary(): Promise<ReconciliationSummary> {
  if (!useFrappeOperations()) return sampleReconciliation();

  const baseUrl = process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '');
  const apiKey = process.env.ERPNEXT_API_KEY;
  const apiSecret = process.env.ERPNEXT_API_SECRET;

  if (!baseUrl || !apiKey || !apiSecret) {
    return {
      ok: false,
      source: 'facilityos',
      rows: [],
      totals: { counted: 0, pending: 0, exceptions: 0, ready: 0 },
      openingStockGate: 'BLOCKED',
      error: 'FacilityOS server connection is not configured.',
    };
  }

  try {
    const response = await fetch(`${baseUrl}/api/method/facility_os.api.reconciliation.summary`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `token ${apiKey}:${apiSecret}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        ok: false,
        source: 'facilityos',
        rows: [],
        totals: { counted: 0, pending: 0, exceptions: 0, ready: 0 },
        openingStockGate: 'BLOCKED',
        error: `FacilityOS reconciliation endpoint failed with HTTP ${response.status}.`,
      };
    }

    const payload = await response.json() as FrappeResponse;
    if (!payload.message) {
      return {
        ok: false,
        source: 'facilityos',
        rows: [],
        totals: { counted: 0, pending: 0, exceptions: 0, ready: 0 },
        openingStockGate: 'BLOCKED',
        error: 'FacilityOS reconciliation endpoint returned no data.',
      };
    }

    return payload.message;
  } catch {
    return {
      ok: false,
      source: 'facilityos',
      rows: [],
      totals: { counted: 0, pending: 0, exceptions: 0, ready: 0 },
      openingStockGate: 'BLOCKED',
      error: 'FacilityOS reconciliation summary could not be loaded.',
    };
  }
}

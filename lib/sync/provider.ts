import type { SyncStatusResponse } from './types';

const sample: SyncStatusResponse = {
  ok: true,
  source: 'sample',
  projections: [
    { projection: 'Item Snapshot', status: 'sample', lastSuccessAt: null, lagSeconds: null, rowsProcessed: 0 },
    { projection: 'Warehouse Snapshot', status: 'sample', lastSuccessAt: null, lagSeconds: null, rowsProcessed: 0 },
    { projection: 'Serial Snapshot', status: 'sample', lastSuccessAt: null, lagSeconds: null, rowsProcessed: 0 },
    { projection: 'Batch Snapshot', status: 'sample', lastSuccessAt: null, lagSeconds: null, rowsProcessed: 0 },
    { projection: 'Stock Balance', status: 'sample', lastSuccessAt: null, lagSeconds: null, rowsProcessed: 0 },
    { projection: 'Stock Movement Fact', status: 'sample', lastSuccessAt: null, lagSeconds: null, rowsProcessed: 0 },
  ],
};

function live() {
  return process.env.FACILITYOS_MIS_SOURCE === 'frappe';
}

async function call(method: 'status' | 'run', sid?: string): Promise<SyncStatusResponse> {
  if (!live()) return sample;
  if (!sid) {
    return { ok: false, source: 'facilityos-read-model', projections: [], error: 'Authentication required.' };
  }

  const baseUrl = process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    return { ok: false, source: 'facilityos-read-model', projections: [], error: 'Frappe base URL is not configured.' };
  }

  try {
    const response = await fetch(`${baseUrl}/api/method/facility_os.api.sync.${method}`, {
      method: method === 'run' ? 'POST' : 'GET',
      headers: {
        Accept: 'application/json',
        Cookie: `sid=${sid}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) throw new Error('Frappe sync request failed.');
    const payload = await response.json() as { message?: SyncStatusResponse };
    if (!payload.message) throw new Error('Frappe sync response was empty.');
    return payload.message;
  } catch {
    return {
      ok: false,
      source: 'facilityos-read-model',
      projections: [],
      error: method === 'run' ? 'FacilityOS sync could not be run.' : 'FacilityOS sync status could not be loaded.',
    };
  }
}

export function getSyncStatus(sid?: string) {
  return call('status', sid);
}

export function runSyncNow(sid?: string) {
  return call('run', sid);
}

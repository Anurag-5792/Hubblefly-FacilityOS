import type {
  FacilityContainerResponse,
  FacilityPositionResponse,
} from './types';
import { sampleContainerById, samplePositionById } from './sample-provider';

type FrappePositionResponse = {
  message?: FacilityPositionResponse['position'] & { last_synced_at?: string | null };
};

type FrappeContainerResponse = {
  message?: FacilityContainerResponse['container'] & { last_synced_at?: string | null };
};

function useFrappeOperations() {
  return process.env.FACILITYOS_OPERATIONS_SOURCE === 'frappe'
    || (!process.env.FACILITYOS_OPERATIONS_SOURCE && process.env.FACILITYOS_MIS_SOURCE === 'frappe');
}

function connection() {
  const baseUrl = process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '');
  const apiKey = process.env.ERPNEXT_API_KEY;
  const apiSecret = process.env.ERPNEXT_API_SECRET;
  if (!baseUrl || !apiKey || !apiSecret) return null;
  return { baseUrl, apiKey, apiSecret };
}

async function frappeMethod<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const cfg = connection();
  if (!cfg) throw new Error('FacilityOS server connection is not configured.');

  const response = await fetch(`${cfg.baseUrl}/api/method/${method}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`FacilityOS read failed with HTTP ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

export async function getFacilityPosition(id: string): Promise<FacilityPositionResponse> {
  if (!useFrappeOperations()) return samplePositionById(id);

  try {
    const payload = await frappeMethod<FrappePositionResponse>('facility_os.api.store.get_position', { position_id: id });
    if (!payload.message) {
      return { ok: false, source: 'facilityos', error: 'Position was not found.' };
    }

    const { last_synced_at: lastSyncedAt = null, ...position } = payload.message;
    return { ok: true, source: 'facilityos', position, lastSyncedAt };
  } catch {
    return { ok: false, source: 'facilityos', error: 'FacilityOS position data could not be loaded.' };
  }
}

export async function getFacilityContainer(id: string): Promise<FacilityContainerResponse> {
  if (!useFrappeOperations()) return sampleContainerById(id);

  try {
    const payload = await frappeMethod<FrappeContainerResponse>('facility_os.api.store.get_container', { container_id: id });
    if (!payload.message) {
      return { ok: false, source: 'facilityos', error: 'Container was not found.' };
    }

    const { last_synced_at: lastSyncedAt = null, ...container } = payload.message;
    return { ok: true, source: 'facilityos', container, lastSyncedAt };
  } catch {
    return { ok: false, source: 'facilityos', error: 'FacilityOS container data could not be loaded.' };
  }
}

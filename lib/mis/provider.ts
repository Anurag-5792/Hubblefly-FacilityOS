import type { MisFilters, MisQueryResponse } from './types';
import { querySampleMis } from './sample-provider';

type FrappeMisResponse = {
  message?: {
    rows?: MisQueryResponse['rows'];
    total?: number;
    last_synced_at?: string | null;
  };
};

function useFrappeReadModel() {
  return process.env.FACILITYOS_MIS_SOURCE === 'frappe';
}

export async function queryMis(filters: MisFilters): Promise<MisQueryResponse> {
  if (!useFrappeReadModel()) return querySampleMis(filters);

  const baseUrl = process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '');
  const apiKey = process.env.ERPNEXT_API_KEY;
  const apiSecret = process.env.ERPNEXT_API_SECRET;

  if (!baseUrl || !apiKey || !apiSecret) {
    return {
      ok: false,
      source: 'facilityos-read-model',
      lastSyncedAt: null,
      rows: [],
      total: 0,
      error: 'FacilityOS Frappe read model is selected but server credentials are not configured.',
    };
  }

  try {
    const response = await fetch(`${baseUrl}/api/method/facility_os.api.mis.query`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `token ${apiKey}:${apiSecret}`,
      },
      body: JSON.stringify({ filters }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`FacilityOS MIS endpoint failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    const payload = await response.json() as FrappeMisResponse;
    const rows = payload.message?.rows ?? [];

    return {
      ok: true,
      source: 'facilityos-read-model',
      lastSyncedAt: payload.message?.last_synced_at ?? null,
      rows,
      total: payload.message?.total ?? rows.reduce((sum, row) => sum + row.displayed, 0),
    };
  } catch (error) {
    return {
      ok: false,
      source: 'facilityos-read-model',
      lastSyncedAt: null,
      rows: [],
      total: 0,
      error: error instanceof Error ? error.message : 'FacilityOS MIS query failed.',
    };
  }
}

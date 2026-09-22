import type { TraceabilityMutation, TraceabilitySummary } from './types';

const sampleSummary: TraceabilitySummary = {
  ok: true,
  source: 'sample',
  labelCounts: { Prepared: 12, Applied: 24, Unused: 8, Void: 1 },
  exceptionCounts: { 'Missing Sticker': 2 },
  openBlocking: 2,
  exceptions: [
    {
      name: 'SAMPLE-EXC-001',
      exception_type: 'Missing Sticker',
      entity_type: 'SFG',
      entity_id: 'SFG-SAMPLE-001',
      item_code: 'SAMPLE-MTR-01',
      blocking: 1,
      reported_by: 'preview@facilityos.local',
      reported_at: '2026-09-21T10:00:00+05:30',
    },
  ],
};

function live() {
  return process.env.FACILITYOS_OPERATIONS_SOURCE === 'frappe'
    || (!process.env.FACILITYOS_OPERATIONS_SOURCE && process.env.FACILITYOS_MIS_SOURCE === 'frappe');
}

function baseUrl() {
  return process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '') ?? '';
}

async function frappeCall<T>(
  method: string,
  sid: string | undefined,
  body?: Record<string, unknown>,
): Promise<T> {
  const base = baseUrl();
  if (!base || !sid) throw new Error('FacilityOS session is unavailable.');

  const response = await fetch(`${base}/api/method/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      Cookie: `sid=${sid}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (!response.ok) throw new Error('FacilityOS traceability request failed.');
  return response.json() as Promise<T>;
}

export async function getTraceabilitySummary(sid?: string): Promise<TraceabilitySummary> {
  if (!live()) return sampleSummary;
  try {
    const payload = await frappeCall<{ message?: Omit<TraceabilitySummary, 'source'> }>(
      'facility_os.api.traceability.summary',
      sid,
    );
    if (!payload.message) throw new Error('No traceability response.');
    return { ...payload.message, source: 'facilityos' };
  } catch {
    return {
      ok: false,
      source: 'facilityos',
      labelCounts: {},
      exceptionCounts: {},
      openBlocking: 0,
      exceptions: [],
      error: 'Traceability data could not be loaded.',
    };
  }
}

export async function markUnusedLabels(
  labels: string[],
  itemCode: string | undefined,
  reference: string | undefined,
  remarks: string | undefined,
  sid?: string,
): Promise<TraceabilityMutation> {
  if (!live()) {
    return { ok: true, persisted: false, updated: labels.length, status: 'Unused', note: 'Preview mode only.' };
  }
  try {
    const payload = await frappeCall<{ message?: { ok?: boolean; updated?: number; status?: string } }>(
      'facility_os.api.traceability.mark_unused',
      sid,
      { labels, item_code: itemCode, source_reference: reference, remarks },
    );
    return {
      ok: payload.message?.ok === true,
      persisted: payload.message?.ok === true,
      updated: payload.message?.updated ?? 0,
      status: payload.message?.status,
    };
  } catch {
    return { ok: false, persisted: false, error: 'Unused labels could not be recorded.' };
  }
}

export async function reportMissingSticker(
  input: {
    entityType: string;
    entityId: string;
    itemCode?: string;
    expectedLabel?: string;
    sessionName?: string;
    remarks?: string;
  },
  sid?: string,
): Promise<TraceabilityMutation> {
  if (!live()) {
    return { ok: true, persisted: false, exceptionId: 'SAMPLE-EXC', created: true, note: 'Preview mode only.' };
  }
  try {
    const payload = await frappeCall<{ message?: { ok?: boolean; exceptionId?: string; created?: boolean } }>(
      'facility_os.api.traceability.report_missing_sticker',
      sid,
      {
        entity_type: input.entityType,
        entity_id: input.entityId,
        item_code: input.itemCode,
        expected_label: input.expectedLabel,
        session_name: input.sessionName,
        remarks: input.remarks,
      },
    );
    return {
      ok: payload.message?.ok === true,
      persisted: payload.message?.ok === true,
      exceptionId: payload.message?.exceptionId,
      created: payload.message?.created,
    };
  } catch {
    return { ok: false, persisted: false, error: 'Traceability exception could not be recorded.' };
  }
}

export async function resolveTraceabilityException(
  exceptionId: string,
  remarks: string,
  sid?: string,
): Promise<TraceabilityMutation> {
  if (!live()) {
    return { ok: true, persisted: false, exceptionId, status: 'Resolved', note: 'Preview mode only.' };
  }
  try {
    const payload = await frappeCall<{ message?: { ok?: boolean; exceptionId?: string; status?: string } }>(
      'facility_os.api.traceability.resolve',
      sid,
      { exception_id: exceptionId, remarks },
    );
    return {
      ok: payload.message?.ok === true,
      persisted: payload.message?.ok === true,
      exceptionId: payload.message?.exceptionId,
      status: payload.message?.status,
    };
  } catch {
    return { ok: false, persisted: false, error: 'Traceability exception could not be resolved.' };
  }
}

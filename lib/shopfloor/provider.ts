import type { RouteCardResponse } from './types';

const sample: RouteCardResponse = {
  ok: true,
  source: 'sample',
  routeCard: {
    id: 'RC-SAMPLE-0001',
    sfgCode: 'SFG-ARM-01',
    serialNo: 'SFG-ARM-01-S0017',
    status: 'in_progress',
    currentOperation: 2,
    startedAt: '2026-09-21T09:30:00+05:30',
    completedAt: null,
    operations: [
      { sequence: 1, operation: 'Verify SFG identity', status: 'complete', operator: 'Preview Operator', completedAt: '2026-09-21T09:31:00+05:30' },
      { sequence: 2, operation: 'Scan propulsion motor', status: 'in_progress', expectedComponent: 'PSY-MTR-03 / PSY-MTR-04' },
      { sequence: 3, operation: 'Scan arm tube and folding mount', status: 'pending', expectedComponent: 'Arm tube + foldable mount' },
      { sequence: 4, operation: 'Record BUILT_FROM genealogy', status: 'pending' },
      { sequence: 5, operation: 'Inspection and stage complete', status: 'pending' },
    ],
    genealogy: [],
  },
  note: 'Synthetic route card. Live route cards load from the FacilityOS Frappe app after installation.',
};

function live() {
  return process.env.FACILITYOS_OPERATIONS_SOURCE === 'frappe'
    || (!process.env.FACILITYOS_OPERATIONS_SOURCE && process.env.FACILITYOS_MIS_SOURCE === 'frappe');
}

export async function getRouteCard(routeCardId: string, sid?: string): Promise<RouteCardResponse> {
  if (!live()) {
    return {
      ...sample,
      routeCard: sample.routeCard ? { ...sample.routeCard, id: routeCardId || sample.routeCard.id } : undefined,
    };
  }

  const baseUrl = process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl || !sid) {
    return { ok: false, source: 'facilityos', error: 'FacilityOS authentication or server URL is unavailable.' };
  }

  try {
    const url = new URL(`${baseUrl}/api/method/facility_os.api.shopfloor.get_route_card`);
    url.searchParams.set('route_card_id', routeCardId);
    const response = await fetch(url, {
      headers: { Accept: 'application/json', Cookie: `sid=${sid}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Route card lookup failed.');
    const payload = await response.json() as { message?: RouteCardResponse };
    if (!payload.message) throw new Error('Empty route card response.');
    return payload.message;
  } catch {
    return { ok: false, source: 'facilityos', error: 'Route card could not be loaded.' };
  }
}


export type ShopfloorMutation = {
  ok: boolean;
  persisted: boolean;
  routeCard?: RouteCardResponse['routeCard'];
  eventId?: string;
  event?: string;
  parentId?: string;
  childId?: string;
  replacementId?: string | null;
  operator?: string;
  occurredAt?: string;
  erpNextPosted?: boolean;
  note?: string;
  error?: string;
};

async function frappePost<T>(
  method: string,
  body: Record<string, unknown>,
  sid?: string,
): Promise<T> {
  const baseUrl = process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl || !sid) throw new Error('FacilityOS authentication or server URL is unavailable.');

  const response = await fetch(baseUrl + '/api/method/' + method, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Cookie: 'sid=' + sid,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('FacilityOS shopfloor mutation failed.');
  return response.json() as Promise<T>;
}

export async function completeRouteOperation(
  routeCardId: string,
  sequence: number,
  scannedComponent: string | undefined,
  note: string | undefined,
  sid?: string,
): Promise<ShopfloorMutation> {
  if (!live()) {
    return {
      ok: true,
      persisted: false,
      note: 'Preview mode: operation completion was validated but not persisted.',
      erpNextPosted: false,
    };
  }

  try {
    const payload = await frappePost<{ message?: RouteCardResponse }>(
      'facility_os.api.shopfloor.complete_operation',
      {
        route_card_id: routeCardId,
        sequence,
        scanned_component: scannedComponent ?? '',
        note: note ?? '',
      },
      sid,
    );
    return {
      ok: payload.message?.ok === true,
      persisted: payload.message?.ok === true,
      routeCard: payload.message?.routeCard,
      erpNextPosted: false,
    };
  } catch {
    return { ok: false, persisted: false, erpNextPosted: false, error: 'Route operation could not be completed.' };
  }
}

export async function addGenealogyEvent(
  input: {
    routeCardId: string;
    eventType: 'BUILT_FROM' | 'INSTALLED_IN' | 'REMOVED_FROM' | 'REPLACED_BY';
    parentId: string;
    childId: string;
    replacementId?: string;
    note?: string;
  },
  sid?: string,
): Promise<ShopfloorMutation> {
  if (!live()) {
    return {
      ok: true,
      persisted: false,
      event: input.eventType,
      parentId: input.parentId,
      childId: input.childId,
      replacementId: input.replacementId ?? null,
      note: 'Preview mode: genealogy event was validated but not persisted.',
      erpNextPosted: false,
    };
  }

  try {
    const payload = await frappePost<{ message?: Omit<ShopfloorMutation, 'persisted'> & { persisted?: boolean } }>(
      'facility_os.api.shopfloor.add_genealogy_event',
      {
        route_card_id: input.routeCardId,
        event_type: input.eventType,
        parent_id: input.parentId,
        child_id: input.childId,
        replacement_id: input.replacementId ?? '',
        note: input.note ?? '',
      },
      sid,
    );
    const message = payload.message;
    return {
      ok: message?.ok === true,
      persisted: message?.persisted === true,
      eventId: message?.eventId,
      event: message?.event,
      parentId: message?.parentId,
      childId: message?.childId,
      replacementId: message?.replacementId,
      operator: message?.operator,
      occurredAt: message?.occurredAt,
      erpNextPosted: false,
    };
  } catch {
    return { ok: false, persisted: false, erpNextPosted: false, error: 'Genealogy event could not be recorded.' };
  }
}

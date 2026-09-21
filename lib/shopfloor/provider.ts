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

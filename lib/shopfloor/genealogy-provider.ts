import type { GenealogyExplorerResponse } from './genealogy-types';

const sample: GenealogyExplorerResponse = {
  ok: true,
  source: 'preview',
  root: 'SFG-ARM-01-S0017',
  depth: 3,
  nodes: ['SFG-ARM-01-S0017', 'PSY-MTR-03-S0042', 'ARM-TUBE-SAMPLE-001', 'DRN-SAMPLE-001'],
  events: [
    {
      id: 'SAMPLE-GEN-001',
      event: 'BUILT_FROM',
      parentId: 'SFG-ARM-01-S0017',
      childId: 'PSY-MTR-03-S0042',
      routeCard: 'RC-SAMPLE-0001',
      operator: 'Preview Operator',
      occurredAt: '2026-09-21T10:15:00+05:30',
    },
    {
      id: 'SAMPLE-GEN-002',
      event: 'BUILT_FROM',
      parentId: 'SFG-ARM-01-S0017',
      childId: 'ARM-TUBE-SAMPLE-001',
      routeCard: 'RC-SAMPLE-0001',
      operator: 'Preview Operator',
      occurredAt: '2026-09-21T10:20:00+05:30',
    },
    {
      id: 'SAMPLE-GEN-003',
      event: 'INSTALLED_IN',
      parentId: 'DRN-SAMPLE-001',
      childId: 'SFG-ARM-01-S0017',
      operator: 'Preview Operator',
      occurredAt: '2026-09-21T11:00:00+05:30',
    },
  ],
};

function live() {
  return process.env.FACILITYOS_OPERATIONS_SOURCE === 'frappe'
    || (!process.env.FACILITYOS_OPERATIONS_SOURCE && process.env.FACILITYOS_MIS_SOURCE === 'frappe');
}

export async function exploreGenealogy(entityId: string, depth: number, sid?: string): Promise<GenealogyExplorerResponse> {
  const root = entityId.trim().toUpperCase();
  if (!live()) return { ...sample, root: root || sample.root, depth };

  const baseUrl = process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl || !sid) {
    return { ok: false, source: 'facilityos', root, depth, nodes: [], events: [], error: 'FacilityOS authentication or server URL is unavailable.' };
  }

  try {
    const url = new URL(baseUrl + '/api/method/facility_os.api.genealogy.explore');
    url.searchParams.set('entity_id', root);
    url.searchParams.set('depth', String(depth));
    const response = await fetch(url, {
      headers: { Accept: 'application/json', Cookie: 'sid=' + sid },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Genealogy lookup failed.');
    const payload = await response.json() as { message?: Omit<GenealogyExplorerResponse, 'source'> };
    if (!payload.message) throw new Error('Empty genealogy response.');
    return { ...payload.message, source: 'facilityos' };
  } catch {
    return { ok: false, source: 'facilityos', root, depth, nodes: [], events: [], error: 'Genealogy could not be loaded.' };
  }
}

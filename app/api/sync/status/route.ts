import { NextResponse } from 'next/server';
import type { SyncStatusResponse } from '../../../../lib/sync/types';

export async function GET() {
  const source = process.env.FACILITYOS_MIS_SOURCE === 'frappe'
    ? 'facilityos-read-model'
    : 'sample';

  // The Frappe implementation will read FacilityOS Sync State.
  // Until that DocType is installed, return explicit sample/pending statuses.
  const payload: SyncStatusResponse = {
    ok: true,
    source,
    projections: [
      { projection: 'Item Snapshot', status: source === 'sample' ? 'sample' : 'pending', lastSuccessAt: null, lagSeconds: null, rowsProcessed: 0 },
      { projection: 'Warehouse Snapshot', status: source === 'sample' ? 'sample' : 'pending', lastSuccessAt: null, lagSeconds: null, rowsProcessed: 0 },
      { projection: 'Serial Snapshot', status: source === 'sample' ? 'sample' : 'pending', lastSuccessAt: null, lagSeconds: null, rowsProcessed: 0 },
      { projection: 'Batch Snapshot', status: source === 'sample' ? 'sample' : 'pending', lastSuccessAt: null, lagSeconds: null, rowsProcessed: 0 },
      { projection: 'Stock Balance', status: source === 'sample' ? 'sample' : 'pending', lastSuccessAt: null, lagSeconds: null, rowsProcessed: 0 },
      { projection: 'Stock Movement Fact', status: source === 'sample' ? 'sample' : 'pending', lastSuccessAt: null, lagSeconds: null, rowsProcessed: 0 },
    ],
  };

  return NextResponse.json(payload);
}

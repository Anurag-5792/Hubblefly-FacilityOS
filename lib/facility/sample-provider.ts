import type {
  FacilityContainer,
  FacilityContainerResponse,
  FacilityPosition,
  FacilityPositionResponse,
} from './types';

const sampleContainer: FacilityContainer = {
  id: 'BN-014',
  kind: 'BN',
  label: 'Reusable main-store bin',
  status: 'active',
  currentPosition: 'R03-L2-P04-S2',
  capacity: null,
  contents: [
    { itemCode: 'PSY-MTR-03', itemName: 'Motor CCW', quantity: 2, serialNos: ['PSY-MTR-03-S0042', 'PSY-MTR-03-S0043'], condition: 'Good' },
    { itemCode: 'STR-FMT-01', itemName: '30 mm Folding Mount', quantity: 4, condition: 'Good' },
  ],
  history: [
    { occurredAt: '2026-09-18T11:10:00+05:30', event: 'COUNTED', to: 'R03-L2-P04-S2', performedBy: 'Preview operator', reference: 'COUNT-PREVIEW-001' },
    { occurredAt: '2026-09-16T15:20:00+05:30', event: 'MOVED', from: 'R02-L1-P03-S1', to: 'R03-L2-P04-S2', performedBy: 'Preview operator', reference: 'MOVE-PREVIEW-004' },
  ],
};

const samplePosition: FacilityPosition = {
  id: 'R03-L2-P04-S2',
  rack: 'R03',
  level: 'L2',
  position: 'P04',
  stackSlot: 'S2',
  status: 'active',
  containers: [sampleContainer],
  looseContents: [
    { itemCode: 'ELE-SNS-01', itemName: 'TF Mini+', quantity: 3, condition: 'Good' },
  ],
};

export function samplePositionById(id: string): FacilityPositionResponse {
  const normalized = id.trim().toUpperCase();
  const position = normalized === samplePosition.id
    ? samplePosition
    : {
        ...samplePosition,
        id: normalized,
        rack: normalized.split('-')[0] || 'R00',
        level: normalized.split('-')[1] || 'L1',
        position: normalized.split('-')[2] || 'P01',
        stackSlot: (normalized.split('-')[3] as 'S1' | 'S2' | undefined) ?? null,
        containers: [],
        looseContents: [],
      };

  return {
    ok: true,
    source: 'sample',
    position,
    lastSyncedAt: null,
    note: 'Synthetic preview data only. Real physical-count and placement data stays outside the public repository.',
  };
}

export function sampleContainerById(id: string): FacilityContainerResponse {
  const normalized = id.trim().toUpperCase();
  const kind: FacilityContainer['kind'] = normalized.startsWith('BB-') ? 'BB' : normalized.startsWith('BX-') ? 'BX' : 'BN';
  const container: FacilityContainer = normalized === sampleContainer.id
    ? sampleContainer
    : {
        ...sampleContainer,
        id: normalized,
        kind,
        label: kind === 'BB' ? 'Battery box' : kind === 'BX' ? 'Store box' : 'Reusable main-store bin',
        currentPosition: null,
        contents: [],
        history: [],
      };

  return {
    ok: true,
    source: 'sample',
    container,
    lastSyncedAt: null,
    note: 'Synthetic preview data only. Real physical-count and placement data stays outside the public repository.',
  };
}

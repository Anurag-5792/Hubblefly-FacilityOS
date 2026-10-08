export type QrEntityType =
  | 'serial'
  | 'batch'
  | 'position'
  | 'container'
  | 'sfg'
  | 'drone'
  | 'unknown';

export type QrResolution = {
  raw: string;
  normalized: string;
  type: QrEntityType;
  title: string;
  subtitle: string;
  actions: string[];
  fields: Array<{ label: string; value: string }>;
};

const SERIAL = /^([A-Z0-9]+(?:-[A-Z0-9]+)+)-S(\d{4,})$/;
const BATCH = /^([A-Z0-9]+(?:-[A-Z0-9]+)+)-B(\d{3,})$/;
const POSITION = /^(R\d{2})-(L[123])-(P\d{2})(?:-(S[12]))?$/;
const CONTAINER = /^(BN|BX|BB)-(\d{3,})$/;
const SFG = /^(SFG-[A-Z0-9-]+)-S(\d{4,})$/;
const DRONE = /^(DRN|UAS)-[A-Z0-9-]+$/;

export function resolveQr(value: string): QrResolution {
  const raw = value;
  const normalized = value.trim().toUpperCase();

  if (!normalized) {
    return unknown(raw, normalized, 'Enter or scan a QR value.');
  }

  const sfg = normalized.match(SFG);
  if (sfg) {
    return {
      raw,
      normalized,
      type: 'sfg',
      title: 'Semi-finished assembly',
      subtitle: sfg[1],
      actions: ['Open Route Card', 'View Genealogy', 'Install Component', 'Move to Store'],
      fields: [
        { label: 'SFG code', value: sfg[1] },
        { label: 'Serial', value: `S${sfg[2]}` },
        { label: 'Data source', value: 'Preview — ERPNext not connected' }
      ]
    };
  }

  const position = normalized.match(POSITION);
  if (position) {
    return {
      raw,
      normalized,
      type: 'position',
      title: 'Store position',
      subtitle: [position[1], position[2], position[3], position[4]].filter(Boolean).join('-'),
      actions: ['View Contents', 'Place Container', 'Move Stock Here', 'Physical Count'],
      fields: [
        { label: 'Rack', value: position[1] },
        { label: 'Level', value: position[2] },
        { label: 'Position', value: position[3] },
        { label: 'Stack slot', value: position[4] ?? 'Not specified — choose S1/S2 during placement' }
      ]
    };
  }

  const container = normalized.match(CONTAINER);
  if (container) {
    const kind = container[1] === 'BN' ? 'Reusable bin' : container[1] === 'BB' ? 'Battery box' : 'Store box';
    return {
      raw,
      normalized,
      type: 'container',
      title: kind,
      subtitle: normalized,
      actions: ['View Contents', 'Move Container', 'Add Stock', 'Remove Stock', 'Physical Count'],
      fields: [
        { label: 'Container ID', value: normalized },
        { label: 'Container type', value: kind },
        { label: 'Current location', value: 'Preview — load from FacilityOS/ERPNext' }
      ]
    };
  }

  const batch = normalized.match(BATCH);
  if (batch) {
    return {
      raw,
      normalized,
      type: 'batch',
      title: 'Batch-controlled inventory',
      subtitle: batch[1],
      actions: ['View Balance', 'Receive', 'Move', 'Issue', 'Return', 'Physical Count'],
      fields: [
        { label: 'Item code', value: batch[1] },
        { label: 'Batch', value: `B${batch[2]}` },
        { label: 'Available quantity', value: 'Preview — query ERPNext' }
      ]
    };
  }

  const serial = normalized.match(SERIAL);
  if (serial) {
    return {
      raw,
      normalized,
      type: 'serial',
      title: 'Serialized inventory',
      subtitle: serial[1],
      actions: ['View History', 'Move', 'Issue', 'Return', 'Install in SFG', 'Set Condition'],
      fields: [
        { label: 'Item code', value: serial[1] },
        { label: 'Serial', value: `S${serial[2]}` },
        { label: 'Current location', value: 'Preview — query ERPNext/FacilityOS' }
      ]
    };
  }

  if (DRONE.test(normalized)) {
    return {
      raw,
      normalized,
      type: 'drone',
      title: 'Finished aircraft',
      subtitle: normalized,
      actions: ['View Genealogy', 'View Installed SFGs', 'View Component History'],
      fields: [
        { label: 'Aircraft ID', value: normalized },
        { label: 'Build state', value: 'Preview — load production genealogy' }
      ]
    };
  }

  return unknown(raw, normalized, 'QR format is not recognized yet.');
}

function unknown(raw: string, normalized: string, message: string): QrResolution {
  return {
    raw,
    normalized,
    type: 'unknown',
    title: 'Unknown QR',
    subtitle: message,
    actions: ['Search Item Master', 'Report Unrecognized QR'],
    fields: normalized ? [{ label: 'Scanned value', value: normalized }] : []
  };
}

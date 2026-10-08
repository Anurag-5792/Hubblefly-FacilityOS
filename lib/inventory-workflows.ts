import { resolveQr } from './qr-resolver';

export type MovePreviewInput = {
  source: string;
  destination: string;
  quantity: number;
  condition?: string;
};

export type CountPreviewInput = {
  target: string;
  quantity: number;
  condition?: string;
  container?: string;
};

export function validateMove(input: MovePreviewInput) {
  const source = resolveQr(input.source);
  const destination = resolveQr(input.destination);
  const errors: string[] = [];

  if (source.type === 'unknown') errors.push('Source QR/ID is not recognized.');
  if (!['position', 'container'].includes(destination.type)) errors.push('Destination must be a valid Position or Container.');
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) errors.push('Quantity must be greater than zero.');
  if (source.type === 'serial' && input.quantity !== 1) errors.push('Serialized inventory must move one serial at a time.');
  if (source.normalized && source.normalized === destination.normalized) errors.push('Source and destination cannot be the same.');

  return {
    ok: errors.length === 0,
    errors,
    source,
    destination,
    postingMode: 'PREVIEW_ONLY' as const,
    erpNextTransaction: source.type === 'serial' || source.type === 'batch' ? 'Stock Entry / Material Transfer' : 'FacilityOS location update',
  };
}

export function validateCount(input: CountPreviewInput) {
  const target = resolveQr(input.target);
  const container = input.container ? resolveQr(input.container) : null;
  const errors: string[] = [];

  if (target.type === 'unknown') errors.push('Count target is not recognized.');
  if (!['serial', 'batch', 'position', 'container'].includes(target.type)) errors.push('Physical count currently supports serial, batch, position and container targets.');
  if (!Number.isFinite(input.quantity) || input.quantity < 0) errors.push('Count quantity cannot be negative.');
  if (target.type === 'serial' && ![0, 1].includes(input.quantity)) errors.push('A single serial can only have count quantity 0 or 1.');
  if (container && container.type !== 'container') errors.push('Container must use a valid BN/BX/BB ID.');

  return {
    ok: errors.length === 0,
    errors,
    target,
    container,
    postingMode: 'PREVIEW_ONLY' as const,
    note: 'Physical count remains a reconciliation record until verification and approved ERPNext posting.',
  };
}

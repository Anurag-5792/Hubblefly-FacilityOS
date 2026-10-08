import { resolveQr } from './qr-resolver';

export type InventoryTransactionKind = 'receive' | 'issue' | 'return';

export type InventoryTransactionPreviewInput = {
  kind: InventoryTransactionKind;
  target: string;
  quantity: number;
  warehouse?: string;
  counterparty?: string;
  reference?: string;
  condition?: string;
};

export type InventoryTransactionPreview = {
  ok: boolean;
  errors: string[];
  kind: InventoryTransactionKind;
  postingMode: 'PREVIEW_ONLY';
  futureErpNextAction: string;
  entityType: string;
  normalizedTarget: string;
};

export function previewInventoryTransaction(input: InventoryTransactionPreviewInput): InventoryTransactionPreview {
  const errors: string[] = [];
  const resolved = resolveQr(input.target);
  const qty = Number(input.quantity);

  if (!input.target?.trim()) errors.push('Target item / serial / batch is required.');
  if (resolved.type === 'unknown') errors.push('Target QR / ID is not recognized.');
  if (!['serial', 'batch'].includes(resolved.type)) errors.push('Receive, Issue and Return currently require a Serial or Batch identifier.');
  if (!Number.isFinite(qty) || qty <= 0) errors.push('Quantity must be greater than zero.');
  if (resolved.type === 'serial' && qty !== 1) errors.push('Serialized inventory must use quantity 1.');
  if (!input.warehouse?.trim()) errors.push('Warehouse is required.');

  if (input.kind === 'receive' && !input.counterparty?.trim()) {
    errors.push('Supplier / source is required for Receive.');
  }

  if (input.kind === 'issue' && !input.counterparty?.trim()) {
    errors.push('Recipient / destination is required for Issue.');
  }

  if (input.kind === 'return' && !input.counterparty?.trim()) {
    errors.push('Return source / destination is required for Return.');
  }

  const futureErpNextAction = input.kind === 'receive'
    ? 'Purchase Receipt or Stock Entry - Material Receipt after approval and source-document validation'
    : input.kind === 'issue'
      ? 'Stock Entry - Material Issue or Delivery Note after approval and business-purpose validation'
      : 'Return-specific ERPNext document after original transaction/reference is verified';

  return {
    ok: errors.length === 0,
    errors,
    kind: input.kind,
    postingMode: 'PREVIEW_ONLY',
    futureErpNextAction,
    entityType: resolved.type,
    normalizedTarget: resolved.normalized,
  };
}

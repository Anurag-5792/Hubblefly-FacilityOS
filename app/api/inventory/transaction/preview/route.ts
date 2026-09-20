import { NextRequest, NextResponse } from 'next/server';
import { previewInventoryTransaction, type InventoryTransactionKind } from '../../../../../lib/inventory-transactions';

const allowedKinds = new Set<InventoryTransactionKind>(['receive', 'issue', 'return']);

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, errors: ['Invalid JSON body.'] }, { status: 400 });
  }

  const kind = String(body.kind ?? '').toLowerCase() as InventoryTransactionKind;

  if (!allowedKinds.has(kind)) {
    return NextResponse.json({ ok: false, errors: ['Unsupported inventory transaction type.'] }, { status: 400 });
  }

  const preview = previewInventoryTransaction({
    kind,
    target: String(body.target ?? ''),
    quantity: Number(body.quantity),
    warehouse: body.warehouse ? String(body.warehouse) : undefined,
    counterparty: body.counterparty ? String(body.counterparty) : undefined,
    reference: body.reference ? String(body.reference) : undefined,
    condition: body.condition ? String(body.condition) : undefined,
  });

  return NextResponse.json(preview, { status: preview.ok ? 200 : 422 });
}

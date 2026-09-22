import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../lib/auth/server-guard';
import { previewPrintBatch } from '../../../../lib/documents/provider';
import type { PrintLabelKind } from '../../../../lib/documents/types';

const allowedKinds = new Set(['SERIAL', 'BATCH', 'POSITION', 'CONTAINER', 'BOX_CARD', 'GENERIC_ITEM']);

export async function POST(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['inventory']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }

  let body: {
    kind?: unknown;
    explicitPrintQty?: unknown;
    approvedQty?: unknown;
    itemCode?: unknown;
    containerIds?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const kind = String(body.kind ?? '') as PrintLabelKind;
  const explicitPrintQty = Number(body.explicitPrintQty ?? 0);
  const approvedQty = Number(body.approvedQty ?? 0);
  const itemCode = String(body.itemCode ?? '').trim().toUpperCase() || undefined;
  const containerIds = Array.isArray(body.containerIds)
    ? body.containerIds.map((value) => String(value).trim().toUpperCase()).filter(Boolean)
    : [];

  if (!allowedKinds.has(kind)) {
    return NextResponse.json({ ok: false, error: 'Valid label kind is required.' }, { status: 400 });
  }
  if (!Number.isInteger(explicitPrintQty) || explicitPrintQty <= 0) {
    return NextResponse.json({
      ok: false,
      error: 'Print quantity must be entered explicitly. FacilityOS will not calculate it from stock quantity or packaging rules.',
    }, { status: 400 });
  }

  if (kind === 'BOX_CARD') {
    const unique = [...new Set(containerIds)];
    if (unique.length !== containerIds.length) {
      return NextResponse.json({ ok: false, error: 'Duplicate container IDs are not allowed.' }, { status: 400 });
    }
    if (containerIds.length !== explicitPrintQty) {
      return NextResponse.json({
        ok: false,
        error: 'For Box Cards, explicit print quantity must exactly match the number of container IDs.',
      }, { status: 400 });
    }
  }

  const preview = previewPrintBatch({ kind, explicitPrintQty, approvedQty, itemCode, containerIds });
  return NextResponse.json({ ok: true, preview, persisted: false });
}

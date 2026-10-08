import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../lib/auth/server-guard';
import { previewPrintBatch } from '../../../../lib/documents/provider';
import type { PrintLabelKind } from '../../../../lib/documents/types';

const allowedKinds = new Set(['SERIAL', 'BATCH', 'POSITION', 'CONTAINER', 'BOX_CARD', 'GENERIC_ITEM']);
const identityKinds = new Set(['SERIAL', 'BATCH', 'POSITION', 'CONTAINER', 'BOX_CARD']);

export async function POST(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['inventory']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }

  let body: {
    kind?: unknown;
    explicitPrintQty?: unknown;
    itemCode?: unknown;
    labelIds?: unknown;
    containerIds?: unknown;
    printMode?: unknown;
    reason?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const kind = String(body.kind ?? '') as PrintLabelKind;
  const explicitPrintQty = Number(body.explicitPrintQty ?? 0);
  const itemCode = String(body.itemCode ?? '').trim().toUpperCase() || undefined;
  const labelIds = Array.isArray(body.labelIds)
    ? body.labelIds.map((value) => String(value).trim().toUpperCase()).filter(Boolean)
    : [];
  const containerIds = Array.isArray(body.containerIds)
    ? body.containerIds.map((value) => String(value).trim().toUpperCase()).filter(Boolean)
    : [];
  const printMode = body.printMode === 'reprint' ? 'reprint' : 'initial';
  const reason = String(body.reason ?? '').trim();

  if (!allowedKinds.has(kind)) {
    return NextResponse.json({ ok: false, error: 'Valid label kind is required.' }, { status: 400 });
  }
  if (!Number.isInteger(explicitPrintQty) || explicitPrintQty <= 0) {
    return NextResponse.json({
      ok: false,
      error: 'Print quantity must be entered explicitly. FacilityOS will not calculate it from stock quantity or packaging rules.',
    }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ ok: false, error: 'Print reason is required.' }, { status: 400 });
  }

  const identities = kind === 'BOX_CARD' ? containerIds : labelIds;
  if (identityKinds.has(kind)) {
    if (identities.length !== explicitPrintQty) {
      return NextResponse.json({
        ok: false,
        error: 'The number of explicit identities must exactly match the print quantity.',
      }, { status: 400 });
    }
    if (new Set(identities).size !== identities.length) {
      return NextResponse.json({ ok: false, error: 'Duplicate identities are not allowed.' }, { status: 400 });
    }
  }

  const preview = previewPrintBatch({
    kind,
    explicitPrintQty,
    itemCode,
    labelIds,
    containerIds,
    printMode,
    reason,
    approvedQty: 0,
  });

  if (preview.blockedReason) {
    return NextResponse.json({ ok: false, error: preview.blockedReason, preview }, { status: 400 });
  }

  return NextResponse.json({ ok: true, preview, persisted: false });
}

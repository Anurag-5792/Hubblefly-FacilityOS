import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../lib/auth/server-guard';
import { findItem, findItemLedger, findItemStock, isErpNextConfigured } from '../../../../lib/erpnext/server-client';

const previewStock = [
  { warehouse: 'HFT Store', actual_qty: 145, reserved_qty: 0, projected_qty: 145 },
];

const previewLedger = [
  { posting_date: '2026-09-17', posting_time: '10:30:00', voucher_type: 'Stock Entry', voucher_no: 'MAT-STE-PREVIEW-0003', warehouse: 'HFT Store', actual_qty: 12, qty_after_transaction: 145 },
  { posting_date: '2026-09-16', posting_time: '16:15:00', voucher_type: 'Stock Entry', voucher_no: 'MAT-STE-PREVIEW-0002', warehouse: 'HFT Store', actual_qty: -4, qty_after_transaction: 133 },
  { posting_date: '2026-09-15', posting_time: '11:05:00', voucher_type: 'Purchase Receipt', voucher_no: 'MAT-PRE-PREVIEW-0001', warehouse: 'HFT Store', actual_qty: 20, qty_after_transaction: 137 },
];

export async function GET(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['inventory']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }
  const code = request.nextUrl.searchParams.get('code')?.trim();
  if (!code) {
    return NextResponse.json({ ok: false, error: 'Item code is required.' }, { status: 400 });
  }

  if (!isErpNextConfigured()) {
    return NextResponse.json({
      ok: true,
      source: 'preview',
      item: {
        name: code.toUpperCase(),
        item_name: 'Preview item',
        item_group: 'Preview Group',
        stock_uom: 'Nos',
        brand: '—',
        has_serial_no: 0,
        has_batch_no: 1,
        disabled: 0,
      },
      stock: previewStock,
      ledger: previewLedger,
      note: 'ERPNext is not connected yet. Values shown are preview data only.',
    });
  }

  try {
    const [item, stock, ledger] = await Promise.all([
      findItem(code),
      findItemStock(code),
      findItemLedger(code),
    ]);

    return NextResponse.json({
      ok: true,
      source: 'erpnext',
      item: item.data,
      stock: stock.data,
      ledger: ledger.data,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      source: 'erpnext',
      error: error instanceof Error ? error.message : 'ERPNext item detail lookup failed.',
    }, { status: 502 });
  }
}

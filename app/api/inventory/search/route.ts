import { NextRequest, NextResponse } from 'next/server';
import { erpNextRequest, isErpNextConfigured } from '../../../../lib/erpnext/server-client';

type ItemRow = {
  name: string;
  item_name?: string;
  item_group?: string;
  stock_uom?: string;
  brand?: string;
  has_serial_no?: number;
  has_batch_no?: number;
};

const previewItems: ItemRow[] = [
  { name: 'PWR-BAT-01', item_name: 'Spartan 25200 mAh Battery', item_group: 'Battery', stock_uom: 'Nos', has_batch_no: 1 },
  { name: 'PSY-MTR-03', item_name: 'Propulsion Motor', item_group: 'Propulsion', stock_uom: 'Nos', has_serial_no: 1 },
  { name: 'PSY-PRP-01', item_name: '2480 CCW Propeller', item_group: 'Propeller', stock_uom: 'Nos', has_batch_no: 1 },
  { name: 'SFG-ARM-01', item_name: 'Motor Arm Assembly', item_group: 'Semi-Finished Goods', stock_uom: 'Nos', has_serial_no: 1 },
];

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (!query) {
    return NextResponse.json({ source: isErpNextConfigured() ? 'erpnext' : 'preview', results: [] });
  }

  if (!isErpNextConfigured()) {
    const needle = query.toUpperCase();
    return NextResponse.json({
      source: 'preview',
      results: previewItems.filter((row) => `${row.name} ${row.item_name ?? ''} ${row.item_group ?? ''}`.toUpperCase().includes(needle)),
    });
  }

  const filters = JSON.stringify([
    ['Item', 'disabled', '=', 0],
    ['Item', 'name', 'like', `%${query}%`],
  ]);
  const fields = JSON.stringify(['name', 'item_name', 'item_group', 'stock_uom', 'brand', 'has_serial_no', 'has_batch_no']);
  const path = `/api/resource/Item?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}&limit_page_length=25&order_by=modified%20desc`;

  try {
    const response = await erpNextRequest<{ data: ItemRow[] }>(path);
    return NextResponse.json({ source: 'erpnext', results: response.data });
  } catch (error) {
    return NextResponse.json({ source: 'erpnext', results: [], error: error instanceof Error ? error.message : 'ERPNext search failed' }, { status: 502 });
  }
}

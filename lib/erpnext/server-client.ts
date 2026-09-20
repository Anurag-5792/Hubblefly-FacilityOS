type ErpNextConfig = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

export type ErpNextListResponse<T> = {
  data: T[];
};

function config(): ErpNextConfig {
  const baseUrl = process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '');
  const apiKey = process.env.ERPNEXT_API_KEY;
  const apiSecret = process.env.ERPNEXT_API_SECRET;

  if (!baseUrl || !apiKey || !apiSecret) {
    throw new Error('ERPNext is not configured. Set ERPNEXT_BASE_URL, ERPNEXT_API_KEY and ERPNEXT_API_SECRET on the FacilityOS server.');
  }

  return { baseUrl, apiKey, apiSecret };
}

export function isErpNextConfigured() {
  return Boolean(process.env.ERPNEXT_BASE_URL && process.env.ERPNEXT_API_KEY && process.env.ERPNEXT_API_SECRET);
}

export async function erpNextRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, apiKey, apiSecret } = config();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `token ${apiKey}:${apiSecret}`,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ERPNext request failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  return response.json() as Promise<T>;
}

export async function findItem(itemCode: string) {
  const encoded = encodeURIComponent(itemCode);
  return erpNextRequest<{ data: {
    name: string;
    item_code?: string;
    item_name: string;
    item_group?: string;
    stock_uom: string;
    brand?: string;
    has_serial_no?: number;
    has_batch_no?: number;
    disabled: number;
    description?: string;
  } }>(`/api/resource/Item/${encoded}`);
}

export async function findSerial(serialNo: string) {
  const encoded = encodeURIComponent(serialNo);
  return erpNextRequest<{ data: Record<string, unknown> }>(`/api/resource/Serial%20No/${encoded}`);
}

export async function findBatch(batchNo: string) {
  const encoded = encodeURIComponent(batchNo);
  return erpNextRequest<{ data: Record<string, unknown> }>(`/api/resource/Batch/${encoded}`);
}

export async function findItemStock(itemCode: string) {
  const filters = encodeURIComponent(JSON.stringify([['item_code', '=', itemCode]]));
  const fields = encodeURIComponent(JSON.stringify(['item_code', 'warehouse', 'actual_qty', 'reserved_qty', 'projected_qty']));
  return erpNextRequest<ErpNextListResponse<Record<string, unknown>>>(
    `/api/resource/Bin?filters=${filters}&fields=${fields}&limit_page_length=100`
  );
}

export async function findItemLedger(itemCode: string) {
  const filters = encodeURIComponent(JSON.stringify([['item_code', '=', itemCode]]));
  const fields = encodeURIComponent(JSON.stringify([
    'posting_date',
    'posting_time',
    'voucher_type',
    'voucher_no',
    'warehouse',
    'actual_qty',
    'qty_after_transaction',
    'batch_no',
    'serial_no',
    'company'
  ]));
  return erpNextRequest<ErpNextListResponse<Record<string, unknown>>>(
    `/api/resource/Stock%20Ledger%20Entry?filters=${filters}&fields=${fields}&order_by=posting_date%20desc,posting_time%20desc&limit_page_length=50`
  );
}


export async function testErpNextConnection() {
  if (!isErpNextConfigured()) {
    return { configured: false, reachable: false, authenticated: false };
  }

  try {
    await erpNextRequest<{ message?: string }>('/api/method/frappe.auth.get_logged_user');
    return { configured: true, reachable: true, authenticated: true };
  } catch {
    return { configured: true, reachable: false, authenticated: false };
  }
}

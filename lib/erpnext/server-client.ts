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
  return erpNextRequest<{ data: { name: string; item_name: string; stock_uom: string; disabled: number } }>(`/api/resource/Item/${encoded}`);
}

export async function findSerial(serialNo: string) {
  const encoded = encodeURIComponent(serialNo);
  return erpNextRequest<{ data: Record<string, unknown> }>(`/api/resource/Serial%20No/${encoded}`);
}

export async function findBatch(batchNo: string) {
  const encoded = encodeURIComponent(batchNo);
  return erpNextRequest<{ data: Record<string, unknown> }>(`/api/resource/Batch/${encoded}`);
}

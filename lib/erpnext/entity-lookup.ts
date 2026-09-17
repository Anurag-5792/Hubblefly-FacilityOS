import { findBatch, findItem, findSerial, isErpNextConfigured } from './server-client';
import type { QrResolution } from '../qr-resolver';

export type LiveField = { label: string; value: string };

export type EntityLookupResult = {
  connected: boolean;
  source: 'erpnext' | 'facilityos' | 'unavailable';
  fields: LiveField[];
  warning?: string;
};

function text(value: unknown, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function boolLabel(value: unknown) {
  return Number(value) === 1 ? 'Yes' : 'No';
}

async function itemFields(itemCode: string): Promise<LiveField[]> {
  const response = await findItem(itemCode);
  const item = response.data as Record<string, unknown>;
  return [
    { label: 'Item code', value: text(item.name, itemCode) },
    { label: 'Item name', value: text(item.item_name) },
    { label: 'Item group', value: text(item.item_group) },
    { label: 'Brand', value: text(item.brand) },
    { label: 'Stock UOM', value: text(item.stock_uom) },
    { label: 'Serial controlled', value: boolLabel(item.has_serial_no) },
    { label: 'Batch controlled', value: boolLabel(item.has_batch_no) },
    { label: 'Disabled', value: boolLabel(item.disabled) },
  ];
}

export async function lookupResolvedEntity(resolution: QrResolution): Promise<EntityLookupResult> {
  if (resolution.type === 'position' || resolution.type === 'container' || resolution.type === 'sfg' || resolution.type === 'drone') {
    return {
      connected: isErpNextConfigured(),
      source: 'facilityos',
      fields: [],
      warning: 'This object is FacilityOS-managed. ERPNext remains authoritative for stock and item transactions, while physical position/container/genealogy data is maintained by FacilityOS.',
    };
  }

  if (resolution.type === 'unknown') {
    return { connected: isErpNextConfigured(), source: 'unavailable', fields: [] };
  }

  if (!isErpNextConfigured()) {
    return {
      connected: false,
      source: 'unavailable',
      fields: [],
      warning: 'ERPNext is not configured on the FacilityOS server yet. The QR was resolved locally, but live ERP data could not be loaded.',
    };
  }

  try {
    if (resolution.type === 'serial') {
      const serialNo = resolution.normalized;
      const response = await findSerial(serialNo);
      const serial = response.data as Record<string, unknown>;
      const itemCode = text(serial.item_code, resolution.fields.find((f) => f.label === 'Item code')?.value ?? '');
      const baseFields: LiveField[] = [
        { label: 'ERP Serial No', value: text(serial.name, serialNo) },
        { label: 'Item code', value: itemCode },
        { label: 'Warehouse', value: text(serial.warehouse) },
        { label: 'Status', value: text(serial.status) },
        { label: 'Batch', value: text(serial.batch_no) },
        { label: 'Purchase document', value: text(serial.purchase_document_no) },
        { label: 'Delivery document', value: text(serial.delivery_document_no) },
      ];
      if (itemCode && itemCode !== '—') baseFields.push(...await itemFields(itemCode));
      return { connected: true, source: 'erpnext', fields: baseFields };
    }

    if (resolution.type === 'batch') {
      const batchNo = resolution.normalized;
      const response = await findBatch(batchNo);
      const batch = response.data as Record<string, unknown>;
      const itemCode = text(batch.item, resolution.fields.find((f) => f.label === 'Item code')?.value ?? '');
      const baseFields: LiveField[] = [
        { label: 'ERP Batch', value: text(batch.name, batchNo) },
        { label: 'Item code', value: itemCode },
        { label: 'Manufacturing date', value: text(batch.manufacturing_date) },
        { label: 'Expiry date', value: text(batch.expiry_date) },
        { label: 'Disabled', value: boolLabel(batch.disabled) },
      ];
      if (itemCode && itemCode !== '—') baseFields.push(...await itemFields(itemCode));
      return { connected: true, source: 'erpnext', fields: baseFields };
    }

    const itemCode = resolution.fields.find((f) => f.label === 'Item code')?.value;
    if (itemCode) {
      return { connected: true, source: 'erpnext', fields: await itemFields(itemCode) };
    }

    return { connected: true, source: 'erpnext', fields: [] };
  } catch (error) {
    return {
      connected: true,
      source: 'unavailable',
      fields: [],
      warning: error instanceof Error ? `ERPNext lookup failed: ${error.message}` : 'ERPNext lookup failed.',
    };
  }
}

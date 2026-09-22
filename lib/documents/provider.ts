import type {
  BoxCardPreview,
  FacilityDocumentMutation,
  FacilityDocumentType,
  FacilityMovementDocument,
  PrintBatchPreview,
  PrintLabelKind,
} from './types';

function live() {
  return process.env.FACILITYOS_OPERATIONS_SOURCE === 'frappe';
}

function baseUrl() {
  return process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '') ?? '';
}

export function sampleDocument(type: FacilityDocumentType): FacilityMovementDocument {
  const id = type === 'GRN' ? 'GRN-PREVIEW-0001' : type === 'GATE_PASS' ? 'GP-PREVIEW-0001' : 'DC-PREVIEW-0001';
  return {
    id,
    type,
    status: 'draft',
    company: 'Hubblefly Technologies Limited',
    warehouse: 'HFT Store',
    partyName: type === 'GRN' ? 'Preview Supplier' : undefined,
    supplierInvoice: type === 'GRN' ? 'INV-PREVIEW-001' : undefined,
    recipient: type === 'GRN' ? undefined : 'Preview Recipient',
    purpose: type === 'GRN' ? 'Live inward after opening stock' : 'Material movement',
    vehicleNo: type === 'GRN' ? 'HR-00-TEST' : 'HR-00-TEST',
    returnable: type === 'GATE_PASS',
    expectedReturnDate: type === 'GATE_PASS' ? '2026-09-30' : undefined,
    lines: [
      {
        itemCode: 'PSY-MTR-03',
        itemName: 'Propulsion Motor CCW',
        qty: 2,
        uom: 'Nos',
        serialNo: 'PSY-MTR-03-S0042, PSY-MTR-03-S0043',
        containerId: 'BN-014',
      },
    ],
    preparedBy: 'Preview User',
    createdAt: new Date().toISOString(),
    erpNextPosted: false,
  };
}

async function frappePost(method: string, body: Record<string, unknown>, sid?: string) {
  if (!sid || !baseUrl()) throw new Error('FacilityOS session or server URL is unavailable.');
  const response = await fetch(baseUrl() + '/api/method/' + method, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Cookie: 'sid=' + sid,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('FacilityOS document request failed.');
  return response.json() as Promise<{ message?: FacilityDocumentMutation }>;
}

export async function saveMovementDocument(
  document: FacilityMovementDocument,
  sid?: string,
): Promise<FacilityDocumentMutation> {
  if (!live()) {
    return {
      ok: true,
      persisted: false,
      document,
      note: 'Preview mode: document was validated but not saved and no ERP stock was posted.',
    };
  }

  try {
    const payload = await frappePost('facility_os.api.documents.save_document', { document }, sid);
    return payload.message ?? { ok: false, persisted: false, error: 'Empty FacilityOS response.' };
  } catch {
    return { ok: false, persisted: false, error: 'FacilityOS document could not be saved.' };
  }
}

export function previewPrintBatch(input: {
  kind: PrintLabelKind;
  explicitPrintQty: number;
  itemCode?: string;
  containerIds?: string[];
  approvedQty?: number;
}): PrintBatchPreview {
  const requested = Math.max(0, Math.floor(input.explicitPrintQty));
  const approved = Math.max(0, Math.floor(input.approvedQty ?? 0));
  const requiresApproval = requested > 0;
  const blockedReason = requested <= 0
    ? 'Print quantity must be entered explicitly. FacilityOS never infers print quantity from stock or pack size.'
    : undefined;

  return {
    batchId: 'PRINT-PREVIEW-0001',
    kind: input.kind,
    explicitPrintQty: requested,
    previewCount: requested,
    requiresApproval,
    approvedQty: Math.min(approved, requested),
    status: blockedReason ? 'blocked' : approved >= requested ? 'approved' : 'previewed',
    itemCode: input.itemCode,
    containerIds: input.containerIds,
    blockedReason,
  };
}

export function sampleBoxCard(containerId = 'BN-014'): BoxCardPreview {
  return {
    containerId,
    itemCode: 'PSY-MTR-03',
    itemName: 'Propulsion Motor CCW',
    qrPayload: containerId,
    currentQty: 2,
    capacity: 6,
    uom: 'Nos',
    serialNo: 'PSY-MTR-03-S0042, PSY-MTR-03-S0043',
    batchNo: null,
    position: 'R03-L2-P04-S2',
    status: 'Active',
    movements: [
      { date: '2026-09-18', qtyIn: 2, qtyOut: 0, balance: 2, user: 'Inventory' },
      { date: '2026-09-17', qtyIn: 0, qtyOut: 1, balance: 0, user: 'Inventory' },
    ],
    note: 'Preview card. Live card will use Facility Container + last four Facility Operational Audit events.',
  };
}

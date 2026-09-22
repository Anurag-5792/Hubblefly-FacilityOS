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
    documentDate: '2026-09-22',
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
  labelIds?: string[];
  containerIds?: string[];
  printMode?: 'initial' | 'reprint';
  reason?: string;
  approvedQty?: number;
}): PrintBatchPreview {
  const requested = Math.max(0, Math.floor(input.explicitPrintQty));
  const approved = Math.max(0, Math.floor(input.approvedQty ?? 0));
  const requiresApproval = requested > 0;
  const identities = input.kind === 'BOX_CARD' ? (input.containerIds ?? []) : (input.labelIds ?? []);
  const identityRequired = ['SERIAL', 'BATCH', 'POSITION', 'CONTAINER', 'BOX_CARD'].includes(input.kind);
  let blockedReason: string | undefined;

  if (requested <= 0) {
    blockedReason = 'Print quantity must be entered explicitly. FacilityOS never infers print quantity from stock or pack size.';
  } else if (!input.reason?.trim()) {
    blockedReason = 'Print reason is required for audit.';
  } else if (identityRequired && identities.length !== requested) {
    blockedReason = 'The exact identity count must match the explicit print quantity.';
  } else if (identityRequired && new Set(identities).size !== identities.length) {
    blockedReason = 'Duplicate label/container identities are not allowed in the same print batch.';
  }

  return {
    batchId: 'PRINT-PREVIEW-0001',
    kind: input.kind,
    explicitPrintQty: requested,
    previewCount: requested,
    requiresApproval,
    approvedQty: Math.min(approved, requested),
    status: blockedReason ? 'blocked' : approved >= requested ? 'approved' : 'previewed',
    itemCode: input.itemCode,
    labelIds: input.labelIds,
    containerIds: input.containerIds,
    printMode: input.printMode ?? 'initial',
    reason: input.reason,
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


export async function getBoxCard(containerId: string, sid?: string): Promise<{ ok: boolean; source: 'sample' | 'facilityos'; card?: BoxCardPreview; error?: string }> {
  if (!live()) {
    return { ok: true, source: 'sample', card: sampleBoxCard(containerId) };
  }

  if (!sid || !baseUrl()) {
    return { ok: false, source: 'facilityos', error: 'FacilityOS session or server URL is unavailable.' };
  }

  try {
    const url = new URL(baseUrl() + '/api/method/facility_os.api.printing.box_card');
    url.searchParams.set('container_id', containerId);
    const response = await fetch(url, {
      headers: { Accept: 'application/json', Cookie: 'sid=' + sid },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Box Card lookup failed.');
    const payload = await response.json() as { message?: { ok?: boolean; source?: 'facilityos'; card?: BoxCardPreview } };
    if (!payload.message?.ok || !payload.message.card) throw new Error('Empty Box Card response.');
    return { ok: true, source: 'facilityos', card: payload.message.card };
  } catch {
    return { ok: false, source: 'facilityos', error: 'Box Card could not be loaded from FacilityOS.' };
  }
}

export type PrintJobSummary = {
  jobId: string;
  labelKind: string;
  itemCode?: string | null;
  explicitPrintQty: number;
  approvedQty: number;
  status: string;
  createdBy?: string | null;
  modified?: string | null;
};

export async function listPrintJobs(sid?: string): Promise<{ ok: boolean; source: 'sample' | 'facilityos'; jobs: PrintJobSummary[]; error?: string }> {
  if (!live()) {
    return {
      ok: true,
      source: 'sample',
      jobs: [{
        jobId: 'FOS-PRINT-PREVIEW-0001',
        labelKind: 'Box Card',
        itemCode: 'PSY-MTR-03',
        explicitPrintQty: 1,
        approvedQty: 0,
        status: 'Previewed',
        createdBy: 'Preview Inventory User',
      }],
    };
  }
  if (!sid || !baseUrl()) return { ok: false, source: 'facilityos', jobs: [], error: 'FacilityOS session or server URL is unavailable.' };

  try {
    const response = await fetch(baseUrl() + '/api/method/facility_os.api.printing.list_print_jobs', {
      headers: { Accept: 'application/json', Cookie: 'sid=' + sid },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Print jobs failed.');
    const payload = await response.json() as { message?: { ok?: boolean; jobs?: PrintJobSummary[] } };
    return { ok: true, source: 'facilityos', jobs: payload.message?.jobs ?? [] };
  } catch {
    return { ok: false, source: 'facilityos', jobs: [], error: 'Print jobs could not be loaded.' };
  }
}

export async function createPrintJob(
  input: {
    kind: PrintLabelKind;
    explicitPrintQty: number;
    itemCode?: string;
    labelIds?: string[];
    containerIds?: string[];
    printMode?: 'initial' | 'reprint';
    reason?: string;
    sourceReference?: string;
  },
  sid?: string,
): Promise<{ ok: boolean; persisted: boolean; jobId?: string; status?: string; error?: string; note?: string }> {
  if (!live()) {
    return { ok: true, persisted: false, jobId: 'FOS-PRINT-PREVIEW-NEW', status: 'Previewed', note: 'Preview mode: print job was not persisted.' };
  }
  if (!sid || !baseUrl()) return { ok: false, persisted: false, error: 'FacilityOS session or server URL is unavailable.' };

  try {
    const response = await fetch(baseUrl() + '/api/method/facility_os.api.printing.create_print_job', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Cookie: 'sid=' + sid },
      body: JSON.stringify({
        label_kind: input.kind,
        explicit_print_qty: input.explicitPrintQty,
        item_code: input.itemCode ?? '',
        label_ids: input.labelIds ?? [],
        container_ids: input.containerIds ?? [],
        print_mode: input.printMode === 'reprint' ? 'Reprint' : 'Initial',
        reason: input.reason ?? '',
        source_reference: input.sourceReference ?? '',
      }),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Create print job failed.');
    const payload = await response.json() as { message?: { ok?: boolean; jobId?: string; status?: string } };
    if (!payload.message?.ok) throw new Error('Create print job failed.');
    return { ok: true, persisted: true, jobId: payload.message.jobId, status: payload.message.status };
  } catch {
    return { ok: false, persisted: false, error: 'Print job could not be created.' };
  }
}

export async function approvePrintJob(
  jobId: string,
  sid?: string,
): Promise<{ ok: boolean; persisted: boolean; jobId?: string; status?: string; error?: string; note?: string }> {
  if (!live()) {
    return { ok: true, persisted: false, jobId, status: 'Approved', note: 'Preview mode: approval was not persisted.' };
  }
  if (!sid || !baseUrl()) return { ok: false, persisted: false, error: 'FacilityOS session or server URL is unavailable.' };

  try {
    const response = await fetch(baseUrl() + '/api/method/facility_os.api.printing.approve_print_job', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Cookie: 'sid=' + sid },
      body: JSON.stringify({ job_id: jobId }),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Approve print job failed.');
    const payload = await response.json() as { message?: { ok?: boolean; jobId?: string; status?: string } };
    if (!payload.message?.ok) throw new Error('Approve print job failed.');
    return { ok: true, persisted: true, jobId: payload.message.jobId, status: payload.message.status };
  } catch {
    return { ok: false, persisted: false, error: 'Print job could not be approved.' };
  }
}

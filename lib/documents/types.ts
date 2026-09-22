export type FacilityDocumentType = 'GRN' | 'OUTWARD' | 'GATE_PASS' | 'DELIVERY_CHALLAN';

export type FacilityDocumentLine = {
  itemCode: string;
  itemName?: string;
  qty: number;
  uom: string;
  serialNo?: string;
  batchNo?: string;
  containerId?: string;
  fromPosition?: string;
  toPosition?: string;
  remarks?: string;
};

export type FacilityMovementDocument = {
  id: string;
  type: FacilityDocumentType;
  status: 'draft' | 'prepared' | 'checked' | 'authorized' | 'cancelled';
  documentDate: string;
  company: string;
  warehouse: string;
  partyName?: string;
  supplierInvoice?: string;
  supplierInvoiceDate?: string;
  recipient?: string;
  purpose?: string;
  vehicleNo?: string;
  returnable?: boolean;
  expectedReturnDate?: string;
  generateGatePass?: boolean;
  generateDeliveryChallan?: boolean;
  gatePassNo?: string;
  deliveryChallanNo?: string;
  erpReconciliationStatus?: 'not_linked' | 'erp_draft_linked' | 'reconciled' | 'submitted';
  referenceType?: string;
  referenceName?: string;
  lines: FacilityDocumentLine[];
  preparedBy?: string;
  checkedBy?: string;
  authorizedBy?: string;
  createdAt?: string;
  erpNextPosted: boolean;
};

export type FacilityDocumentMutation = {
  ok: boolean;
  persisted: boolean;
  document?: FacilityMovementDocument;
  error?: string;
  note?: string;
};

export type PrintLabelKind =
  | 'SERIAL'
  | 'BATCH'
  | 'POSITION'
  | 'CONTAINER'
  | 'BOX_CARD'
  | 'GENERIC_ITEM';

export type PrintBatchPreview = {
  batchId: string;
  kind: PrintLabelKind;
  explicitPrintQty: number;
  previewCount: number;
  requiresApproval: boolean;
  approvedQty: number;
  status: 'draft' | 'previewed' | 'approved' | 'printed' | 'blocked';
  itemCode?: string;
  containerIds?: string[];
  blockedReason?: string;
};

export type BoxCardMovement = {
  date: string;
  qtyIn: number;
  qtyOut: number;
  balance: number;
  user: string;
};

export type BoxCardPreview = {
  containerId: string;
  itemCode: string;
  itemName: string;
  qrPayload: string;
  currentQty: number;
  capacity?: number | null;
  uom: string;
  serialNo?: string | null;
  batchNo?: string | null;
  position?: string | null;
  status: string;
  movements: BoxCardMovement[];
  note?: string;
};

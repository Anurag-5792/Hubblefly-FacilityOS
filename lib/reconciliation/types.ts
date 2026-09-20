export type ReconciliationStatus = 'counted' | 'pending' | 'exception' | 'ready';

export type ReconciliationRow = {
  itemCode: string;
  itemName?: string;
  control: 'serial' | 'batch' | 'standard';
  referenceQty?: number | null;
  physicalQty?: number | null;
  attachedQty?: number | null;
  accountedQty?: number | null;
  difference?: number | null;
  location?: string | null;
  container?: string | null;
  status: ReconciliationStatus;
  exception?: string | null;
};

export type ReconciliationSummary = {
  ok: boolean;
  source: 'sample' | 'facilityos';
  rows: ReconciliationRow[];
  totals: {
    counted: number;
    pending: number;
    exceptions: number;
    ready: number;
  };
  openingStockGate: 'BLOCKED' | 'READY_FOR_APPROVAL';
  lastUpdatedAt?: string | null;
  note?: string;
  error?: string;
};

export type FacilityDataSource = 'sample' | 'facilityos';

export type FacilityContentLine = {
  itemCode: string;
  itemName?: string;
  quantity: number;
  batchNo?: string;
  serialNos?: string[];
  condition?: string;
};

export type FacilityMovementEvent = {
  occurredAt: string;
  event: 'PLACED' | 'MOVED' | 'STOCK_ADDED' | 'STOCK_REMOVED' | 'COUNTED';
  from?: string;
  to?: string;
  performedBy?: string;
  reference?: string;
};

export type FacilityContainer = {
  id: string;
  kind: 'BN' | 'BX' | 'BB';
  label: string;
  status: 'active' | 'quarantine' | 'void';
  currentPosition: string | null;
  capacity?: number | null;
  contents: FacilityContentLine[];
  history: FacilityMovementEvent[];
};

export type FacilityPosition = {
  id: string;
  rack: string;
  level: string;
  position: string;
  stackSlot: 'S1' | 'S2' | null;
  status: 'active' | 'blocked';
  containers: FacilityContainer[];
  looseContents: FacilityContentLine[];
};

export type FacilityPositionResponse = {
  ok: boolean;
  source: FacilityDataSource;
  position?: FacilityPosition;
  lastSyncedAt?: string | null;
  error?: string;
  note?: string;
};

export type FacilityContainerResponse = {
  ok: boolean;
  source: FacilityDataSource;
  container?: FacilityContainer;
  lastSyncedAt?: string | null;
  error?: string;
  note?: string;
};

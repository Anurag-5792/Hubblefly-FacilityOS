export type SyncProjectionStatus = {
  projection: string;
  status: 'healthy' | 'pending' | 'error' | 'sample';
  lastSuccessAt: string | null;
  lagSeconds: number | null;
  rowsProcessed: number;
  note?: string;
};

export type SyncStatusResponse = {
  ok: boolean;
  source: 'sample' | 'facilityos-read-model';
  projections: SyncProjectionStatus[];
  error?: string;
};

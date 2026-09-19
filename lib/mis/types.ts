export type MisPeriod = 'Today' | '7 Days' | '30 Days' | 'Custom';

export type MisFilters = {
  period: MisPeriod;
  company: string;
  warehouse: string;
  module: string;
  metric: string;
  groupBy: string;
};

export type MisRow = {
  label: string;
  stock: number;
  moves: number;
  exceptions: number;
  displayed: number;
};

export type MisQueryResponse = {
  ok: boolean;
  source: 'facilityos-read-model' | 'sample';
  lastSyncedAt: string | null;
  rows: MisRow[];
  total: number;
  error?: string;
  note?: string;
};

export type TraceabilityException = {
  name: string;
  exception_type: string;
  entity_type: string;
  entity_id: string;
  item_code?: string | null;
  expected_label?: string | null;
  observed_label?: string | null;
  blocking: number;
  reported_by?: string | null;
  reported_at?: string | null;
  session_name?: string | null;
};

export type TraceabilitySummary = {
  ok: boolean;
  source: 'sample' | 'facilityos';
  labelCounts: Record<string, number>;
  exceptionCounts: Record<string, number>;
  openBlocking: number;
  exceptions: TraceabilityException[];
  error?: string;
};

export type TraceabilityMutation = {
  ok: boolean;
  persisted: boolean;
  updated?: number;
  exceptionId?: string;
  created?: boolean;
  status?: string;
  note?: string;
  error?: string;
};

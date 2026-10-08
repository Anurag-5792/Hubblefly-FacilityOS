export type RouteOperationStatus = 'pending' | 'in_progress' | 'complete' | 'blocked';

export type RouteOperation = {
  sequence: number;
  operation: string;
  status: RouteOperationStatus;
  expectedComponent?: string | null;
  scannedComponent?: string | null;
  operator?: string | null;
  completedAt?: string | null;
  note?: string | null;
};

export type GenealogyEvent = {
  event: 'BUILT_FROM' | 'INSTALLED_IN' | 'REMOVED_FROM' | 'REPLACED_BY';
  parentId: string;
  childId: string;
  replacementId?: string | null;
  operator?: string | null;
  occurredAt?: string | null;
  note?: string | null;
};

export type RouteCard = {
  id: string;
  sfgCode: string;
  serialNo: string;
  status: 'draft' | 'in_progress' | 'complete' | 'blocked';
  currentOperation: number;
  operations: RouteOperation[];
  genealogy: GenealogyEvent[];
  startedAt?: string | null;
  completedAt?: string | null;
};

export type RouteCardResponse = {
  ok: boolean;
  source: 'sample' | 'facilityos';
  routeCard?: RouteCard;
  error?: string;
  note?: string;
};

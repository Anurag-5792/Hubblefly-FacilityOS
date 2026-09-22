export type GenealogyExplorerEvent = {
  id: string;
  event: 'BUILT_FROM' | 'INSTALLED_IN' | 'REMOVED_FROM' | 'REPLACED_BY';
  parentId: string;
  childId: string;
  replacementId?: string | null;
  routeCard?: string | null;
  operator?: string | null;
  occurredAt?: string | null;
  note?: string | null;
};

export type GenealogyExplorerResponse = {
  ok: boolean;
  source: 'preview' | 'facilityos';
  root: string;
  depth: number;
  nodes: string[];
  events: GenealogyExplorerEvent[];
  truncated?: boolean;
  error?: string;
};

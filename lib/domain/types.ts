export type UserRole = 'inventory' | 'shopfloor' | 'admin';

export type QrEntityType =
  | 'serial'
  | 'batch'
  | 'position'
  | 'bin'
  | 'box'
  | 'battery_box'
  | 'sfg'
  | 'drone';

export interface ResolvedQr {
  raw: string;
  type: QrEntityType;
  itemCode?: string;
  serialNo?: string;
  batchNo?: string;
  location?: string;
  containerId?: string;
}

export interface StockMoveCommand {
  itemCode: string;
  serialNo?: string;
  batchNo?: string;
  qty: number;
  fromLocation?: string;
  toLocation: string;
  containerId?: string;
  performedBy: string;
  reason?: string;
}

export interface GenealogyEvent {
  action: 'BUILT_FROM' | 'INSTALLED_IN' | 'REMOVED_FROM' | 'REPLACED_BY';
  parentId: string;
  childId: string;
  qty: number;
  performedBy: string;
  occurredAt: string;
}

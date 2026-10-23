/** Strictly nonposting opening-stock count reconciliation. Approval is a separate workflow. */
import { parseQuantity, formatQuantity } from './quantity.ts';
import { authorize, type VerifiedPrincipal } from '../security/authorization.ts';
import { validateItem, type Item } from './masters.ts';

export type InventoryState = 'LOOSE' | 'INSTALLED_WIP' | 'QUARANTINE' | 'OTHER';
export type OpeningCountLine = Readonly<{
  lineId: string; itemCode: string; locationId: string; inventoryState: InventoryState;
  quantity: string; serialNo?: string; batchNo?: string;
}>;
export type OpeningCountSession = Readonly<{
  sessionId: string; legalEntityId: string; siteId: string; warehouseId: string;
  stockEpoch: string; lines: readonly OpeningCountLine[];
}>;
export type OpeningVariance = Readonly<{
  lineId: string; itemCode: string; inventoryState: InventoryState;
  key: string; physicalQuantity: string; referenceQuantity: string; variance: string;
}>;
function id(value: string): boolean { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(value); }

export function reconcileOpeningCount(session: OpeningCountSession, actor: VerifiedPrincipal | null,
  itemByCode: ReadonlyMap<string, Item>, referenceByKey: ReadonlyMap<string, string>): readonly OpeningVariance[] {
  authorize(actor, 'stock:prepare', session);
  if (!id(session.sessionId) || !id(session.stockEpoch) || session.lines.length === 0) throw new Error('OPENING_SESSION_INVALID');
  const keys = new Set<string>();
  const seenLineIds = new Set<string>();
  const seenSerials = new Set<string>();
  return session.lines.map(line => {
    if (!id(line.lineId) || !id(line.locationId) || !['LOOSE','INSTALLED_WIP','QUARANTINE','OTHER'].includes(line.inventoryState)) throw new Error('OPENING_LINE_INVALID');
    if (seenLineIds.has(line.lineId)) throw new Error('OPENING_DUPLICATE_LINE_ID');
    seenLineIds.add(line.lineId);
    const item = itemByCode.get(line.itemCode);
    if (!item || item.legalEntityId !== session.legalEntityId) throw new Error('OPENING_ITEM_UNKNOWN_OR_SCOPE_INVALID');
    validateItem(item); // Inactive historical items may still be physically counted.
    const physical = parseQuantity(line.quantity);
    if (item.control === 'SERIAL') {
      if (!line.serialNo || !id(line.serialNo) || line.batchNo || (physical !== 0n && physical !== 1_000_000n)) throw new Error('OPENING_SERIAL_INVALID');
      const serialKey = JSON.stringify([session.legalEntityId,line.itemCode,line.serialNo]);
      if (seenSerials.has(serialKey)) throw new Error('OPENING_DUPLICATE_SERIAL');
      seenSerials.add(serialKey);
    } else if (line.serialNo) throw new Error('OPENING_UNEXPECTED_SERIAL');
    if (item.control === 'BATCH' && (!line.batchNo || !id(line.batchNo))) throw new Error('OPENING_BATCH_REQUIRED');
    if (item.control !== 'BATCH' && line.batchNo) throw new Error('OPENING_UNEXPECTED_BATCH');
    const key = JSON.stringify([session.legalEntityId,session.siteId,session.warehouseId,session.stockEpoch,
      line.itemCode,line.locationId,line.inventoryState,line.serialNo??'',line.batchNo??'']);
    if (keys.has(key)) throw new Error('OPENING_DUPLICATE_COUNT_KEY');
    keys.add(key);
    const baseline = parseQuantity(referenceByKey.get(key) ?? '0');
    return { lineId:line.lineId,itemCode:line.itemCode,inventoryState:line.inventoryState,key,
      physicalQuantity:formatQuantity(physical),referenceQuantity:formatQuantity(baseline),variance:formatQuantity(physical-baseline) };
  });
}

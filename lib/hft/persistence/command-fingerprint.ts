/** Single canonical idempotency fingerprint used for posting and uncertain-commit readback. */
import { createHash } from 'node:crypto';
import type { StockCommand } from '../domain/ledger.ts';

export function stockRequestFingerprint(c: StockCommand, actor: string): string {
  return createHash('sha256').update(JSON.stringify(['HFT_STOCK_COMMAND_V2',actor,c.commandId,c.idempotencyKey,c.kind,c.legalEntityId,c.siteId,
    c.warehouseId,c.itemCode,c.locationId??'',c.quantity,c.sourceDocumentId,c.sourceActionKey,c.fragmentId??'',c.expectedBalanceVersion,
    c.employeeId??'',c.originalIssueId??'',c.serialNo??'',c.batchNo??'',c.condition??''])).digest('hex');
}

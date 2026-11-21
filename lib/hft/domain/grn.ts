/** Nonposting GRN input contract. Persistence must enforce unique invoice and receipt keys. */
import { formatQuantity, parseQuantity, requirePositive } from './quantity.ts';
import { requireActiveItem, requireActiveSupplier, requireActiveWarehouse, type Item, type Supplier, type Warehouse } from './masters.ts';
import { authorize, type VerifiedPrincipal } from '../security/authorization.ts';

export type ReceiptFragment = Readonly<{
  legalEntityId: string; siteId: string; warehouseId: string; supplierId: string;
  invoiceNumber: string; invoiceDate: string; grnId: string; lineNo: number;
  receiptKey: string; itemCode: string; orderedQuantity: string;
  alreadyAcceptedQuantity: string; receiptQuantity: string;
  qcState: 'PENDING' | 'ACCEPTED' | 'REJECTED'; evidenceId?: string;
  serialNos?: readonly string[]; batchNo?: string;
}>;
export type ValidatedReceipt = Readonly<{
  invoiceKey: string; receiptKey: string; quantity: string; remainingAfter: string;
  legalEntityId: string; supplierId: string; warehouseId: string; itemCode: string;
}>;

export function invoiceKey(invoiceNumber: string): string {
  if (typeof invoiceNumber !== 'string') throw new Error('INVOICE_NUMBER_REQUIRED');
  const cleaned = invoiceNumber.normalize('NFKC').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!/^[A-Z0-9][A-Z0-9 /._-]{0,95}$/.test(cleaned)) throw new Error('INVOICE_NUMBER_INVALID');
  return cleaned;
}

function requiredReference(value: string, error: string): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(value)) throw new Error(error);
}
export function validateReceiptFragment(input: ReceiptFragment, actor: VerifiedPrincipal | null,
  supplier: Supplier, warehouse: Warehouse, item: Item): ValidatedReceipt {
  authorize(actor, 'stock:prepare', input);
  const s = requireActiveSupplier(supplier);
  const w = requireActiveWarehouse(warehouse);
  const i = requireActiveItem(item);
  if (s.legalEntityId !== input.legalEntityId || s.supplierId !== input.supplierId ||
      w.legalEntityId !== input.legalEntityId || w.warehouseId !== input.warehouseId || w.siteId !== input.siteId ||
      i.legalEntityId !== input.legalEntityId || i.itemCode !== input.itemCode) throw new Error('RECEIPT_MASTER_SCOPE_MISMATCH');
  requiredReference(input.grnId, 'GRN_ID_INVALID');
  requiredReference(input.receiptKey, 'RECEIPT_KEY_INVALID');
  if (!Number.isSafeInteger(input.lineNo) || input.lineNo <= 0) throw new Error('GRN_LINE_INVALID');
  if (typeof input.invoiceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate) ||
      !Number.isFinite(Date.parse(input.invoiceDate)) || new Date(input.invoiceDate).toISOString().slice(0,10) !== input.invoiceDate) {
    throw new Error('INVOICE_DATE_INVALID');
  }
  const ordered = parseQuantity(input.orderedQuantity);
  const already = parseQuantity(input.alreadyAcceptedQuantity);
  const accepted = parseQuantity(input.receiptQuantity);
  requirePositive(ordered); requirePositive(accepted);
  if (already > ordered || accepted > ordered - already) throw new Error('PARTIAL_RECEIPT_EXCEEDS_ORDERED');
  if (input.qcState !== 'ACCEPTED' || !input.evidenceId?.trim()) throw new Error('RECEIPT_QC_NOT_ACCEPTED');
  if (i.control === 'SERIAL') {
    if (input.batchNo) throw new Error('UNEXPECTED_BATCH');
    if (!input.serialNos || input.serialNos.length === 0 ||
        input.serialNos.length !== Number(accepted / 1_000_000n) || accepted % 1_000_000n !== 0n ||
        new Set(input.serialNos).size !== input.serialNos.length) throw new Error('SERIAL_LIST_INVALID');
    for (const serial of input.serialNos) requiredReference(serial, 'SERIAL_INVALID');
    // Each serial is individually posted by the future transaction adapter.
  } else if (input.serialNos?.length) throw new Error('UNEXPECTED_SERIAL');
  if (i.control === 'BATCH' && !input.batchNo?.trim()) throw new Error('BATCH_REQUIRED');
  if (i.control !== 'BATCH' && input.batchNo) throw new Error('UNEXPECTED_BATCH');
  return { invoiceKey: invoiceKey(input.invoiceNumber), receiptKey: input.receiptKey,
    quantity:formatQuantity(accepted), remainingAfter:formatQuantity(ordered-already-accepted),
    legalEntityId:input.legalEntityId,supplierId:input.supplierId,warehouseId:input.warehouseId,itemCode:input.itemCode };
}

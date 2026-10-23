/** Nonproduction deterministic posting model. NOT a transactional database adapter. */
import { parseQuantity, requirePositive, requireSerializedUnit, formatQuantity } from './quantity.ts';
import { authorize, type VerifiedPrincipal } from '../security/authorization.ts';
import { validateEmployee, requireActiveItem, requireActiveWarehouse, type Employee, type Item, type Warehouse } from './masters.ts';

export type StockCommand = Readonly<{
  commandId: string;
  idempotencyKey: string;
  kind: 'RECEIVE' | 'ISSUE' | 'RETURN';
  legalEntityId: string;
  siteId: string;
  warehouseId: string;
  itemCode: string;
  quantity: string;
  sourceDocumentId: string;
  sourceActionKey: string;
  expectedBalanceVersion: number;
  employeeId?: string;
  originalIssueId?: string;
  serialNo?: string;
  batchNo?: string;
  condition?: 'GOOD' | 'DAMAGED' | 'QUARANTINE';
}>;

export type TrustedApprovalGate = Readonly<{
  verifiedByServer: true;
  approvalId: string;
  documentId: string;
  revision: number;
  approvedBy: string;
  approved: boolean;
  blockingHolds: readonly string[];
  legalEntityId: string;
  siteId: string;
  warehouseId: string;
  inspectedCondition?: 'GOOD' | 'DAMAGED' | 'QUARANTINE';
  inspectionEvidenceId?: string;
}>;
export type StockFact = Readonly<{
  commandId: string;
  sourceDocumentId: string;
  kind: StockCommand['kind'];
  entityId: string;
  warehouseId: string;
  itemCode: string;
  movements: readonly Readonly<{ bucket: 'EXTERNAL' | 'AVAILABLE' | 'CUSTODY' | 'QUARANTINE'; delta: string }>[];
  operatorId: string;
  employeeId?: string;
  issueId?: string;
}>;
export type PostResult = Readonly<{ commandId: string; accountVersion: number; available: string; fact: StockFact; replay: boolean }>;

type IssueRecord = { employeeId: string; itemCode: string; warehouseId: string; legalEntityId: string; siteId: string; original: bigint; remaining: bigint; serialNo?: string; batchNo?: string };
type StoredOutcome = { fingerprint: string; result: PostResult };
export type EngineState = {
  readonly balances: Map<string, bigint>;
  readonly versions: Map<string, number>;
  readonly issueRecords: Map<string, IssueRecord>;
  readonly serialLocations: Map<string, string>;
  readonly idempotency: Map<string, StoredOutcome>;
  readonly sourceActions: ReadonlySet<string>;
  readonly facts: readonly StockFact[];
};
export function emptyEngineState(): EngineState {
  return { balances: new Map(), versions: new Map(), issueRecords: new Map(), serialLocations: new Map(), idempotency: new Map(), sourceActions: new Set(), facts: [] };
}
export type TrustedMasterSnapshot = Readonly<{ item: Item; warehouse: Warehouse; employee?: Employee }>;

function stockKey(c: StockCommand): string {
  return JSON.stringify([c.legalEntityId, c.siteId, c.warehouseId, c.itemCode, c.batchNo || '', c.serialNo || '']);
}
function serialKey(c: StockCommand): string {
  return JSON.stringify([c.legalEntityId, c.itemCode, c.serialNo]);
}
function fingerprint(c: StockCommand): string {
  return JSON.stringify([c.commandId, c.kind, c.legalEntityId, c.siteId, c.warehouseId, c.itemCode,
    c.quantity, c.sourceDocumentId, c.sourceActionKey, c.expectedBalanceVersion, c.employeeId || '', c.originalIssueId || '', c.serialNo || '', c.batchNo || '', c.condition || '']);
}
function idempotencyScope(c: StockCommand): string { return JSON.stringify([c.legalEntityId, c.idempotencyKey]); }
function sourceActionScope(c: StockCommand): string { return JSON.stringify([c.legalEntityId, c.sourceDocumentId, c.sourceActionKey]); }
function ensureIdentifier(v: string, code: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(v)) throw new Error(code);
}

/** Pure state transformation; the actual PostgreSQL adapter MUST lock rows and commit atomically. */
export function applyCommand(state: EngineState, command: StockCommand, principal: VerifiedPrincipal | null,
  gate: TrustedApprovalGate | null, masters: TrustedMasterSnapshot): { state: EngineState; result: PostResult } {
  const c = command;
  authorize(principal, 'stock:post', c);
  ensureIdentifier(c.commandId, 'COMMAND_ID_INVALID');
  ensureIdentifier(c.idempotencyKey, 'IDEMPOTENCY_KEY_INVALID');
  ensureIdentifier(c.sourceDocumentId, 'DOCUMENT_ID_INVALID');
  ensureIdentifier(c.sourceActionKey, 'SOURCE_ACTION_KEY_INVALID');
  const requestFingerprint = fingerprint(c);
  const idempotencyKey = idempotencyScope(c);
  const stored = state.idempotency.get(idempotencyKey);
  if (stored) {
    if (stored.fingerprint !== requestFingerprint) throw new Error('IDEMPOTENCY_CONFLICT');
    return { state, result: { ...stored.result, replay: true } };
  }
  if (state.sourceActions.has(sourceActionScope(c))) throw new Error('SOURCE_ACTION_ALREADY_POSTED');
  if (!gate || gate.verifiedByServer !== true || !gate.approved || !gate.approvalId || gate.revision < 1 || gate.documentId !== c.sourceDocumentId ||
      gate.legalEntityId !== c.legalEntityId || gate.siteId !== c.siteId || gate.warehouseId !== c.warehouseId) throw new Error('APPROVAL_REQUIRED');
  if (gate.blockingHolds.length) throw new Error('BLOCKING_HOLD');
  if (principal?.subject === gate.approvedBy) throw new Error('SEGREGATION_OF_DUTIES');
  const item = requireActiveItem(masters.item);
  const warehouse = requireActiveWarehouse(masters.warehouse);
  if (item.legalEntityId !== c.legalEntityId || item.itemCode !== c.itemCode ||
      warehouse.legalEntityId !== c.legalEntityId || warehouse.siteId !== c.siteId || warehouse.warehouseId !== c.warehouseId) {
    throw new Error('MASTER_SCOPE_MISMATCH');
  }
  if (item.control === 'SERIAL') {
    if (!c.serialNo) throw new Error('SERIAL_REQUIRED');
    ensureIdentifier(c.serialNo, 'SERIAL_INVALID');
  } else if (c.serialNo) throw new Error('UNEXPECTED_SERIAL');
  if (item.control === 'BATCH' && !c.batchNo) throw new Error('BATCH_REQUIRED');
  if (c.batchNo) ensureIdentifier(c.batchNo, 'BATCH_INVALID');
  const qty = parseQuantity(c.quantity);
  requirePositive(qty);
  if (item.control === 'SERIAL') requireSerializedUnit(qty);
  if (!Number.isSafeInteger(c.expectedBalanceVersion) || c.expectedBalanceVersion < 0) throw new Error('BALANCE_VERSION_INVALID');
  const key = stockKey(c);
  const version = state.versions.get(key) ?? 0;
  if (c.expectedBalanceVersion !== version) throw new Error('STALE_BALANCE_VERSION');
  const available = state.balances.get(key) ?? 0n;
  const next = new Map(state.balances);
  const versions = new Map(state.versions);
  const issues = new Map(state.issueRecords);
  const serials = new Map(state.serialLocations);
  const idempotency = new Map(state.idempotency);
  const sourceActions = new Set(state.sourceActions);
  const movement = (bucket: StockFact['movements'][number]['bucket'], n: bigint) => ({ bucket, delta: formatQuantity(n) });
  let legs: StockFact['movements'];
  let employeeId: string | undefined;
  let issueId: string | undefined;
  const sk = serialKey(c);
  const condition = c.condition ?? 'GOOD';

  if (c.kind === 'RECEIVE') {
    if (condition !== 'GOOD') throw new Error('RECEIPT_QC_NOT_ACCEPTED');
    if (item.control === 'SERIAL' && serials.has(sk)) throw new Error('SERIAL_ALREADY_REGISTERED');
    next.set(key, available + qty);
    if (item.control === 'SERIAL') serials.set(sk, 'AVAILABLE');
    legs = [movement('EXTERNAL', -qty), movement('AVAILABLE', qty)];
  } else if (c.kind === 'ISSUE') {
    if (condition !== 'GOOD') throw new Error('ISSUE_CONDITION_INVALID');
    if (!c.employeeId || !masters.employee) throw new Error('EMPLOYEE_REQUIRED');
    const employee = validateEmployee(masters.employee);
    if (employee.employeeId !== c.employeeId || employee.legalEntityId !== c.legalEntityId || employee.siteId !== c.siteId || !employee.active) throw new Error('EMPLOYEE_INACTIVE_OR_SCOPE_INVALID');
    if (available < qty) throw new Error('INSUFFICIENT_AVAILABLE_STOCK');
    if (item.control === 'SERIAL' && serials.get(sk) !== 'AVAILABLE') throw new Error('SERIAL_NOT_AVAILABLE');
    next.set(key, available - qty);
    if (item.control === 'SERIAL') serials.set(sk, `CUSTODY:${employee.employeeId}`);
    issues.set(c.commandId, { employeeId: employee.employeeId, itemCode: c.itemCode, warehouseId: c.warehouseId,
      legalEntityId: c.legalEntityId, siteId: c.siteId, original: qty, remaining: qty, serialNo: c.serialNo, batchNo: c.batchNo });
    employeeId = employee.employeeId;
    legs = [movement('AVAILABLE', -qty), movement('CUSTODY', qty)];
  } else if (c.kind === 'RETURN') {
    if (!c.originalIssueId || !c.employeeId) throw new Error('ORIGINAL_ISSUE_AND_EMPLOYEE_REQUIRED');
    ensureIdentifier(c.originalIssueId, 'ISSUE_REFERENCE_INVALID');
    const issue = issues.get(c.originalIssueId);
    if (!issue || issue.employeeId !== c.employeeId || issue.itemCode !== c.itemCode || issue.warehouseId !== c.warehouseId ||
        issue.legalEntityId !== c.legalEntityId || issue.siteId !== c.siteId || issue.serialNo !== c.serialNo || issue.batchNo !== c.batchNo) throw new Error('ISSUE_REFERENCE_MISMATCH');
    if (issue.remaining < qty) throw new Error('RETURN_EXCEEDS_CUSTODY');
    if (item.control === 'SERIAL' && serials.get(sk) !== `CUSTODY:${c.employeeId}`) throw new Error('SERIAL_CUSTODY_MISMATCH');
    if (!['GOOD', 'DAMAGED', 'QUARANTINE'].includes(condition)) throw new Error('RETURN_CONDITION_INVALID');
    if (gate.inspectedCondition !== condition || !gate.inspectionEvidenceId || gate.inspectionEvidenceId.trim().length < 3) {
      throw new Error('RETURN_INSPECTION_REQUIRED');
    }
    const restorable = condition === 'GOOD';
    if (restorable) next.set(key, available + qty);
    issues.set(c.originalIssueId, { ...issue, remaining: issue.remaining - qty });
    if (item.control === 'SERIAL') serials.set(sk, restorable ? 'AVAILABLE' : 'QUARANTINE');
    employeeId = c.employeeId;
    issueId = c.originalIssueId;
    legs = [movement('CUSTODY', -qty), movement(restorable ? 'AVAILABLE' : 'QUARANTINE', qty)];
  } else throw new Error('COMMAND_KIND_INVALID');

  // All ledger commands conserve quantity across source/target buckets.
  if (legs.reduce((acc, e) => acc + BigInt(parseQuantity(e.delta.replace(/^-/, ''))) * (e.delta.startsWith('-') ? -1n : 1n), 0n) !== 0n) {
    throw new Error('LEDGER_NOT_BALANCED');
  }
  versions.set(key, version + 1);
  const fact: StockFact = { commandId: c.commandId, sourceDocumentId: c.sourceDocumentId, kind: c.kind,
    entityId: c.legalEntityId, warehouseId: c.warehouseId, itemCode: c.itemCode, movements: legs,
    operatorId: principal!.subject, ...(employeeId ? { employeeId } : {}), ...(issueId ? { issueId } : {}) };
  const result: PostResult = { commandId: c.commandId, accountVersion: version + 1,
    available: formatQuantity(next.get(key) ?? 0n), fact, replay: false };
  idempotency.set(idempotencyKey, { fingerprint: requestFingerprint, result });
  sourceActions.add(sourceActionScope(c));
  return { state: { balances: next, versions, issueRecords: issues, serialLocations: serials,
    idempotency, sourceActions, facts: [...state.facts, fact] }, result };
}

/**
 * Durable reconciliation after a possibly committed PostgreSQL transaction.
 * A missing row is INDETERMINATE, never authorization to blindly retry.
 * Must use a new connection to the same attested isolated database.
 */
import { createHash } from 'node:crypto';
import { stockRequestFingerprint } from './command-fingerprint.ts';
import { postingLegs } from './account-model.ts';
import { formatQuantity } from '../domain/quantity.ts';
export { stockRequestFingerprint } from './command-fingerprint.ts';
import type { StockCommand, PostResult } from '../domain/ledger.ts';
import { assertVerifiedRequestOperator, type VerifiedRequestOperator } from '../security/verified-request.ts';
import { withIsolatedPgTransaction, type PgPool, type IsolatedPgEnvironment } from './isolated-pg-transaction.ts';

type Stored = { internal_command_uuid: string; command_id: string; payload_sha256: string; actor_subject: string;
  result: PostResult | null; canonical_text: string | null; canonical_sha256: string | null; delivery_found: boolean; legs: string; total: string; seal_verified: boolean;
  available_after_micro:string|null; available_after_version:string|null };
export type CommitReadback =
  | Readonly<{ state: 'COMMITTED_VERIFIED'; result: PostResult }>
  | Readonly<{ state: 'INDETERMINATE_NOT_FOUND'; automaticRetryAllowed: false }>;

export async function reconcileIsolatedCommand(pool: PgPool, env: IsolatedPgEnvironment,
  c: StockCommand, operator: VerifiedRequestOperator): Promise<CommitReadback> {
  const subject=assertVerifiedRequestOperator(operator,c);
  const requestedHash=stockRequestFingerprint(c,subject);
  return withIsolatedPgTransaction(pool,env,async q=>{
    const result=await q.query<Stored>(`SELECT sc.id::text AS internal_command_uuid,sc.command_id,sc.payload_sha256,sc.actor_subject,
       o.result,a.canonical_text,a.canonical_sha256, (d.outbox_id IS NOT NULL) AS delivery_found,
       (SELECT COUNT(*)::text FROM hft.stock_entry e WHERE e.command_id=sc.id) AS legs,
       (SELECT COALESCE(SUM(e.qty_delta_micro),0)::text FROM hft.stock_entry e WHERE e.command_id=sc.id) AS total,
       seal.available_after_micro::text AS available_after_micro,
       seal.available_after_version::text AS available_after_version,
       (seal.command_id IS NOT NULL AND integrity.seal_missing=false AND integrity.seal_mismatch=false
        AND seal.audit_sha256=a.canonical_sha256
        AND seal.outcome_sha256=encode(sha256(convert_to(o.result::text,'UTF8')),'hex')) AS seal_verified
       FROM hft.stock_command sc LEFT JOIN hft.stock_command_outcome o ON o.command_id=sc.id
       LEFT JOIN hft.audit_outbox a ON a.command_id=sc.id
       LEFT JOIN hft.audit_delivery d ON d.outbox_id=a.id
       LEFT JOIN hft.stock_command_seal seal ON seal.command_id=sc.id
       LEFT JOIN hft.stock_command_seal_reconstruction_v1 integrity ON integrity.command_uuid=sc.id
       WHERE sc.legal_entity_id=$1 AND sc.idempotency_key=$2 AND sc.command_id=$3
       FOR SHARE OF sc`,[c.legalEntityId,c.idempotencyKey,c.commandId]);
    if(result.rows.length===0) {
      // Check if the key has been committed for a DIFFERENT command: no blind retry.
      const other=await q.query<{command_id:string}>(
        `SELECT command_id FROM hft.stock_command WHERE legal_entity_id=$1 AND idempotency_key=$2 FOR SHARE`,
        [c.legalEntityId,c.idempotencyKey]);
      if(other.rows.length) throw new Error('IDEMPOTENCY_CONFLICT');
      return {state:'INDETERMINATE_NOT_FOUND',automaticRetryAllowed:false} as const;
    }
    if(result.rows.length!==1) throw new Error('READBACK_DUPLICATE_COMMAND');
    const row=result.rows[0];
    if(row.payload_sha256!==requestedHash || row.actor_subject!==subject) throw new Error('IDEMPOTENCY_CONFLICT');
    if(!row.result || !row.canonical_text || !row.canonical_sha256 || row.delivery_found!==true)
      throw new Error('READBACK_REQUIRED_EVIDENCE_MISSING');
    if(!Number.isSafeInteger(Number(row.legs)) || Number(row.legs)!==2 || row.total!=='0') throw new Error('READBACK_LEDGER_INTEGRITY_FAILED');
    if(row.seal_verified!==true) throw new Error('READBACK_STOCK_COMMAND_SEAL_FAILED');
    if(!row.available_after_micro || !row.available_after_version ||
       !Number.isSafeInteger(row.result.accountVersion) ||
       row.result.available!==formatQuantity(BigInt(row.available_after_micro)) ||
       row.result.accountVersion.toString()!==row.available_after_version)
      throw new Error('READBACK_HISTORICAL_BALANCE_OR_VERSION_MISMATCH');
    if(row.result.fact.kind!==c.kind ||
       row.result.fact.sourceDocumentId!==c.sourceDocumentId ||
       row.result.fact.operatorId!==subject ||
       row.result.fact.entityId!==c.legalEntityId ||
       row.result.fact.warehouseId!==c.warehouseId ||
       row.result.fact.itemCode!==c.itemCode ||
       row.result.fact.locationId!==c.locationId ||
       row.result.fact.employeeId!==c.employeeId ||
       row.result.fact.issueId!==c.originalIssueId)
      throw new Error('READBACK_SOURCE_ACTOR_OR_SCOPE_MISMATCH');
    // Lock-free database verifier checks exact ledger/outcome bijection and
    // full immutable audit, source and historic post-state, not only a hash.
    await q.query('SELECT hft.assert_command_seal_v1($1::uuid)',[row.internal_command_uuid]);
    if(typeof row.canonical_text!=='string' ||
       createHash('sha256').update(row.canonical_text).digest('hex')!==row.canonical_sha256)
      throw new Error('READBACK_AUDIT_DIGEST_FAILED');
    if(row.result.commandId!==c.commandId || row.result.fact?.commandId!==c.commandId)
      throw new Error('READBACK_OUTCOME_INVALID');
    // Account-level fact verification is INDEPENDENT of overall debit/credit
    // balancing: equal-and-opposite wrong accounts could otherwise pass.
    const expected=postingLegs(c,row.result.fact);
    const actual=await q.query<{bucket:string;account_id:string|null;qty_delta_micro:string;
       account_kind:string|null;legal_entity_id:string|null;warehouse_id:string|null;
       location_key:string|null;item_code:string|null;batch_key:string|null;serial_key:string|null;
       custodian_employee_id:string|null}>(`SELECT e.bucket,e.account_id::text,e.qty_delta_micro::text,
       a.account_kind,a.legal_entity_id,a.warehouse_id,a.location_key,a.item_code,
       a.batch_key,a.serial_key,a.custodian_employee_id
       FROM hft.stock_entry e LEFT JOIN hft.stock_account a ON a.id=e.account_id
       WHERE e.command_id=$1::uuid ORDER BY e.id`,[row.internal_command_uuid]);
    if(actual.rows.length!==expected.length) throw new Error('READBACK_ACCOUNT_LEG_COUNT_MISMATCH');
    for(let i=0;i<actual.rows.length;i++) {
      const got=actual.rows[i], planned=expected[i];
      if(got.bucket!==planned.bucket || got.qty_delta_micro!==planned.signedMicro.toString() ||
         (planned.account===null ? got.account_id!==null :
           !got.account_id || got.account_kind!==planned.account.kind ||
           got.legal_entity_id!==planned.account.legalEntityId ||
           got.warehouse_id!==planned.account.warehouseId ||
           got.location_key!==planned.account.locationId || got.item_code!==planned.account.itemCode ||
           got.batch_key!==planned.account.batchNo || got.serial_key!==planned.account.serialNo ||
           got.custodian_employee_id!==planned.account.custodianEmployeeId))
        throw new Error('READBACK_ACCOUNT_ATTRIBUTION_FAILED');
    }
    const discrepant=await q.query<{account_id:string}>(`SELECT account_id::text FROM hft.stock_account_reconstruction_v2
      WHERE account_id IN (SELECT account_id FROM hft.stock_entry WHERE command_id=$1::uuid)
      AND persisted_micro<>reconstructed_micro`,[row.internal_command_uuid]);
    if(discrepant.rows.length) throw new Error('READBACK_ACCOUNT_RECONSTRUCTION_FAILED');
    return {state:'COMMITTED_VERIFIED',result:{...row.result,replay:true}} as const;
  });
}

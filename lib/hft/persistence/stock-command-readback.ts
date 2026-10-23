/**
 * Durable reconciliation after a possibly committed PostgreSQL transaction.
 * A missing row is INDETERMINATE, never authorization to blindly retry.
 * Must use a new connection to the same attested isolated database.
 */
import { createHash } from 'node:crypto';
import { stockRequestFingerprint } from './command-fingerprint.ts';
export { stockRequestFingerprint } from './command-fingerprint.ts';
import type { StockCommand, PostResult } from '../domain/ledger.ts';
import { assertVerifiedRequestOperator, type VerifiedRequestOperator } from '../security/verified-request.ts';
import { withIsolatedPgTransaction, type PgPool, type IsolatedPgEnvironment } from './isolated-pg-transaction.ts';

type Stored = { command_id: string; payload_sha256: string; actor_subject: string;
  result: PostResult | null; canonical_text: string | null; canonical_sha256: string | null;
  delivery_found: boolean; legs: string; total: string };
export type CommitReadback =
  | Readonly<{ state: 'COMMITTED_VERIFIED'; result: PostResult }>
  | Readonly<{ state: 'INDETERMINATE_NOT_FOUND'; automaticRetryAllowed: false }>;

export async function reconcileIsolatedCommand(pool: PgPool, env: IsolatedPgEnvironment,
  c: StockCommand, operator: VerifiedRequestOperator): Promise<CommitReadback> {
  const subject=assertVerifiedRequestOperator(operator,c);
  const requestedHash=stockRequestFingerprint(c,subject);
  return withIsolatedPgTransaction(pool,env,async q=>{
    const result=await q.query<Stored>(
      'SELECT sc.command_id,sc.payload_sha256,sc.actor_subject,'+
      ' o.result,a.canonical_text,a.canonical_sha256,(d.outbox_id IS NOT NULL) AS delivery_found,'+
      ' (SELECT COUNT(*)::text FROM hft.stock_entry e WHERE e.command_id=sc.id) AS legs,'+
      ' (SELECT COALESCE(SUM(e.qty_delta_micro),0)::text FROM hft.stock_entry e WHERE e.command_id=sc.id) AS total'+
      ' FROM hft.stock_command sc LEFT JOIN hft.stock_command_outcome o ON o.command_id=sc.id'+
      ' LEFT JOIN hft.audit_outbox a ON a.command_id=sc.id'+
      ' LEFT JOIN hft.audit_delivery d ON d.outbox_id=a.id'+
      ' WHERE sc.legal_entity_id=$1 AND sc.idempotency_key=$2 AND sc.command_id=$3'+
      ' FOR SHARE OF sc',[c.legalEntityId,c.idempotencyKey,c.commandId]);
    if(result.rows.length===0) {
      // An unobserved original COMMIT may still succeed after this read.
      const other=await q.query<{command_id:string}>(
        'SELECT command_id FROM hft.stock_command WHERE legal_entity_id=$1 AND idempotency_key=$2 FOR SHARE',
        [c.legalEntityId,c.idempotencyKey]);
      if(other.rows.length) throw new Error('IDEMPOTENCY_CONFLICT');
      return {state:'INDETERMINATE_NOT_FOUND',automaticRetryAllowed:false} as const;
    }
    if(result.rows.length!==1) throw new Error('READBACK_DUPLICATE_COMMAND');
    const row=result.rows[0];
    if(row.payload_sha256!==requestedHash || row.actor_subject!==subject) throw new Error('IDEMPOTENCY_CONFLICT');
    if(!row.result || !row.canonical_text || !row.canonical_sha256 || row.delivery_found!==true)
      throw new Error('READBACK_REQUIRED_EVIDENCE_MISSING');
    if(!Number.isSafeInteger(Number(row.legs)) || Number(row.legs)<2 || row.total!=='0')
      throw new Error('READBACK_LEDGER_INTEGRITY_FAILED');
    if(createHash('sha256').update(row.canonical_text).digest('hex')!==row.canonical_sha256)
      throw new Error('READBACK_AUDIT_DIGEST_FAILED');
    if(row.result.commandId!==c.commandId || row.result.fact?.commandId!==c.commandId)
      throw new Error('READBACK_OUTCOME_INVALID');
    return {state:'COMMITTED_VERIFIED',result:{...row.result,replay:true}} as const;
  });
}

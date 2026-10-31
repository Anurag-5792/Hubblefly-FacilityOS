/** P2 read-only durable recovery; never issues another stock posting. */
import type {PostResult} from '../domain/ledger.ts';
import type {VerifiedRequestOperator} from '../security/verified-request.ts';
import {assertVerifiedRequestOperator} from '../security/verified-request.ts';
import {protectedPayloadSha256,type ProtectedPostingPayload,type InvocationProof} from '../security/posting-invocation-proof.ts';
import {withProtectedReadbackTransaction} from './protected-posting-transaction.ts';
import type {PgPool,IsolatedPgEnvironment} from './isolated-pg-transaction.ts';

export type ProtectedReadback =
 | Readonly<{state:'COMMITTED_VERIFIED';result:PostResult}>
 | Readonly<{state:'INDETERMINATE_NOT_FOUND';automaticRetryAllowed:false}>;

export async function reconcileProtectedStockCommand(
 pool:PgPool,env:IsolatedPgEnvironment,payload:ProtectedPostingPayload,
 proof:InvocationProof,operator:VerifiedRequestOperator):Promise<ProtectedReadback>{
 const subject=assertVerifiedRequestOperator(operator,{
   legalEntityId:payload.legalEntityId,siteId:payload.siteId,warehouseId:payload.warehouseId});
 if(subject!==proof.actorSubject || operator.sessionId!==proof.sessionId ||
    proof.payloadSha256!==protectedPayloadSha256(payload))
   throw new Error('P2_READBACK_SIGNED_ACTOR_OR_PAYLOAD_MISMATCH');
 return withProtectedReadbackTransaction(pool,env,async client=>{
   const x=await client.query<{recovery:unknown}>(
     'SELECT hft.reconcile_protected_stock_command_v1($1::jsonb,$2::jsonb) AS recovery',
     [JSON.stringify(payload),JSON.stringify(proof)]);
   if(x.rows.length!==1)throw new Error('P2_READBACK_MISSING_DATABASE_RESPONSE');
   const v=x.rows[0].recovery;
   if(!v||typeof v!=='object'||Array.isArray(v))
     throw new Error('P2_READBACK_INVALID_DATABASE_RESPONSE');
   const y=v as Record<string,unknown>;
   if(y.state==='INDETERMINATE_NOT_FOUND' && y.automaticRetryAllowed===false)
     return {state:'INDETERMINATE_NOT_FOUND',automaticRetryAllowed:false} as const;
   if(y.state!=='COMMITTED_VERIFIED'||!y.result||typeof y.result!=='object')
     throw new Error('P2_READBACK_UNVERIFIED_DATABASE_RESPONSE');
   const result=y.result as PostResult;
   if(result.commandId!==payload.commandId||result.fact?.commandId!==payload.commandId||
      result.fact?.operatorId!==subject||result.fact?.kind!==payload.kind||
      result.fact?.sourceDocumentId!==payload.sourceDocumentId||
      result.fact?.entityId!==payload.legalEntityId)
     throw new Error('P2_READBACK_RESULT_SCOPE_MISMATCH');
   return {state:'COMMITTED_VERIFIED',result:{...result,replay:true}} as const;
 });
}

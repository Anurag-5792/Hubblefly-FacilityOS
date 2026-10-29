/**
 * HFT R1 P2: single runtime-facing DB function call, not an alternate stock
 * engine. Deliberately unused by HTTP routes until source+DB acceptance.
 * The legacy isolated DML adapter is nonproduction test-only and MUST NOT be
 * granted runtime protected-table DML or exposed as an API.
 */
import type {StockCommand,PostResult} from '../domain/ledger.ts';
import type {VerifiedRequestOperator} from '../security/verified-request.ts';
import {assertVerifiedRequestOperator} from '../security/verified-request.ts';
import {postingPayloadFromCommand,type ProtectedPostingPayload} from '../security/posting-invocation-proof.ts';
import {issueServerInvocationProof} from '../security/posting-proof-issuer.ts';
import {withProtectedPostingTransaction} from './protected-posting-transaction.ts';
import {CommitOutcomeUncertain} from './isolated-pg-transaction.ts';
import {reconcileProtectedStockCommand} from './protected-stock-readback.ts';
import type {PgPool,IsolatedPgEnvironment} from './isolated-pg-transaction.ts';

export type PersistedApprovalReference=Readonly<{
  sourceRevision:number;approvalId:string;approvalRevision:number;
  policyGeneration:number;approvedPayloadSha256:string;inspectionEvidenceId:string;
}>;
export type ServerProofKeyHandle=Readonly<{keyVersion:number;keyBytes:Uint8Array}>;
function resultShape(value:unknown,request:ProtectedPostingPayload):PostResult {
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw new Error('PROTECTED_WRITER_RESULT_INVALID');
  const result=value as Record<string,unknown>;
  if(result.commandId!==request.commandId||typeof result.available!=='string'||
      !Number.isSafeInteger(result.accountVersion)||typeof result.replay!=='boolean'||
      !result.fact||typeof result.fact!=='object')
    throw new Error('PROTECTED_WRITER_RESULT_INVALID');
  return value as PostResult;
}
/** Caller must provide approved sources from trusted server persistence;
 * PostgreSQL independently validates every source and approval again.
 */
export async function postProtectedStockCommand(pool:PgPool,env:IsolatedPgEnvironment,
 command:StockCommand,operator:VerifiedRequestOperator,
 approved:PersistedApprovalReference,signer:ServerProofKeyHandle):Promise<PostResult>{
  assertVerifiedRequestOperator(operator,command);
  const payload=postingPayloadFromCommand(command,approved);
  // Only after a real verified request, never from forwarded caller actor data.
  const proof=issueServerInvocationProof(payload,operator,signer.keyBytes,signer.keyVersion);
  try {
    return await withProtectedPostingTransaction(pool,env,async client=>{
      const rows=await client.query<{result:unknown}>(
        'SELECT hft.post_stock_command_protected_v1($1::jsonb,$2::jsonb) AS result',
        [JSON.stringify(payload),JSON.stringify(proof)]);
      if(rows.rows.length!==1)throw new Error('PROTECTED_WRITER_RESULT_MISSING');
      return resultShape(rows.rows[0].result,payload);
    });
  }catch(err){
    if(!(err instanceof CommitOutcomeUncertain))throw err;
    // Same original nonce/payload, new attested connection, READ ONLY.
    // No automatic re-post even if the record cannot be found.
    try {
      const recovered=await reconcileProtectedStockCommand(pool,env,payload,proof,operator);
      if(recovered.state==='COMMITTED_VERIFIED')return recovered.result;
    }catch(readbackError){
      throw new AggregateError([err,readbackError],
        'P2_COMMIT_UNCERTAIN_RECOVERY_UNVERIFIED_NO_RETRY');
    }
    throw err;
  }
}

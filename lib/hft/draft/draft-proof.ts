/** Draft077 database invocation proof. Server-only and always issued after
 * genuine Ed25519 session verification. Exact Chat13 length-prefix/HMAC.
 */
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {lengthPrefixedUtf8} from '../security/posting-invocation-proof.ts';
import {assertVerifiedRequestOperator,type VerifiedRequestOperator}
 from '../security/verified-request.ts';
import {assertDraftProfile,type DraftEnv} from './draft-profile.ts';
import type {DraftScope} from './draft-contract.ts';
export const DRAFT_PROOF_PROTOCOL='HFT-DRAFT077-HMAC-V1';
export type DraftProof=Readonly<{
 proofVersion:typeof DRAFT_PROOF_PROTOCOL;actorSubject:string;sessionId:string;
 payloadSha256:string;issuedAt:string;expiresAt:string;nonce:string;
 keyVersion:string;macSha256:string;
}>;
export function assertEnrolledDraftScope(env:DraftEnv,
 actor:VerifiedRequestOperator,scope:DraftScope):string{
 const subject=assertVerifiedRequestOperator(actor,scope);
 if(scope.legalEntityId!==env.HFT_DRAFT_SCOPE_LEGAL_ENTITY||
  scope.siteId!==env.HFT_DRAFT_SCOPE_SITE||
  scope.warehouseId!==env.HFT_DRAFT_SCOPE_WAREHOUSE)
  throw Error('DRAFT077_ENROLLED_SCOPE_IDENTITY_MISMATCH');
 return subject;
}
export function signDraftBody(env:DraftEnv,
 actor:VerifiedRequestOperator,scope:DraftScope,
 duty:'WRITE'|'READ',bodyText:string,now=Math.floor(Date.now()/1000)):DraftProof{
 assertDraftProfile(env);
 const subject=assertEnrolledDraftScope(env,actor,scope);
 if(bodyText.length<2||Buffer.byteLength(bodyText,'utf8')>8192||
  !Number.isSafeInteger(now)||now<1)
  throw Error('DRAFT077_SIGNED_BODY_OR_CLOCK_INVALID');
 const key=Buffer.from(env.HFT_DRAFT_HMAC_KEY_BASE64!,'base64');
 try{
  const digest=createHash('sha256').update(bodyText,'utf8').digest('hex');
  const fields=[DRAFT_PROOF_PROTOCOL,duty,subject,actor.sessionId,digest,
   String(now),String(now+40),randomBytes(24).toString('hex'),
   env.HFT_DRAFT_HMAC_KEY_VERSION!];
  const signature=createHmac('sha256',key).update(lengthPrefixedUtf8(fields))
   .digest('hex');
  return Object.freeze({proofVersion:DRAFT_PROOF_PROTOCOL,actorSubject:subject,
   sessionId:actor.sessionId,payloadSha256:digest,
   issuedAt:fields[5],expiresAt:fields[6],nonce:fields[7],
   keyVersion:fields[8],macSha256:signature});
 }finally{key.fill(0);}
}

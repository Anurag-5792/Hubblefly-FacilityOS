/** Prospective domain-separated P3 nonemployee decision proof.
 * SOURCE ONLY, not connected to runtime API or enrolled trust key.
 * Independent Chat 10/11/17 approval required before any activation.
 */
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {lengthPrefixedUtf8} from '../security/posting-invocation-proof.ts';
import {assertVerifiedRequestOperator,type VerifiedRequestOperator}
 from '../security/verified-request.ts';
export const NONEMPLOYEE_DECISION_VERSION='HFT-R1-P3-NONEMPLOYEE-DECISION-V1' as const;
export const NONEMPLOYEE_PROOF_VERSION='HFT-R1-P3-NONEMPLOYEE-DECISION-HMAC-V1' as const;
export const NONEMPLOYEE_KINDS=['ITEM','SUPPLIER','WAREHOUSE','LOCATION'] as const;
export type NonEmployeeKind=typeof NONEMPLOYEE_KINDS[number];
export type NonEmployeeDecision=Readonly<{
 decisionVersion:typeof NONEMPLOYEE_DECISION_VERSION;
 kind:NonEmployeeKind;requestId:string;requestPayloadSha256:string;
 recordId:string;expectedVersion:string;policyRevision:string;
 decision:'APPROVED'|'DENIED';evidenceSha256:string;reason:string;
 legalEntityId:string;siteId:string;warehouseId:string;
}>;
export const NONEMPLOYEE_DECISION_FIELDS=[
 'decisionVersion','kind','requestId','requestPayloadSha256','recordId',
 'expectedVersion','policyRevision','decision','evidenceSha256','reason',
 'legalEntityId','siteId','warehouseId'
] as const;
const id=/^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hex=/^[0-9a-f]{64}$/;
const number=/^[1-9][0-9]{0,17}$/;
export function validateNonEmployeeDecision(value:unknown):NonEmployeeDecision{
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw Error('P3_R77_NONEMPLOYEE_DECISION_OBJECT_REQUIRED');
 const x=value as Record<string,unknown>;
 if(Object.keys(x).length!==NONEMPLOYEE_DECISION_FIELDS.length||
  NONEMPLOYEE_DECISION_FIELDS.some(k=>!Object.hasOwn(x,k)||
    typeof x[k]!=='string')||
  Object.keys(x).some(k=>!NONEMPLOYEE_DECISION_FIELDS.some(n=>n===k)))
  throw Error('P3_R77_NONEMPLOYEE_DECISION_EXACT_KEYS');
 if(x.decisionVersion!==NONEMPLOYEE_DECISION_VERSION||
   !NONEMPLOYEE_KINDS.includes(x.kind as NonEmployeeKind)||
   !['APPROVED','DENIED'].includes(x.decision as string)||
   !uuid.test(x.requestId as string)||
   !hex.test(x.requestPayloadSha256 as string)||
   !hex.test(x.evidenceSha256 as string)||
   !/^(0|[1-9][0-9]{0,17})$/.test(x.expectedVersion as string)||
   !number.test(x.policyRevision as string)||
   typeof x.reason!=='string'||x.reason.length<8||x.reason.length>300||
   x.reason!==x.reason.trim())
  throw Error('P3_R77_NONEMPLOYEE_DECISION_FORMAT_DENIED');
 for(const field of ['recordId','legalEntityId','siteId','warehouseId'] as const)
  if(!id.test(x[field] as string))
   throw Error('P3_R77_NONEMPLOYEE_DECISION_SCOPE_DENIED');
 return Object.freeze(x as NonEmployeeDecision);
}
export function nonEmployeeDecisionFields(x:NonEmployeeDecision):readonly string[]{
 const valid=validateNonEmployeeDecision(x);
 return NONEMPLOYEE_DECISION_FIELDS.map(k=>valid[k]);
}
export function nonEmployeeDecisionDigest(x:NonEmployeeDecision):string{
 return createHash('sha256').update(lengthPrefixedUtf8(nonEmployeeDecisionFields(x)))
  .digest('hex');
}
export function issueNonEmployeeDecisionProof(x:NonEmployeeDecision,
 actor:VerifiedRequestOperator,key:Uint8Array,keyVersion:number,
 now=Math.floor(Date.now()/1000)){
 const d=validateNonEmployeeDecision(x);
 const subject=assertVerifiedRequestOperator(actor,d);
 if(!(key instanceof Uint8Array)||key.length<32||
  !Number.isSafeInteger(keyVersion)||keyVersion<1||
  !Number.isSafeInteger(now)||now<1)
  throw Error('P3_R77_NONEMPLOYEE_SIGNING_KEY_NOT_QUALIFIED');
 const result={proofVersion:NONEMPLOYEE_PROOF_VERSION,
  actorSubject:subject,sessionId:actor.sessionId,
  payloadSha256:nonEmployeeDecisionDigest(d),
  issuedAt:String(now),expiresAt:String(now+40),
  nonce:randomBytes(24).toString('hex'),keyVersion:String(keyVersion)};
 const fields=[result.proofVersion,result.actorSubject,result.sessionId,
  result.payloadSha256,result.issuedAt,result.expiresAt,
  result.nonce,result.keyVersion];
 const macSha256=createHmac('sha256',key).update(lengthPrefixedUtf8(fields))
  .digest('hex');
 return Object.freeze({...result,macSha256});
}

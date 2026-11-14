/**
 * HFT P3: read and independent Employee decision proof contracts.
 * The existing Ed25519 verified-request identity remains the sole login
 * authority. HMACs are *database invocation proofs*, never new identities.
 * This source does not qualify/provision key custody or session issuance.
 */
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {lengthPrefixedUtf8} from '../security/posting-invocation-proof.ts';
import {assertVerifiedRequestOperator,type VerifiedRequestOperator}
 from '../security/verified-request.ts';
import {validateMasterRequest,type MasterQuery,type MasterScope}
 from './p3-contract.ts';

const digest=/^[0-9a-f]{64}$/;
const version=/^[1-9][0-9]{0,17}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const identifier=/^[A-Z0-9][A-Z0-9._-]{1,63}$/;
export const READ_PROTOCOL='HFT-R1-P3-MASTER-READ-HMAC-V1' as const;
export const DECISION_PROTOCOL='HFT-R1-P3-EMPLOYEE-DECISION-HMAC-V1' as const;
export type MasterReadQuery=MasterQuery;
export type EmployeeDecision=Readonly<MasterScope&{
 decisionVersion:'HFT-R1-P3-EMPLOYEE-DECISION-V1';
 requestId:string;requestPayloadSha256:string;recordId:string;
 expectedVersion:string;policyRevision:string;
 decision:'APPROVED'|'DENIED';evidenceSha256:string;reason:string;
}>;
export type P3BoundProof=Readonly<{
 proofVersion:typeof READ_PROTOCOL|typeof DECISION_PROTOCOL;
 actorSubject:string;sessionId:string;payloadSha256:string;
 issuedAt:string;expiresAt:string;nonce:string;keyVersion:string;macSha256:string;
}>;
function required(value:unknown,pattern:RegExp,code:string):string{
 if(typeof value!=='string'||!pattern.test(value))throw new Error(code);
 return value;
}
export function validateEmployeeDecision(value:unknown):EmployeeDecision{
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw new Error('P3_DECISION_OBJECT_REQUIRED');
 const x=value as Record<string,unknown>;
 const names=['decisionVersion','requestId','requestPayloadSha256','recordId',
  'expectedVersion','policyRevision','decision','evidenceSha256','reason',
  'legalEntityId','siteId','warehouseId'];
 if(Object.keys(x).length!==names.length||names.some(k=>!Object.hasOwn(x,k)))
  throw new Error('P3_DECISION_FIELDS_INVALID');
 if(x.decisionVersion!=='HFT-R1-P3-EMPLOYEE-DECISION-V1')
  throw new Error('P3_DECISION_PROTOCOL_INVALID');
 if(x.decision!=='APPROVED'&&x.decision!=='DENIED')
  throw new Error('P3_DECISION_VALUE_INVALID');
 const reason=x.reason;
 if(typeof reason!=='string'||reason!==reason.trim()||
    reason.length<8||reason.length>300)throw new Error('P3_DECISION_REASON_REQUIRED');
 const checked={
  decisionVersion:x.decisionVersion,requestId:required(x.requestId,uuid,'P3_DECISION_REQUEST_INVALID'),
  requestPayloadSha256:required(x.requestPayloadSha256,digest,'P3_REQUEST_DIGEST_INVALID'),
  recordId:required(x.recordId,identifier,'P3_DECISION_EMPLOYEE_INVALID'),
  expectedVersion:required(x.expectedVersion,/^(0|[1-9][0-9]{0,17})$/,'P3_DECISION_REVISION_INVALID'),
  policyRevision:required(x.policyRevision,version,'P3_DECISION_POLICY_INVALID'),
  decision:x.decision,
  evidenceSha256:required(x.evidenceSha256,digest,'P3_DECISION_EVIDENCE_REQUIRED'),
  reason,
  legalEntityId:required(x.legalEntityId,identifier,'P3_DECISION_ENTITY_INVALID'),
  siteId:required(x.siteId,identifier,'P3_DECISION_SITE_INVALID'),
  warehouseId:required(x.warehouseId,identifier,'P3_DECISION_WAREHOUSE_INVALID')
 } as EmployeeDecision;
 return Object.freeze(checked);
}
export function readFields(query:MasterReadQuery):readonly string[]{
 const q=validateMasterRequest(query);
 if(q.intent==='SUBMIT')throw new Error('P3_READ_REQUEST_REQUIRED');
 return ['HFT-R1-P3-MASTER-READ-V1',q.intent,q.kind,q.legalEntityId,
  q.siteId,q.warehouseId,q.search,q.recordId||''];
}
export function decisionFields(decision:EmployeeDecision):readonly string[]{
 const d=validateEmployeeDecision(decision);
 return [d.decisionVersion,d.requestId,d.requestPayloadSha256,d.recordId,
  d.expectedVersion,d.policyRevision,d.decision,d.evidenceSha256,d.reason,
  d.legalEntityId,d.siteId,d.warehouseId];
}
function sha(fields:readonly string[]):string{
 return createHash('sha256').update(lengthPrefixedUtf8(fields)).digest('hex');
}
export function masterReadDigest(query:MasterReadQuery):string{return sha(readFields(query));}
export function employeeDecisionDigest(decision:EmployeeDecision):string{
 return sha(decisionFields(decision));
}
function issue(protocol:typeof READ_PROTOCOL|typeof DECISION_PROTOCOL,
 digestValue:string,scope:MasterScope,operator:VerifiedRequestOperator,
 key:Uint8Array,keyVersion:number,at:number):P3BoundProof{
 const actorSubject=assertVerifiedRequestOperator(operator,scope);
 if(!(key instanceof Uint8Array)||key.length<32||!Number.isSafeInteger(keyVersion)||
    keyVersion<1||!Number.isSafeInteger(at)||at<1)
  throw new Error('P3_PROOF_KEY_OR_CLOCK_UNAVAILABLE');
 const proof={
  proofVersion:protocol,actorSubject,sessionId:operator.sessionId,
  payloadSha256:digestValue,issuedAt:String(at),expiresAt:String(at+40),
  nonce:randomBytes(24).toString('hex'),keyVersion:String(keyVersion)
 };
 const fields=[proof.proofVersion,proof.actorSubject,proof.sessionId,
  proof.payloadSha256,proof.issuedAt,proof.expiresAt,proof.nonce,proof.keyVersion];
 const macSha256=createHmac('sha256',key).update(lengthPrefixedUtf8(fields)).digest('hex');
 return Object.freeze({...proof,macSha256});
}
export function issueMasterReadProof(query:MasterReadQuery,
 operator:VerifiedRequestOperator,key:Uint8Array,keyVersion:number,
 at=Math.floor(Date.now()/1000)):P3BoundProof{
 return issue(READ_PROTOCOL,masterReadDigest(query),query,operator,key,keyVersion,at);
}
export function issueEmployeeDecisionProof(decision:EmployeeDecision,
 operator:VerifiedRequestOperator,key:Uint8Array,keyVersion:number,
 at=Math.floor(Date.now()/1000)):P3BoundProof{
 return issue(DECISION_PROTOCOL,employeeDecisionDigest(decision),decision,operator,key,keyVersion,at);
}

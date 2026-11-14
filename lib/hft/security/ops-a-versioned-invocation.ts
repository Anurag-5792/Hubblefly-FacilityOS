/** HFT OPS-A P2 V2 PROSPECTIVE SOURCE-ONLY posting proof reference.
 * Does not issue production credentials, trust identities or authority, and
 * is NOT connected to any runtime API or PostgreSQL writer.
 * The existing protected P2 V1 signed byte contract is not changed.
 */
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {parseQuantity} from '../domain/quantity.ts';
import {lengthPrefixedUtf8} from './posting-invocation-proof.ts';
import type {VersionedCommand} from '../persistence/ops-a-versioned-evidence.ts';

export const OPS_A_POST_V2='HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED' as const;
export const OPS_A_POST_PROOF_V2='HFT-R1-OPS-A-P2-HMAC-V2-PROPOSED' as const;
export const OPS_A_PAYLOAD_FIELDS=[
 'contractVersion','commandId','idempotencyKey','kind','legalEntityId',
 'siteId','warehouseId','itemCode','productVersion','controlType','serialNo',
 'batchNo','sourceLeafId','destinationLeafId','sourceAccountId',
 'destinationAccountId','sourceAccountBeforeVersion',
 'destinationAccountBeforeVersion','employeeId','originalIssueId',
 'sourceDocumentId','sourceActionKey','fragmentId','quantityMicro',
 'sourceRevision','approvalId','approvalRevision','policyGeneration',
 'approvedPayloadSha256','approvedBy','actorSubject','inspectedCondition',
 'inspectionEvidenceId'
] as const;
export type OpsAPayload=Readonly<Record<typeof OPS_A_PAYLOAD_FIELDS[number],string>>;
export type OpsAProofFields=Readonly<{
 proofVersion:typeof OPS_A_POST_PROOF_V2;actorSubject:string;sessionId:string;
 payloadSha256:string;issuedAt:string;expiresAt:string;nonce:string;
 keyVersion:string;
}>;
export type OpsAProof=OpsAProofFields&Readonly<{macSha256:string}>;
const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const nonce=/^[0-9a-f]{48}$/;
const sha=/^[0-9a-f]{64}$/;
const num=/^(0|[1-9][0-9]*)$/;
const i64=9223372036854775807n;
function number(value:string,name:string,nonzero=false):bigint{
 if(typeof value!=='string'||!num.test(value)||nonzero&&value==='0')
  throw Error('OPS_A_V2_'+name+'_DECIMAL_INVALID');
 const n=BigInt(value);
 if(n>i64)throw Error('OPS_A_V2_'+name+'_OVERFLOW');
 return n;
}
function identity(value:string,name:string,optional=false):void{
 if(typeof value!=='string'||!(optional&&value==='')&&!id.test(value))
  throw Error('OPS_A_V2_'+name+'_INVALID');
}
export function canonicalOpsAPayloadFields(payload:OpsAPayload):readonly string[]{
 const p=payload as unknown as Record<string,unknown>;
 if(!p||Object.keys(p).length!==OPS_A_PAYLOAD_FIELDS.length||
    OPS_A_PAYLOAD_FIELDS.some(key=>typeof p[key]!=='string')||
    Object.keys(p).some(k=>!OPS_A_PAYLOAD_FIELDS.some(f=>f===k)))
  throw Error('OPS_A_V2_PAYLOAD_EXACT_KEYS_REQUIRED');
 if(payload.contractVersion!==OPS_A_POST_V2||
    !['RECEIVE','ISSUE','RETURN','TRANSFER'].includes(payload.kind))
  throw Error('OPS_A_V2_ACTION_INVALID');
 for(const key of ['commandId','idempotencyKey','legalEntityId','siteId',
  'warehouseId','itemCode','productVersion','sourceDocumentId',
  'sourceActionKey','approvalId','approvedBy','actorSubject'] as const)
  identity(payload[key],key);
 for(const key of ['serialNo','batchNo','sourceLeafId','destinationLeafId',
  'sourceAccountId','destinationAccountId','employeeId','originalIssueId',
  'fragmentId','inspectionEvidenceId'] as const)
  identity(payload[key],key,true);
 if(payload.actorSubject===payload.approvedBy)
  throw Error('OPS_A_V2_SELF_APPROVAL_DENIED');
 if(!['NONE','SERIAL','BATCH'].includes(payload.controlType)||
    payload.controlType==='SERIAL'&&(!payload.serialNo||payload.batchNo)||
    payload.controlType==='BATCH'&&(!payload.batchNo||payload.serialNo)||
    payload.controlType==='NONE'&&(payload.serialNo!==''||payload.batchNo!==''))
  throw Error('OPS_A_V2_TRACEABILITY_INVALID');
 const qty=number(payload.quantityMicro,'QUANTITY',true);
 if(payload.controlType==='SERIAL'&&qty!==1_000_000n)
  throw Error('OPS_A_V2_SERIAL_UNIT_REQUIRED');
 for(const key of ['sourceRevision','approvalRevision','policyGeneration'] as const)
  number(payload[key],key,true);
 if(!sha.test(payload.approvedPayloadSha256))
  throw Error('OPS_A_V2_APPROVED_DIGEST_INVALID');
 if(payload.sourceAccountBeforeVersion===''){
  if(payload.kind!=='RECEIVE'||payload.sourceAccountId!==''||
     payload.sourceLeafId!=='')
   throw Error('OPS_A_V2_EXTERNAL_SOURCE_INVALID');
 }else{
  number(payload.sourceAccountBeforeVersion,'SOURCE_ACCOUNT_VERSION');
  if(!payload.sourceAccountId||!payload.sourceLeafId)
   throw Error('OPS_A_V2_SOURCE_ACCOUNT_REQUIRED');
 }
 number(payload.destinationAccountBeforeVersion,'DESTINATION_ACCOUNT_VERSION');
 if(!payload.destinationAccountId)throw Error('OPS_A_V2_DEST_ACCOUNT_REQUIRED');
 if(payload.kind==='RECEIVE'){
  if(payload.sourceAccountId!==''||payload.sourceAccountBeforeVersion!==''||
      payload.sourceLeafId!==''||!payload.destinationLeafId||
      payload.employeeId||payload.originalIssueId||payload.fragmentId||
      payload.inspectedCondition!=='GOOD'||!payload.inspectionEvidenceId)
   throw Error('OPS_A_V2_RECEIPT_EVIDENCE_INVALID');
 }else if(payload.kind==='ISSUE'){
  if(!payload.sourceAccountId||!payload.sourceLeafId||
      payload.destinationLeafId||!payload.employeeId||!payload.fragmentId||
      payload.originalIssueId||payload.inspectedCondition!=='GOOD')
   throw Error('OPS_A_V2_ISSUE_SCOPE_INVALID');
 }else if(payload.kind==='RETURN'){
  if(!payload.sourceLeafId||!payload.destinationLeafId||
      !payload.employeeId||!payload.originalIssueId||!payload.fragmentId||
      !payload.inspectionEvidenceId||
      !['GOOD','DAMAGED','QUARANTINE'].includes(payload.inspectedCondition))
   throw Error('OPS_A_V2_RETURN_INSPECTION_INVALID');
 }else if(payload.kind==='TRANSFER'){
  if(!payload.sourceLeafId||!payload.destinationLeafId||
      payload.sourceLeafId===payload.destinationLeafId||
      !payload.fragmentId||payload.employeeId||payload.originalIssueId||
      payload.inspectedCondition!=='GOOD')
   throw Error('OPS_A_V2_TRANSFER_SCOPE_INVALID');
 }
 if(payload.sourceAccountId&&
    payload.sourceAccountId===payload.destinationAccountId)
  throw Error('OPS_A_V2_IDENTICAL_ACCOUNTS_DENIED');
 return OPS_A_PAYLOAD_FIELDS.map(x=>payload[x]);
}
/** Prospective immutable V2 fields. Caller-supplied approval is not trusted
 * until the future protected SQL independently checks its exact source. */
export function proposedOpsAPayload(command:VersionedCommand,
 sourceAccountId:string,destinationAccountId:string,
 approvedPayloadSha256:string):OpsAPayload{
 const c=command;
 const p:OpsAPayload={
  contractVersion:OPS_A_POST_V2,commandId:c.commandId,
  idempotencyKey:c.idempotencyKey,kind:c.kind,legalEntityId:c.legalEntityId,
  siteId:c.siteId,warehouseId:c.warehouseId,itemCode:c.itemCode,
  productVersion:c.productVersion,controlType:c.controlType,
  serialNo:c.serialNo,batchNo:c.batchNo,sourceLeafId:c.sourceLeafId,
  destinationLeafId:c.destinationLeafId,sourceAccountId,destinationAccountId,
  sourceAccountBeforeVersion:c.expectedSourceAccountVersion===null?''
    :String(c.expectedSourceAccountVersion),
  destinationAccountBeforeVersion:c.expectedDestinationAccountVersion===null?''
    :String(c.expectedDestinationAccountVersion),
  employeeId:c.employeeId,originalIssueId:c.originalIssueId,
  sourceDocumentId:c.sourceDocumentId,sourceActionKey:c.sourceActionKey,
  fragmentId:c.fragmentId,quantityMicro:parseQuantity(c.requestQuantity).toString(),
  sourceRevision:String(c.sourceRevision),approvalId:c.approvalId,
  approvalRevision:String(c.approvalRevision),
  policyGeneration:String(c.policyGeneration),
  approvedPayloadSha256,approvedBy:c.approvedBy,actorSubject:c.actorSubject,
  inspectedCondition:c.inspectedCondition,inspectionEvidenceId:c.inspectionEvidenceId
 };
 canonicalOpsAPayloadFields(p);
 return Object.freeze(p);
}
export function opsAPayloadSha256(p:OpsAPayload):string{
 return createHash('sha256').update(
  lengthPrefixedUtf8(canonicalOpsAPayloadFields(p))).digest('hex');
}
function proofCanonicalFields(p:OpsAPayload,f:OpsAProofFields):readonly string[]{
 const x=f as unknown as Record<string,unknown>;
 const wanted=['proofVersion','actorSubject','sessionId','payloadSha256',
  'issuedAt','expiresAt','nonce','keyVersion'];
 if(Object.keys(x).length!==wanted.length||
    wanted.some(k=>typeof x[k]!=='string')||
    Object.keys(x).some(k=>!wanted.includes(k)))
  throw Error('OPS_A_V2_PROOF_EXACT_FIELDS_REQUIRED');
 if(f.proofVersion!==OPS_A_POST_PROOF_V2||
    f.actorSubject!==p.actorSubject||!id.test(f.actorSubject)||
    !id.test(f.sessionId)||f.payloadSha256!==opsAPayloadSha256(p)||
    !nonce.test(f.nonce))throw Error('OPS_A_V2_PROOF_BINDING_INVALID');
 const iat=number(f.issuedAt,'ISSUED_AT',true);
 const expires=number(f.expiresAt,'EXPIRES_AT',true);
 number(f.keyVersion,'KEY_VERSION',true);
 if(expires<=iat||expires-iat>60n)throw Error('OPS_A_V2_PROOF_LIFETIME_INVALID');
 return [f.proofVersion,f.actorSubject,f.sessionId,f.payloadSha256,
  f.issuedAt,f.expiresAt,f.nonce,f.keyVersion];
}
/** Test-reference MAC ONLY. Does not create/enroll an operational key or proof. */
export function opsATestOnlyMac(p:OpsAPayload,fields:OpsAProofFields,
 syntheticKey:Uint8Array):string{
 if(!(syntheticKey instanceof Uint8Array)||syntheticKey.length<32)
  throw Error('OPS_A_V2_KEY_NOT_QUALIFIED');
 return createHmac('sha256',syntheticKey).update(
  lengthPrefixedUtf8(proofCanonicalFields(p,fields))).digest('hex');
}
/** Synthetic vector validator, not a corporate/PG18 authorization service. */
export function verifyOpsATestVector(p:OpsAPayload,proof:OpsAProof,
 syntheticKey:Uint8Array,nowSeconds:number):void{
 if(!Number.isSafeInteger(nowSeconds)||nowSeconds<1)
  throw Error('OPS_A_V2_CLOCK_INVALID');
 const {macSha256,...fields}=proof;
 proofCanonicalFields(p,fields);
 if(!sha.test(macSha256))throw Error('OPS_A_V2_MAC_ENCODING_INVALID');
 if(BigInt(fields.issuedAt)>BigInt(nowSeconds)+30n||
    BigInt(fields.expiresAt)<=BigInt(nowSeconds))
  throw Error('OPS_A_V2_EXPIRED_OR_FUTURE');
 const expected=opsATestOnlyMac(p,fields,syntheticKey);
 if(!timingSafeEqual(Buffer.from(macSha256,'hex'),Buffer.from(expected,'hex')))
  throw Error('OPS_A_V2_TEST_MAC_INVALID');
}

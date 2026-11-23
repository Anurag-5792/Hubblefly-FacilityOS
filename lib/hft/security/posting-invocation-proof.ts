/**
 * HFT R1 protected-posting invocation V1. Source contract, not activated.
 * This module cannot issue a verified login/session, hold production keys, or
 * authorize a database posting. A trusted server must bind its signed session
 * and source payload; PostgreSQL independently verifies the same byte protocol.
 * All quantities/versions/times are canonical decimal STRINGS to avoid bigint
 * loss or JSONB text-rendering differences. Do not log secrets or signed MACs.
 */
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import type {StockCommand} from '../domain/ledger.ts';
import {parseQuantity} from '../domain/quantity.ts';

export const INVOCATION_V1='HFT-R1-P2-HMAC-SHA256-V1' as const;
const decimal=/^(0|[1-9][0-9]*)$/;
const positive=/^[1-9][0-9]*$/;
const identifier=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const digest=/^[0-9a-f]{64}$/;
const noncePattern=/^[0-9a-f]{48}$/;
const maxBigInt=9223372036854775807n;

/** Exactly these names and order also appear in the SQL byte encoder. */
export const PAYLOAD_FIELDS=[
  'contractVersion','commandId','idempotencyKey','kind','legalEntityId','siteId',
  'warehouseId','itemCode','locationId','batchNo','serialNo','condition',
  'employeeId','originalIssueId','sourceDocumentId','sourceActionKey','fragmentId',
  'quantityMicro','sourceRevision','approvalId','approvalRevision','policyGeneration',
  'expectedBalanceVersion','approvedPayloadSha256','inspectionEvidenceId',
] as const;
export type PayloadField=typeof PAYLOAD_FIELDS[number];
export type ProtectedPostingPayload=Readonly<Record<PayloadField,string>>;
export type InvocationProofFields=Readonly<{
  proofVersion:'HFT-R1-P2-HMAC-SHA256-V1'; actorSubject:string; sessionId:string;
  payloadSha256:string; issuedAt:string; expiresAt:string; nonce:string;
  keyVersion:string;
}>;
export type InvocationProof=InvocationProofFields&Readonly<{macSha256:string}>;

function exactKeys(obj:Record<string,string>,names:readonly string[],name:string):void {
  if(Object.keys(obj).length!==names.length ||
      !Object.keys(obj).every(k=>names.includes(k)) ||
      !names.every(k=>typeof obj[k]==='string')) throw new Error(`${name}_FIELDS_INVALID`);
}
function integer(value:string,zeroAllowed:boolean,name:string):bigint{
  if(!(zeroAllowed?decimal:positive).test(value))throw new Error(`${name}_DECIMAL_INVALID`);
  const n=BigInt(value);
  if(n>maxBigInt)throw new Error(`${name}_OVERFLOW`);
  return n;
}
function requireId(value:string,name:string,optional=false):void{
  if(!(optional&&value==='')&&!identifier.test(value))throw new Error(`${name}_IDENTIFIER_INVALID`);
}
export function canonicalPayloadFields(payload:ProtectedPostingPayload):readonly string[]{
  exactKeys(payload as Record<string,string>,PAYLOAD_FIELDS,'PROTECTED_PAYLOAD');
  if(payload.contractVersion!=='HFT_STOCK_POST_V1' ||
     !['RECEIVE','ISSUE','RETURN'].includes(payload.kind))throw new Error('PROTECTED_PAYLOAD_ACTION_INVALID');
  for(const key of ['commandId','idempotencyKey','legalEntityId','siteId','warehouseId',
    'itemCode','locationId','sourceDocumentId','sourceActionKey','approvalId'] as const)
    requireId(payload[key],key);
  for(const key of ['batchNo','serialNo','employeeId','originalIssueId','fragmentId',
    'inspectionEvidenceId'] as const)requireId(payload[key],key,true);
  if(payload.kind!=='RECEIVE' && !payload.fragmentId)
    throw new Error('PARTIAL_POSTING_FRAGMENT_REQUIRED');
  if(payload.kind==='RECEIVE' && payload.fragmentId)
    throw new Error('RECEIPT_MUST_USE_PHYSICAL_RECEIPT_ID');
  if(payload.kind==='RETURN' && (!payload.employeeId||!payload.originalIssueId||
      !['GOOD','DAMAGED','QUARANTINE'].includes(payload.condition)||!payload.inspectionEvidenceId))
    throw new Error('RETURN_SOURCE_INSPECTION_REQUIRED');
  if(payload.kind==='ISSUE' && (!payload.employeeId||payload.originalIssueId||payload.condition!=='GOOD'))
    throw new Error('ISSUE_FRAGMENT_SCOPE_INVALID');
  if(payload.kind==='RECEIVE' && (payload.employeeId||payload.originalIssueId||payload.condition!=='GOOD'))
    throw new Error('RECEIVE_FRAGMENT_SCOPE_INVALID');
  integer(payload.quantityMicro,false,'QUANTITY');
  for(const key of ['sourceRevision','approvalRevision','policyGeneration'] as const)
    integer(payload[key],false,key.toUpperCase());
  integer(payload.expectedBalanceVersion,true,'BALANCE_VERSION');
  if(!digest.test(payload.approvedPayloadSha256))throw new Error('APPROVED_PAYLOAD_DIGEST_INVALID');
  return PAYLOAD_FIELDS.map(k=>payload[k]);
}
/** Domain + u32BE length prefixed UTF-8 fields. No JSON serialization in MAC. */
export function lengthPrefixedUtf8(fields:readonly string[]):Buffer {
  if(fields.length>64)throw new Error('MAC_TOO_MANY_FIELDS');
  const parts:Buffer[]=[];
  for(const field of fields){
    if(typeof field!=='string')throw new Error('MAC_NONSTRING_FIELD');
    const value=Buffer.from(field,'utf8');
    if(value.length>0xffff)throw new Error('MAC_FIELD_TOO_LARGE');
    const prefix=Buffer.alloc(4);prefix.writeUInt32BE(value.length,0);
    parts.push(prefix,value);
  }
  return Buffer.concat(parts);
}
export function protectedPayloadSha256(payload:ProtectedPostingPayload):string{
  return createHash('sha256').update(lengthPrefixedUtf8(canonicalPayloadFields(payload))).digest('hex');
}
export function canonicalInvocationFields(payload:ProtectedPostingPayload,proof:InvocationProofFields):readonly string[]{
  const expected=['proofVersion','actorSubject','sessionId','payloadSha256','issuedAt','expiresAt','nonce','keyVersion'];
  exactKeys(proof as unknown as Record<string,string>,expected,'INVOCATION_PROOF');
  if(proof.proofVersion!==INVOCATION_V1||proof.payloadSha256!==protectedPayloadSha256(payload))
    throw new Error('INVOCATION_PAYLOAD_BINDING_INVALID');
  requireId(proof.actorSubject,'ACTOR');requireId(proof.sessionId,'SESSION');
  if(!digest.test(proof.payloadSha256)||!noncePattern.test(proof.nonce))
    throw new Error('INVOCATION_PROOF_ENCODING_INVALID');
  const iat=integer(proof.issuedAt,false,'ISSUED_AT');
  const exp=integer(proof.expiresAt,false,'EXPIRES_AT');
  integer(proof.keyVersion,false,'KEY_VERSION');
  if(exp<=iat||exp-iat>60n)throw new Error('INVOCATION_LIFETIME_INVALID');
  return [INVOCATION_V1,proof.actorSubject,proof.sessionId,payload.commandId,
    payload.idempotencyKey,payload.kind,proof.payloadSha256,payload.sourceRevision,
    payload.legalEntityId,payload.siteId,payload.warehouseId,payload.sourceDocumentId,
    payload.sourceActionKey,payload.fragmentId,payload.quantityMicro,
    proof.issuedAt,proof.expiresAt,proof.nonce,proof.keyVersion];
}
export function invocationMacBytes(payload:ProtectedPostingPayload,proof:InvocationProofFields):Buffer{
  return lengthPrefixedUtf8(canonicalInvocationFields(payload,proof));
}
function requireSecretKey(key:Uint8Array):void{
  if(!(key instanceof Uint8Array)||key.byteLength<32)throw new Error('INVOCATION_KEY_UNAVAILABLE');
}
/** Testable pure MAC; key custody is external and must be separately approved. */
export function computeInvocationMac(payload:ProtectedPostingPayload,fields:InvocationProofFields, key:Uint8Array):string{
  requireSecretKey(key);
  return createHmac('sha256',key).update(invocationMacBytes(payload,fields)).digest('hex');
}
/** Test-side verifier only; trusted PostgreSQL pgcrypto verifier is authoritative. */
export function verifyInvocationTestVector(payload:ProtectedPostingPayload,proof:InvocationProof,
  key:Uint8Array,nowSeconds:number):void{
  if(!Number.isSafeInteger(nowSeconds)||nowSeconds<1)throw new Error('INVOCATION_CLOCK_INVALID');
  const {macSha256,...fields}=proof;
  if(!digest.test(macSha256))throw new Error('INVOCATION_MAC_INVALID');
  if(BigInt(fields.issuedAt)>BigInt(nowSeconds)+30n||BigInt(fields.expiresAt)<=BigInt(nowSeconds))
    throw new Error('INVOCATION_EXPIRED_OR_FUTURE');
  const expected=computeInvocationMac(payload,fields,key);
  if(!timingSafeEqual(Buffer.from(macSha256,'hex'),Buffer.from(expected,'hex')))
    throw new Error('INVOCATION_MAC_INVALID');
}
/** Source mapper, not policy approval. Source revision/approval from DB is still checked. */
export function postingPayloadFromCommand(c:StockCommand,scope:Readonly<{
  sourceRevision:number; approvalId:string; approvalRevision:number;
  policyGeneration:number; approvedPayloadSha256:string; inspectionEvidenceId:string;
}>):ProtectedPostingPayload {
  return Object.freeze({contractVersion:'HFT_STOCK_POST_V1',commandId:c.commandId,
    idempotencyKey:c.idempotencyKey,kind:c.kind,legalEntityId:c.legalEntityId,
    siteId:c.siteId,warehouseId:c.warehouseId,itemCode:c.itemCode,
    locationId:c.locationId??'',batchNo:c.batchNo??'',serialNo:c.serialNo??'',
    condition:c.condition??'GOOD',employeeId:c.employeeId??'',
    originalIssueId:c.originalIssueId??'',sourceDocumentId:c.sourceDocumentId,
    sourceActionKey:c.sourceActionKey,fragmentId:c.fragmentId??'',
    quantityMicro:parseQuantity(c.quantity).toString(),sourceRevision:String(scope.sourceRevision),
    approvalId:scope.approvalId,approvalRevision:String(scope.approvalRevision),
    policyGeneration:String(scope.policyGeneration),
    expectedBalanceVersion:String(c.expectedBalanceVersion),
    approvedPayloadSha256:scope.approvedPayloadSha256,
    inspectionEvidenceId:scope.inspectionEvidenceId});
}

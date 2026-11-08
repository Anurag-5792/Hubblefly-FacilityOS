/** Proposed RETURN-specific signed P0 transport, source-only and inactive.
 * The legacy P0 v1 proof cannot authenticate kind RETURN. This fixed-order
 * proof is qualified only by the separately protected PG verifier; it never
 * creates an approval or an operational posting.
 */
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {assertVerifiedRequestOperator,type VerifiedRequestOperator}
 from './verified-request.ts';
import {lengthPrefixedUtf8} from './posting-invocation-proof.ts';
import {OPS_A2_RETURN_REQUEST_FIELDS,validateOpsA2ReturnRequest}
 from '../stores/ops-a2-return-preparation.ts';

export const OPS_A2_RETURN_PROOF_V1='HFT-R1-OPS-A2-RETURN-HMAC-V1';
const nonce=/^[0-9a-f]{48}$/;
const hash=/^[0-9a-f]{64}$/;
export type ReturnProof=Readonly<{
 proofVersion:typeof OPS_A2_RETURN_PROOF_V1;actorSubject:string;sessionId:string;
 payloadSha256:string;issuedAt:string;expiresAt:string;nonce:string;
 keyVersion:string;macSha256:string;
}>;
export function returnPayloadFields(raw:unknown):readonly string[]{
 const req=validateOpsA2ReturnRequest(raw);
 return OPS_A2_RETURN_REQUEST_FIELDS.map(name=>req[name]);
}
export function returnPayloadSha256(raw:unknown):string{
 return createHash('sha256').update(lengthPrefixedUtf8(returnPayloadFields(raw))).digest('hex');
}
export function issueReturnProof(raw:unknown,actor:VerifiedRequestOperator,
 key:Uint8Array,keyVersion:number,now=Math.floor(Date.now()/1000),
 nonceOverride?:string):ReturnProof{
 const req=validateOpsA2ReturnRequest(raw);
 assertVerifiedRequestOperator(actor,req);
 if(!(key instanceof Uint8Array)||key.byteLength<32||
  !Number.isSafeInteger(keyVersion)||keyVersion<1||!Number.isSafeInteger(now)||
  now<1||actor.expiresAt<=now)throw Error('OPS_A2_RETURN_SIGNER_OR_SESSION_INVALID');
 const value=nonceOverride??randomBytes(24).toString('hex');
 if(!nonce.test(value))throw Error('OPS_A2_RETURN_NONCE_INVALID');
 const fields={proofVersion:OPS_A2_RETURN_PROOF_V1 as typeof OPS_A2_RETURN_PROOF_V1,
  actorSubject:actor.subject,sessionId:actor.sessionId,
  payloadSha256:returnPayloadSha256(req),issuedAt:String(now),
  expiresAt:String(Math.min(now+40,actor.expiresAt)),
  nonce:value,keyVersion:String(keyVersion)};
 const macSha256=createHmac('sha256',key).update(lengthPrefixedUtf8([
  fields.proofVersion,fields.actorSubject,fields.sessionId,fields.payloadSha256,
  fields.issuedAt,fields.expiresAt,fields.nonce,fields.keyVersion])).digest('hex');
 return Object.freeze({...fields,macSha256});
}
/** Only for deterministic, synthetic parity tests. Database and source
 * authenticity must be established independently; this does not do so.
 */
export function assertSyntheticReturnProof(raw:unknown,proof:ReturnProof,
 key:Uint8Array,now:number):void{
 const p=proof as unknown as Record<string,unknown>;
 if(Object.keys(p).length!==9||!Object.values(p).every(x=>typeof x==='string')||
  proof.proofVersion!==OPS_A2_RETURN_PROOF_V1||
  proof.payloadSha256!==returnPayloadSha256(raw)||
  !nonce.test(proof.nonce)||!hash.test(proof.macSha256)||
  !/^[1-9][0-9]{0,8}$/.test(proof.keyVersion)||
  !/^[1-9][0-9]{0,18}$/.test(proof.issuedAt)||
  !/^[1-9][0-9]{0,18}$/.test(proof.expiresAt)||
  !Number.isSafeInteger(now)||now<1||
  BigInt(proof.expiresAt)<=BigInt(now)||
  BigInt(proof.issuedAt)>BigInt(now)+30n||
  BigInt(proof.expiresAt)<=BigInt(proof.issuedAt)||
  BigInt(proof.expiresAt)-BigInt(proof.issuedAt)>40n||
  !(key instanceof Uint8Array)||key.byteLength<32)
  throw Error('OPS_A2_RETURN_SYNTHETIC_PROOF_INVALID');
 const expected=createHmac('sha256',key).update(lengthPrefixedUtf8([
  proof.proofVersion,proof.actorSubject,proof.sessionId,proof.payloadSha256,
  proof.issuedAt,proof.expiresAt,proof.nonce,proof.keyVersion])).digest();
 if(!timingSafeEqual(expected,Buffer.from(proof.macSha256,'hex')))
  throw Error('OPS_A2_RETURN_SYNTHETIC_MAC_INVALID');
}

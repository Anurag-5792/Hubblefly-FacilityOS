/** Trusted server-only issuer. The codec alone is not an auth boundary. */
import {randomBytes} from 'node:crypto';
import {assertVerifiedRequestOperator,type VerifiedRequestOperator} from './verified-request.ts';
import {INVOCATION_V1,protectedPayloadSha256,computeInvocationMac,type InvocationProof,
 type InvocationProofFields,type ProtectedPostingPayload} from './posting-invocation-proof.ts';

export function issueServerInvocationProof(payload:ProtectedPostingPayload,
  operator:VerifiedRequestOperator, key:Uint8Array, keyVersion:number,
  nowSeconds=Math.floor(Date.now()/1000)):InvocationProof{
  assertVerifiedRequestOperator(operator,{legalEntityId:payload.legalEntityId,siteId:payload.siteId,warehouseId:payload.warehouseId});
  if(!Number.isSafeInteger(nowSeconds)||nowSeconds<1||
      !Number.isSafeInteger(keyVersion)||keyVersion<1)throw new Error('INVOCATION_ISSUER_CONFIG_INVALID');
  // This is a per-request nonce, never a signing-key generator or store.
  const fields:InvocationProofFields={proofVersion:INVOCATION_V1,
    actorSubject:operator.subject,sessionId:operator.sessionId,
    payloadSha256:protectedPayloadSha256(payload),
    issuedAt:String(nowSeconds),expiresAt:String(nowSeconds+60),
    nonce:randomBytes(24).toString('hex'),keyVersion:String(keyVersion)};
  return Object.freeze({...fields,macSha256:computeInvocationMac(payload,fields,key)});
}

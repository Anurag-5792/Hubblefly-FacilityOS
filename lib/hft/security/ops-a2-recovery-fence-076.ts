/**
 * Directive 076 external recovery admission/release client. SOURCE CANDIDATE.
 * No default coordinator, database connection, signing key or live route.
 * Two signatures are necessary, not sufficient, to qualify the coordinator:
 * its durable release/revocation ordering and every revocation writer must
 * independently pass integration qualification before this can be activated.
 */
import {createHash, randomBytes, verify} from 'node:crypto';
import type {KeyObject} from 'node:crypto';

const DOMAIN='HFT-OPS-A2-RECOVERY-FENCE-076-V1';
const HEX64=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const POSITIVE=/^[1-9][0-9]{0,15}$/;
const SHA1=/^[0-9a-f]{40}$/;
const MAX_LEASE_MS=30000;
const MAX_EVIDENCE_BYTES=1048576;
const scopeKeys=[
 'legalEntityId','siteId','warehouseId','itemCode','productVersion',
 'commandId','originalNonce','originalActor','readerSubject','readerSessionId',
 'approvalId','approvalRevision','originalPayloadSha256','originalProofSha256',
 'actionKind','sourceSha','migrationSha256',
] as const;
export type RecoveryScope076=Readonly<Record<typeof scopeKeys[number],string>>;
const receiptKeys=[
 'contract','phase','coordinatorId','keyId','bootId','leaseId','challenge',
 'scopeSha256','authorizationEvidenceSha256','sequence','admissionSha256',
 'connectionId','issuedAtMs','expiresAtMs','evidenceSha256','snapshotId',
 'backendPid','backendSessionId',
] as const;
export type FenceReceipt076=Readonly<Record<typeof receiptKeys[number],string>>;
export type SignedFence076=Readonly<{payload:FenceReceipt076;signatureHex:string}>;
export type FenceTrust076=Readonly<{
 coordinatorId:string;keyId:string;publicKey:KeyObject;
 sourceSha:string;migrationSha256:string;
}>;
export type RecoveryObservation076=Readonly<{
 bytes:Uint8Array;connectionId:string;snapshotId:string;
 backendPid:number;backendSessionId:string;
 transactionReadOnly:true;isolation:'repeatable read';
 snapshotStartedMonotonicMs:number;
}>;
export interface RecoveryFenceTransport076 {
 // Implementations must use a separately qualified authenticated transport.
 // Caller scope is a request, NEVER proof of entitlement. Authority is checked
 // independently inside the coordinator's serialized admission operation.
 admit(request:Readonly<{scope:RecoveryScope076;challenge:string}>,
  signal:AbortSignal):Promise<unknown>;
 // RELEASE must atomically revalidate all authority/revocation resources,
 // consume the lease and persist this exact evidence digest in its audit log.
 release(request:Readonly<{admission:SignedFence076;challenge:string;
  evidenceSha256:string;connectionId:string;snapshotId:string;
  backendPid:number;backendSessionId:string}>,signal:AbortSignal):Promise<unknown>;
 // Idempotent cancellation. It must never renew or reactivate an expired lease.
 cancel(leaseId:string):Promise<void>;
}
export interface RecoveryReader076 {
 // A new RR READ ONLY snapshot AFTER admission; buffer everything privately.
 // No posting, retries, streaming, shared connection or externally visible log.
 read(scope:RecoveryScope076,admission:SignedFence076,
  signal:AbortSignal):Promise<RecoveryObservation076>;
}
export type RecoveryClock076=Readonly<{
 wallMs:()=>number;monotonicMs:()=>number;
}>;

function fail(code:string):never {throw Error('OPS_A2_076_'+code);}
function record(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))fail('OBJECT_REQUIRED');
 const proto=Object.getPrototypeOf(value);
 if(proto!==Object.prototype&&proto!==null)fail('PLAIN_OBJECT_REQUIRED');
 return value as Record<string,unknown>;
}
function exactStrings(value:unknown,keys:readonly string[]):Record<string,string>{
 const r=record(value);
 if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k)))
  fail('EXACT_FIELDS_REQUIRED');
 const out:Record<string,string>=Object.create(null) as Record<string,string>;
 for(const k of keys){
  const descriptor=Object.getOwnPropertyDescriptor(r,k);
  if(!descriptor||!('value' in descriptor)||typeof descriptor.value!=='string'||
   descriptor.value.length>512||/[\u0000-\u001f\ud800-\udfff]/u.test(descriptor.value))
   fail('CANONICAL_STRING_REQUIRED');
  out[k]=descriptor.value;
 }
 return out;
}
/** Fixed, UTF-8 byte-length-prefixed fields, including field names and domain.
 * The new fence contract is NOT the older jsonb::text scope-HMAC contract.
 */
export function fenceBytes076(fields:Readonly<Record<string,string>>):Buffer{
 const chunks:Buffer[]=[];
 for(const v of [DOMAIN,...Object.keys(fields).sort().flatMap(k=>[k,fields[k]])]){
  if(typeof v!=='string')fail('CANONICAL_STRING_REQUIRED');
  const b=Buffer.from(v,'utf8');const size=Buffer.alloc(4);
  size.writeUInt32BE(b.length);chunks.push(size,b);
 }
 return Buffer.concat(chunks);
}
export function fenceDigest076(bytes:Uint8Array):string{
 return createHash('sha256').update(bytes).digest('hex');
}
export function validateRecoveryScope076(value:unknown):RecoveryScope076{
 const s=exactStrings(value,scopeKeys);
 for(const k of ['legalEntityId','siteId','warehouseId','itemCode','productVersion',
  'commandId','originalActor','readerSubject','readerSessionId','approvalId'])
  if(!ID.test(s[k]))fail('SCOPE_IDENTITY_INVALID');
 if(!/^[0-9a-f]{48}$/.test(s.originalNonce)||!POSITIVE.test(s.approvalRevision)||
  !HEX64.test(s.originalPayloadSha256)||!HEX64.test(s.originalProofSha256)||
  !SHA1.test(s.sourceSha)||!HEX64.test(s.migrationSha256)||
  !['RECEIVE','ISSUE','RETURN','TRANSFER'].includes(s.actionKind))
  fail('SCOPE_BINDING_INVALID');
 return Object.freeze({...s}) as RecoveryScope076;
}
function milliseconds(s:string):number{
 if(!POSITIVE.test(s)||!Number.isSafeInteger(Number(s)))fail('TIME_INVALID');
 return Number(s);
}
export function verifyFenceReceipt076(raw:unknown,trust:FenceTrust076,
 phase:'ADMIT'|'RELEASE',scopeSha256:string,challenge:string,now:number
):SignedFence076{
 const envelope=record(raw);
 if(Object.keys(envelope).length!==2||!Object.hasOwn(envelope,'payload')||
  !Object.hasOwn(envelope,'signatureHex'))fail('ENVELOPE_INVALID');
 const p=exactStrings(envelope.payload,receiptKeys) as FenceReceipt076;
 const signature=envelope.signatureHex;
 if(typeof signature!=='string'||!/^[0-9a-f]{128}$/.test(signature)||
  trust.publicKey.type!=='public'||trust.publicKey.asymmetricKeyType!=='ed25519'||
  !verify(null,fenceBytes076(p),trust.publicKey,Buffer.from(signature,'hex')))
  fail('SIGNATURE_INVALID');
 if(p.contract!==DOMAIN||p.phase!==phase||p.coordinatorId!==trust.coordinatorId||
  p.keyId!==trust.keyId||p.challenge!==challenge||p.scopeSha256!==scopeSha256||
  !HEX64.test(challenge)||!HEX64.test(p.authorizationEvidenceSha256)||
  !ID.test(p.bootId)||!ID.test(p.leaseId)||!ID.test(p.connectionId)||
  !POSITIVE.test(p.sequence))fail('RECEIPT_BINDING_INVALID');
 const start=milliseconds(p.issuedAtMs),end=milliseconds(p.expiresAtMs);
 if(!Number.isSafeInteger(now)||start>now||end<=now||end<=start||
  end-start>MAX_LEASE_MS)fail('ADMISSION_EXPIRED_OR_UNBOUNDED');
 if(phase==='ADMIT'&&(p.admissionSha256!==''||p.evidenceSha256!==''||p.snapshotId!==''||
  p.backendPid!==''||p.backendSessionId!==''))
  fail('ADMISSION_CANNOT_CARRY_RESULT');
 if(phase==='RELEASE'&&(!HEX64.test(p.admissionSha256)||
  !HEX64.test(p.evidenceSha256)||!/^[0-9:,-]{3,256}$/.test(p.snapshotId)||
  !POSITIVE.test(p.backendPid)||!ID.test(p.backendSessionId)))
  fail('RELEASE_EVIDENCE_INVALID');
 return Object.freeze({payload:Object.freeze({...p}),signatureHex:signature});
}
async function bounded<T>(work:()=>Promise<T>,ms:number,controller:AbortController):Promise<T>{
 if(!Number.isFinite(ms)||ms<=0)fail('DEADLINE_EXCEEDED');
 let timer:ReturnType<typeof setTimeout>|undefined;
 const timeout=new Promise<never>((_,reject)=>{
  timer=setTimeout(()=>{controller.abort();reject(Error('OPS_A2_076_DEADLINE_EXCEEDED'));},ms);
 });
 try{return await Promise.race([work(),timeout]);}
 finally{if(timer!==undefined)clearTimeout(timer);}
}

/** SOURCE-ONLY wrapper. Does not activate/replace the existing SQL entrypoint.
 * External coordinator, protected reader credentials, historical issuer policy
 * and no-bypass SQL ACL installation remain separately qualified dependencies.
 */
export async function recoverWithFence076(input:unknown,trust:FenceTrust076,
 coordinator:RecoveryFenceTransport076|null,reader:RecoveryReader076|null,
 clock:RecoveryClock076={wallMs:()=>Date.now(),monotonicMs:()=>performance.now()}
):Promise<Readonly<{status:'SOURCE_ONLY_FENCED_RECOVERY_NOT_OPERATIONAL';
 bytes:Uint8Array;admission:SignedFence076;release:SignedFence076}>>{
 if(!coordinator||!reader)fail('EXTERNAL_COORDINATOR_OR_READER_NOT_QUALIFIED');
 const scope=validateRecoveryScope076(input);
 if(scope.sourceSha!==trust.sourceSha||scope.migrationSha256!==trust.migrationSha256)
  fail('UNAPPROVED_SOURCE_OR_MIGRATION');
 const digest=fenceDigest076(fenceBytes076(scope));
 const challenge=randomBytes(32).toString('hex');
 const start=clock.monotonicMs();const controller=new AbortController();
 let admission:SignedFence076|undefined;let delivered=false;
 let buffered:Buffer|undefined;
 const budget=()=>MAX_LEASE_MS-(clock.monotonicMs()-start);
 try{
  const raw=await bounded(()=>coordinator.admit({scope,challenge},controller.signal),
   budget(),controller);
  admission=verifyFenceReceipt076(raw,trust,'ADMIT',digest,challenge,clock.wallMs());
  const admitted=clock.monotonicMs();
  const observed=Object.freeze({...await bounded(()=>reader.read(scope,admission!,controller.signal),
   Math.min(budget(),Number(admission.payload.expiresAtMs)-clock.wallMs()),controller)});
  if(observed.isolation!=='repeatable read'||observed.transactionReadOnly!==true||
   observed.connectionId!==admission.payload.connectionId||
   !Number.isSafeInteger(observed.backendPid)||observed.backendPid<=0||
   !ID.test(observed.backendSessionId)||!/^[0-9:,-]{3,256}$/.test(observed.snapshotId)||
   !Number.isFinite(observed.snapshotStartedMonotonicMs)||
   observed.snapshotStartedMonotonicMs<admitted||
   observed.snapshotStartedMonotonicMs>clock.monotonicMs()||
   !(observed.bytes instanceof Uint8Array)||observed.bytes.length===0||
   observed.bytes.length>MAX_EVIDENCE_BYTES)fail('READ_SESSION_OR_SNAPSHOT_INVALID');
  buffered=Buffer.from(observed.bytes); // Copy before an untrusted callback can mutate.
  const evidenceSha256=fenceDigest076(buffered);
  const releaseChallenge=randomBytes(32).toString('hex');
  const result=await bounded(()=>coordinator.release({admission:admission!,challenge:releaseChallenge,
   evidenceSha256,connectionId:observed.connectionId,snapshotId:observed.snapshotId,
   backendPid:observed.backendPid,backendSessionId:observed.backendSessionId},controller.signal),
   Math.min(budget(),Number(admission.payload.expiresAtMs)-clock.wallMs()),controller);
  const release=verifyFenceReceipt076(result,trust,'RELEASE',digest,releaseChallenge,clock.wallMs());
  const a=admission.payload,r=release.payload;
  if(r.leaseId!==a.leaseId||r.bootId!==a.bootId||r.connectionId!==a.connectionId||
   r.authorizationEvidenceSha256!==a.authorizationEvidenceSha256||
   r.admissionSha256!==fenceDigest076(fenceBytes076(a))||
   r.evidenceSha256!==evidenceSha256||r.snapshotId!==observed.snapshotId||
   r.backendPid!==String(observed.backendPid)||r.backendSessionId!==observed.backendSessionId||
   BigInt(r.sequence)<=BigInt(a.sequence)||milliseconds(r.expiresAtMs)>milliseconds(a.expiresAtMs)||
   milliseconds(r.issuedAtMs)<milliseconds(a.issuedAtMs)||
   clock.wallMs()>=milliseconds(a.expiresAtMs)||budget()<=0)
   fail('RELEASE_NOT_BOUND_TO_ADMISSION_AND_EVIDENCE');
  delivered=true;
  return Object.freeze({status:'SOURCE_ONLY_FENCED_RECOVERY_NOT_OPERATIONAL' as const,
   bytes:Uint8Array.from(buffered),admission,release});
 }finally{
  controller.abort();buffered?.fill(0);
  if(admission&&!delivered){
   // Failure to acknowledge cancellation never releases buffered evidence.
   const cancelController=new AbortController();
   try{await bounded(()=>coordinator.cancel(admission!.payload.leaseId),1000,cancelController);}
   catch{/* Lease must expire in the external coordinator; no local retry. */}
  }
 }
}

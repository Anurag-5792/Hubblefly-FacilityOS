/** Offline protocol tests. No corporate keys, PG sessions or human approvals. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {fenceBytes076,fenceDigest076,recoverWithFence076,
 validateRecoveryScope076,verifyFenceReceipt076}
 from '../../lib/hft/security/ops-a2-recovery-fence-076.ts';
import type {RecoveryScope076,FenceTrust076,FenceReceipt076,SignedFence076,
 RecoveryFenceTransport076,RecoveryReader076,RecoveryObservation076}
 from '../../lib/hft/security/ops-a2-recovery-fence-076.ts';

// Public RFC 8032 test seed. Never a protected/enrolled corporate key.
const seed='9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const privateKey=createPrivateKey({key:Buffer.from('302e020100300506032b657004220420'+seed,'hex'),
 format:'der',type:'pkcs8'});
const publicKey=createPublicKey(privateKey);
const NOW=1800000000000;
const scope:RecoveryScope076=Object.freeze({legalEntityId:'HFT',siteId:'SITE1',
 warehouseId:'WH1',itemCode:'PART1',productVersion:'V1',commandId:'COMMAND1',
 originalNonce:'a'.repeat(48),originalActor:'ORIGINAL',readerSubject:'REVIEWER',
 readerSessionId:'FRESH-SESSION',approvalId:'APPROVAL1',approvalRevision:'1',
 originalPayloadSha256:'b'.repeat(64),originalProofSha256:'c'.repeat(64),
 actionKind:'ISSUE',sourceSha:'d'.repeat(40),migrationSha256:'e'.repeat(64)});
const trust:FenceTrust076={coordinatorId:'COORD1',keyId:'KEY1',publicKey,
 sourceSha:scope.sourceSha,migrationSha256:scope.migrationSha256};
const clock={wallMs:()=>NOW,monotonicMs:()=>100};
function signed(payload:FenceReceipt076):SignedFence076{
 return {payload,signatureHex:sign(null,fenceBytes076(payload),privateKey).toString('hex')};
}
/** Test-only linearizable reference: synchronous transitions stand for a
 * durable external transaction. NOT a production coordinator implementation.
 */
function rig(){
 let revoked=false,seq=0,reads=0,admissions=0,releases=0,cancels=0;
 const states=new Map<string,'ACTIVE'|'RELEASED'|'CANCELLED'>();
 const coordinator:RecoveryFenceTransport076={
  async admit(request){
   admissions++;
   if(revoked)throw Error('EXTERNAL_REVOKED');
   const leaseId='LEASE'+(++seq);states.set(leaseId,'ACTIVE');
   return signed({contract:'HFT-OPS-A2-RECOVERY-FENCE-076-V1',phase:'ADMIT',
    coordinatorId:'COORD1',keyId:'KEY1',bootId:'BOOT1',leaseId,
    challenge:request.challenge,scopeSha256:fenceDigest076(fenceBytes076(request.scope)),
    authorizationEvidenceSha256:'f'.repeat(64),sequence:String(seq),admissionSha256:'',
    connectionId:'CONNECTION1',issuedAtMs:String(NOW),expiresAtMs:String(NOW+20000),
    evidenceSha256:'',snapshotId:'',backendPid:'',backendSessionId:''});
  },
  async release(request){
   releases++;
   if(revoked||states.get(request.admission.payload.leaseId)!=='ACTIVE')
    throw Error('EXTERNAL_REVOKED_OR_LEASE_CONSUMED');
   states.set(request.admission.payload.leaseId,'RELEASED');
   return signed({...request.admission.payload,phase:'RELEASE',
    sequence:String(++seq),challenge:request.challenge,
    admissionSha256:fenceDigest076(fenceBytes076(request.admission.payload)),
    evidenceSha256:request.evidenceSha256,snapshotId:request.snapshotId,
    backendPid:String(request.backendPid),backendSessionId:request.backendSessionId});
  },
  async cancel(leaseId){cancels++;if(states.get(leaseId)==='ACTIVE')states.set(leaseId,'CANCELLED');},
 };
 const observation:RecoveryObservation076={bytes:Buffer.from('original-immutable-evidence'),
  connectionId:'CONNECTION1',snapshotId:'100:110:105',backendPid:42,
  backendSessionId:'BACKEND-SESSION1',transactionReadOnly:true,
  isolation:'repeatable read',snapshotStartedMonotonicMs:100};
 const reader:RecoveryReader076={async read(){reads++;return observation;}};
 return {coordinator,reader,observation,revoke(){revoked=true;seq++;},
  counts:()=>({reads,admissions,releases,cancels}),states};
}

test('076 valid independent reviewer receives only exact released bytes',async()=>{
 const r=rig();const out=await recoverWithFence076(scope,trust,r.coordinator,r.reader,clock);
 assert.equal(out.status,'SOURCE_ONLY_FENCED_RECOVERY_NOT_OPERATIONAL');
 assert.equal(Buffer.from(out.bytes).toString(),'original-immutable-evidence');
 assert.equal(out.release.payload.evidenceSha256,fenceDigest076(out.bytes));
 assert.deepEqual(r.counts(),{reads:1,admissions:1,releases:1,cancels:0});
});
test('076 original actor with fresh session uses same fenced path',async()=>{
 const r=rig();const out=await recoverWithFence076({...scope,readerSubject:'ORIGINAL'},
  trust,r.coordinator,r.reader,clock);
 assert.equal(out.admission.payload.scopeSha256,
  fenceDigest076(fenceBytes076({...scope,readerSubject:'ORIGINAL'})));
});
test('076 revocation ordered before admission prevents any read',async()=>{
 const r=rig();r.revoke();await assert.rejects(
  recoverWithFence076(scope,trust,r.coordinator,r.reader,clock),/EXTERNAL_REVOKED/);
 assert.equal(r.counts().reads,0);
});
test('076 revocation during buffered read prevents evidence release',async()=>{
 const r=rig();r.reader.read=async()=>{r.revoke();return r.observation;};
 await assert.rejects(recoverWithFence076(scope,trust,r.coordinator,r.reader,clock),/EXTERNAL_REVOKED/);
 assert.equal(r.counts().cancels,1);
 assert.ok([...r.states.values()].every(s=>s==='CANCELLED'));
});
test('076 completed release precedes later revocation but cannot admit a new read',async()=>{
 const r=rig();const out=await recoverWithFence076(scope,trust,r.coordinator,r.reader,clock);
 r.revoke();assert.equal(Buffer.from(out.bytes).toString(),'original-immutable-evidence');
 await assert.rejects(recoverWithFence076(scope,trust,r.coordinator,r.reader,clock),/EXTERNAL_REVOKED/);
 assert.equal(r.counts().reads,1);
});
test('076 concurrent in-flight reads both discard when revocation wins release ordering',async()=>{
 const r=rig();let resume!:()=>void;let entered!:()=>void;
 const barrier=new Promise<void>(resolve=>{resume=resolve;});
 const ready=new Promise<void>(resolve=>{entered=resolve;});let n=0;
 r.reader.read=async()=>{if(++n===2)entered();await barrier;return r.observation;};
 const a=recoverWithFence076(scope,trust,r.coordinator,r.reader,clock);
 const b=recoverWithFence076({...scope,commandId:'COMMAND2'},trust,r.coordinator,r.reader,clock);
 await ready;r.revoke();resume();
 const results=await Promise.allSettled([a,b]);
 assert.ok(results.every(x=>x.status==='rejected'));
 assert.equal(r.counts().cancels,2);
});
test('076 absent external authority fails closed without database calls',async()=>{
 const r=rig();await assert.rejects(recoverWithFence076(scope,trust,null,r.reader,clock),/NOT_QUALIFIED/);
 assert.equal(r.counts().reads,0);
});
test('076 stolen proof, missing entitlement, expired signer qualification denied by authority',async()=>{
 for(const reason of ['STOLEN_PROOF','NO_REVIEWER_ENTITLEMENT','HISTORICAL_SIGNER_NOT_QUALIFIED']){
  const r=rig();r.coordinator.admit=async()=>{throw Error(reason);};
  await assert.rejects(recoverWithFence076(scope,trust,r.coordinator,r.reader,clock),new RegExp(reason));
  assert.equal(r.counts().reads,0);
 }
});
test('076 original session expiry is not reactivation; fresh reader identity is bound',()=>{
 assert.notEqual(fenceDigest076(fenceBytes076(scope)),
  fenceDigest076(fenceBytes076({...scope,readerSessionId:'EXPIRED-SESSION'})));
});
test('076 all exact source identities alter admission digest',()=>{
 const original=fenceDigest076(fenceBytes076(scope));
 for(const key of Object.keys(scope)){
  assert.notEqual(fenceDigest076(fenceBytes076({...scope,[key]:scope[key as keyof RecoveryScope076]+'x'})),original,key);
 }
});
test('076 extra fields, wrong types, malformed nonce and prototype are rejected',()=>{
 for(const invalid of [{...scope,extra:'x'},{...scope,approvalRevision:1},
  {...scope,originalNonce:'a'},{...scope,actionKind:'OPENING'},Object.create(scope)])
  assert.throws(()=>validateRecoveryScope076(invalid));
});
test('076 unsigned payload mutation never reaches database',async()=>{
 const r=rig();const admit=r.coordinator.admit;
 r.coordinator.admit=async(q,s)=>{const a=await admit(q,s) as SignedFence076;
  return {...a,payload:{...a.payload,scopeSha256:'0'.repeat(64)}};};
 await assert.rejects(recoverWithFence076(scope,trust,r.coordinator,r.reader,clock),/SIGNATURE_INVALID/);
 assert.equal(r.counts().reads,0);
});
test('076 cached admission cannot satisfy a fresh request challenge',async()=>{
 const r=rig();const admit=r.coordinator.admit;
 r.coordinator.admit=async(q,s)=>{const a=await admit(q,s) as SignedFence076;
  return signed({...a.payload,challenge:'0'.repeat(64)});};
 await assert.rejects(recoverWithFence076(scope,trust,r.coordinator,r.reader,clock),/RECEIPT_BINDING/);
 assert.equal(r.counts().reads,0);
});
test('076 approved exact source and executable migration mandatory',async()=>{
 const r=rig();for(const changed of [{...scope,sourceSha:'0'.repeat(40)},
  {...scope,migrationSha256:'0'.repeat(64)}])
  await assert.rejects(recoverWithFence076(changed,trust,r.coordinator,r.reader,clock),/UNAPPROVED_SOURCE/);
 assert.equal(r.counts().admissions,0);
});
test('076 wrong backend connection and writable/stale snapshot never release',async()=>{
 for(const change of [{connectionId:'OTHER'}, {transactionReadOnly:false},
  {isolation:'read committed'},{snapshotStartedMonotonicMs:99},
  {backendPid:0},{bytes:Buffer.alloc(0)},{bytes:Buffer.alloc(1048577)}]){
  const r=rig();r.reader.read=async()=>({...r.observation,...change}) as RecoveryObservation076;
  await assert.rejects(recoverWithFence076(scope,trust,r.coordinator,r.reader,clock),/READ_SESSION_OR_SNAPSHOT/);
  assert.equal(r.counts().releases,0);assert.equal(r.counts().cancels,1);
 }
});
test('076 expiry during reconciliation drops buffered bytes',async()=>{
 const r=rig();let now=NOW;r.reader.read=async()=>{now+=20001;return r.observation;};
 await assert.rejects(recoverWithFence076(scope,trust,r.coordinator,r.reader,
  {wallMs:()=>now,monotonicMs:()=>100}),/DEADLINE_EXCEEDED|EXPIRED/);
 assert.equal(r.counts().cancels,1);assert.equal(r.counts().releases,0);
});
test('076 mismatched release hash, boot, lease, authorization or ordering rejected',async()=>{
 for(const change of [{evidenceSha256:'0'.repeat(64)},{bootId:'BOOT2'},
  {leaseId:'OTHER'},{sequence:'1'},{authorizationEvidenceSha256:'0'.repeat(64)},
  {admissionSha256:'0'.repeat(64)},{snapshotId:'110:120:115'},
  {backendPid:'43'},{backendSessionId:'OTHER-BACKEND'},
  {expiresAtMs:String(NOW+25000)}]){
  const r=rig();const release=r.coordinator.release;
  r.coordinator.release=async(q,s)=>{const receipt=await release(q,s) as SignedFence076;
   return signed({...receipt.payload,...change});};
  await assert.rejects(recoverWithFence076(scope,trust,r.coordinator,r.reader,clock),/RELEASE_NOT_BOUND/);
  assert.equal(r.counts().cancels,1);
 }
});
test('076 coordinator outage or unknown outcome cannot cause blind repost/retry',async()=>{
 const r=rig();let calls=0;r.reader.read=async()=>{calls++;throw Error('UNKNOWN_ORIGINAL_COMMIT');};
 await assert.rejects(recoverWithFence076(scope,trust,r.coordinator,r.reader,clock),/UNKNOWN_ORIGINAL_COMMIT/);
 assert.equal(calls,1);assert.equal(r.counts().releases,0);
});
test('076 release timeout failure or cancel failure never returns evidence',async()=>{
 const r=rig();r.coordinator.release=async()=>{throw Error('COORDINATOR_UNAVAILABLE');};
 r.coordinator.cancel=async()=>{throw Error('CANCEL_UNAVAILABLE');};
 await assert.rejects(recoverWithFence076(scope,trust,r.coordinator,r.reader,clock),/COORDINATOR_UNAVAILABLE/);
});
test('076 read buffer is copied before release callback; no mutable result substitution',async()=>{
 const r=rig();const release=r.coordinator.release;
 r.coordinator.release=async(q,s)=>{r.observation.bytes.fill(0);return release(q,s);};
 const out=await recoverWithFence076(scope,trust,r.coordinator,r.reader,clock);
 assert.equal(Buffer.from(out.bytes).toString(),'original-immutable-evidence');
});
test('076 signatures are phase/domain separated and expiry bounded',async()=>{
 const r=rig();const challenge='a'.repeat(64),digest=fenceDigest076(fenceBytes076(scope));
 const a=await r.coordinator.admit({scope,challenge},new AbortController().signal) as SignedFence076;
 assert.throws(()=>verifyFenceReceipt076(a,trust,'RELEASE',digest,challenge,NOW));
 for(const change of [{expiresAtMs:String(NOW+30001)},{issuedAtMs:String(NOW+1)},
  {contract:'WRONG-DOMAIN'},{keyId:'OTHER-KEY'},{coordinatorId:'OTHER-COORD'}])
  assert.throws(()=>verifyFenceReceipt076(signed({...a.payload,...change}),trust,'ADMIT',digest,challenge,NOW));
});

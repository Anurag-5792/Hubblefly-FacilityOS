import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {INTAKE_GATEWAY_BODIES,INTAKE_LOGIN,INTAKE_OWNER,INTAKE_RUNTIME_SIGNATURES,assertIntakeCatalog} from '../../lib/hft/intake/intake-admission.ts';
import {IntakeAccessFence,readIntakeMarker,intakeMarkerKey,hasOtherIntakeMarkers,persistIntakeMarker,clearIntakeMarker,type IntakePending} from '../../lib/hft/intake/intake-client-state.ts';
import {intakeContextMatches,intakeFailure} from '../../lib/hft/intake/intake-request-boundary.ts';
const A='a'.repeat(64),B='b'.repeat(64),req='00000000-0000-4000-8000-000000000088';
const target={database:'hft_inventory_intake_088',oid:'12345'};
function catalog(){
 return {db:target.database,oid:target.oid,login:INTAKE_LOGIN,session_login:INTAKE_LOGIN,restricted:true,memberships:0,
 sibling_access:0,target_connect_only:true,schema_usage:true,schema_create:0,direct_access:0,other_execute:0,
 owner_restricted:true,owner_extra_access:0,functions:[...INTAKE_RUNTIME_SIGNATURES],
 gateways:Object.entries(INTAKE_GATEWAY_BODIES).map(([signature,bodySha256])=>({signature,bodySha256,owner:INTAKE_OWNER,
 definer:true,path:['search_path=pg_catalog, pg_temp'],language:'plpgsql',returns:signature.startsWith('assert_access(')?'void':'jsonb',
 kind:'f',volatility:'v',returnsSet:false,aclOk:true,runtimeExecute:!signature.startsWith('assert_access(')}))};
}
test('catalog pins exact existing gateway source bodies and refuses altered signature, owner, ACL or isolation',()=>{
 const source=readFileSync(new URL('../../db/intake/0002_owner_review_gateway.sql',import.meta.url),'utf8');
 for(const [sig,hash] of Object.entries(INTAKE_GATEWAY_BODIES)){
  const name=sig.split('(')[0],body=source.match(new RegExp('CREATE FUNCTION hft_intake\\.'+name+'\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;'))?.[1];
  assert.ok(body);assert.equal(createHash('sha256').update(body).digest('hex'),hash);
 }
 assert.doesNotThrow(()=>assertIntakeCatalog(catalog(),target));
 const bad=[{sibling_access:1},{target_connect_only:false},{owner_restricted:false},{owner_extra_access:1},{direct_access:1},{other_execute:1},{schema_create:1},
 {functions:['read_page']},{session_login:'wrong'},{memberships:1},{restricted:false}];
 for(const patch of bad)assert.throws(()=>assertIntakeCatalog({...catalog(),...patch},target),/NOT_ADMITTED/);
 for(const patch of [{bodySha256:A},{owner:'legacy_owner'},{path:['search_path=pg_catalog, hft_intake']},{aclOk:false},{definer:false},{signature:'assert_access(text)'},{runtimeExecute:true}]){
  const c=catalog();Object.assign(c.gateways[0],patch);assert.throws(()=>assertIntakeCatalog(c,target),/NOT_ADMITTED/);
 }
 const c=catalog();c.gateways.push(c.gateways[0]);assert.throws(()=>assertIntakeCatalog(c,target),/NOT_ADMITTED/);
});
test('bound READ and every mutation reject stale context; revocation during rename/readback is access loss not rollback',()=>{
 for(const intent of ['READ','RENAME','RECONCILE'] as const){
  assert.equal(intakeContextMatches(intent,A,A),true);
  assert.equal(intakeContextMatches(intent,A,B),false);
  assert.equal(intakeContextMatches(intent,null,A),intent==='READ');
  assert.equal(intakeContextMatches(intent,'',A),false);
  assert.deepEqual(intakeFailure(intent,Error('INTAKE_ACCESS_DENIED')),{status:403,code:'INTAKE_ACCESS_DENIED'});
 }
 assert.deepEqual(intakeFailure('RENAME',Error('INTAKE_RENAME_UNCONFIRMED')),{status:409,code:'INTAKE_CHECK_ORIGINAL_REQUEST'});
 assert.deepEqual(intakeFailure('RENAME',Error('INTAKE_REVISION_CONFLICT')),{status:422,code:'INTAKE_RENAME_REJECTED'});
});
test('lifetime fence rejects in-flight reads, saves and reconciliations after logout, expiry or context transition',()=>{
 const f=new IntakeAccessFence(),initial=f.capture();assert.equal(f.admit(initial,A,100,10),true);
 assert.equal(f.current(initial,11),false);const old=f.capture();
 assert.equal(f.admit(old,B,110,12),false);assert.equal(f.current(old,99),true);assert.equal(f.current(old,100),false);
 f.invalidate();assert.equal(f.current(old,12),false);assert.equal(f.admit(old,A,120,12),false);
 const next=f.capture();assert.equal(f.admit(next,B,120,12),true);
 assert.equal(f.current(old,13),false);const b=f.capture();f.invalidate();
 assert.equal(f.admit(b,B,200,13),false);assert.equal(f.current(b,13),false);
 const relogin=f.capture();assert.equal(f.admit(relogin,A,300,15),true);assert.equal(f.current(old,15),false);
});
function memory(){
 const m=new Map<string,string>(),reads:string[]=[];
 const store={get length(){return m.size;},key:(i:number)=>[...m.keys()][i]??null,getItem:(k:string)=>{reads.push(k);return m.get(k)??null;},setItem:(k:string,v:string)=>{m.set(k,v);},removeItem:(k:string)=>{m.delete(k);}};
 return {store,m,reads};
}
test('original owner pending evidence remains under revocation, re-login, legacy and binding transition',()=>{
 const {store,m,reads}=memory();const p:IntakePending={contextId:A,requestId:req,itemId:'OP-12',expectedRevision:1};
 persistIntakeMarker(store,p);const original=m.get(intakeMarkerKey(A));
 const f=new IntakeAccessFence();assert.equal(f.admit(f.capture(),A,100,10),true);const inFlight=f.capture();f.invalidate();
 assert.equal(f.current(inFlight,11),false);assert.equal(m.get(intakeMarkerKey(A)),original);
 reads.length=0;assert.equal(readIntakeMarker(store,B),null);assert.equal(hasOtherIntakeMarkers(store,B),true);
 assert.ok(!reads.includes(intakeMarkerKey(A)));assert.throws(()=>persistIntakeMarker(store,{...p,contextId:B}),/UNRESOLVED_MARKER/);
 assert.equal(m.get(intakeMarkerKey(A)),original);assert.deepEqual(readIntakeMarker(store,A),p);
 assert.throws(()=>clearIntakeMarker(store,{...p,expectedRevision:2}),/MARKER_CHANGED/);
 assert.equal(m.get(intakeMarkerKey(A)),original);clearIntakeMarker(store,p);assert.equal(readIntakeMarker(store,A),null);
 m.set('hft.intake.pending.v1.'+A,'legacy-private');reads.length=0;assert.equal(hasOtherIntakeMarkers(store,A),true);
 assert.equal(readIntakeMarker(store,A),null);assert.ok(!reads.some(k=>k.includes('.v1.')));assert.equal(m.get('hft.intake.pending.v1.'+A),'legacy-private');
});

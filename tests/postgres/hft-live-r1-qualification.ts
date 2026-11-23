/** Actual restricted PostgreSQL qualification. Never runs in CI without explicit target authority.
 * Phase before and after must execute on two separately qualified source releases
 * against the SAME dedicated production-like fixture database. No real company stock.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {assertLiveProfile} from '../../lib/hft/live/live-profile.ts';
import {openLivePool,admitLiveConnection} from '../../lib/hft/live/live-service.ts';
import {LIVE_R1_VERSION} from '../../lib/hft/live/live-contract.ts';
import {POST} from '../../app/api/hft/live-masters/route.ts';
const status=['restricted-connection','employee-create-v1','fresh-readback','immutable-audit',
 'denied-cross-scope','soft-delete-contract','post-upgrade-edit-v2','history-v1-v2'] as const;
function secure(path:string|undefined):string{
 assert.ok(path&&isAbsolute(path),'QUALIFICATION_SECURE_FILE_REQUIRED');
 const s=lstatSync(path);assert.ok(s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o077)===0);
 return readFileSync(path,'utf8').trim();
}
async function main(){
 if(process.argv.includes('--describe')){
  console.log(JSON.stringify({mode:'REAL_POSTGRESQL',phase:['before','after'],
   cases:status,requires:'approved production-like target, genuine pre-enrolled corporate test identity and secure session cookie',
   executed:false},null,2));return;
 }
 const phase=process.argv.find(x=>x.startsWith('--phase='))?.split('=')[1];
 assert.ok(phase==='before'||phase==='after','EXPLICIT_PHASE_REQUIRED');
 assert.equal(process.env.HFT_ENVIRONMENT,'production-qualification','PRODUCTION_DB_TEST_FORBIDDEN');
 assertLiveProfile(process.env);
 const consent=secure(process.env.HFT_LIVE_R1_QUAL_AUTHORITY_FILE);
 assert.equal(consent,process.env.HFT_LIVE_R1_TARGET_ADMISSION_SHA256,'QUALIFICATION_AUTHORITY_MISMATCH');
 const cookie=secure(process.env.HFT_LIVE_R1_SESSION_COOKIE_FILE);
 assert.ok(cookie.startsWith('__Host-hft_session=')&&!cookie.includes('\n'));
 const scope={legalEntityId:process.env.HFT_LIVE_R1_QUAL_ENTITY!,
  siteId:process.env.HFT_LIVE_R1_QUAL_SITE!,
  warehouseId:process.env.HFT_LIVE_R1_QUAL_WAREHOUSE!};
 const recordId=process.env.HFT_LIVE_R1_QUAL_EMPLOYEE_ID!;
 assert.ok(recordId.startsWith('R1Q-')&&Object.values(scope).every(Boolean));
 const env=process.env,passed:string[]=[];
 const query=async(payload:unknown)=>{
  const request=new Request(env.HFT_PUBLIC_ORIGIN!+'/api/hft/live-masters',{
   method:'POST',headers:{origin:env.HFT_PUBLIC_ORIGIN!,'sec-fetch-site':'same-origin',
    'content-type':'application/json',cookie},body:JSON.stringify(payload)});
  const result=await POST(request),json=await result.json();
  assert.equal(result.status,200,JSON.stringify({status:result.status,code:json.code}));
  assert.equal(json.state,'AUTHORITATIVE_RESULT');return json.data;
 };
 const pool=openLivePool(env);
 try{
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   await admitLiveConnection(c,env);
   const acl=await c.query<{table_dml:boolean;column_dml:boolean}>(
    `SELECT has_table_privilege(current_user,'hft_live_r1.master_record','INSERT,UPDATE,DELETE') AS table_dml,
      EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='hft_live_r1.master_record'::regclass
        AND attnum>0 AND NOT attisdropped AND has_column_privilege(current_user,attrelid,attnum,'INSERT,UPDATE')) AS column_dml`);
   assert.deepEqual(acl.rows[0],{table_dml:false,column_dml:false});
   await c.query('COMMIT');passed.push('restricted-connection');
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  const base={contractVersion:LIVE_R1_VERSION,kind:'EMPLOYEE',scope};
  const get=()=>query({...base,intent:'GET',recordId,search:''});
  const history=()=>query({...base,intent:'HISTORY',recordId,search:''});
  if(phase==='before'){
   const first=await query({...base,intent:'SAVE',action:'CREATE',recordId,
    expectedRevision:0,requestId:randomUUID(),reason:'Approved isolated R1 acceptance fixture',
    values:{fullName:'R1 Qualification Employee',department:'QA',designation:'Test'}});
   assert.equal(first.state,'SAVED_VERIFIED');assert.equal(first.record.revision,1);
   passed.push('employee-create-v1');
   const reread=await get();assert.equal(reread.revision,1);assert.equal(reread.deleted,false);
   passed.push('fresh-readback');
   const audit=await history();assert.equal(audit[0]?.revision,1);
   assert.equal(audit[0]?.action,'CREATE');passed.push('immutable-audit');
   const negative=await POST(new Request(env.HFT_PUBLIC_ORIGIN!+'/api/hft/live-masters',{
    method:'POST',headers:{origin:env.HFT_PUBLIC_ORIGIN!,'sec-fetch-site':'same-origin',
     'content-type':'application/json',cookie},
    body:JSON.stringify({...base,intent:'GET',recordId,search:'',
     scope:{...scope,warehouseId:'R1Q-OTHER-WH'}})}));
   assert.equal(negative.status,403);passed.push('denied-cross-scope');
   const marker={recordId,revision:1,scope,source:env.HFT_LIVE_R1_RELEASE_SHA256};
   assert.ok(process.env.HFT_LIVE_R1_QUAL_RESULT_FILE);
   writeFileSync(process.env.HFT_LIVE_R1_QUAL_RESULT_FILE!,JSON.stringify(marker),
    {mode:0o600,flag:'wx'});
  }else{
   const marker=JSON.parse(secure(process.env.HFT_LIVE_R1_QUAL_RESULT_FILE)) as
    {recordId:string;revision:number;scope:typeof scope;source:string};
   assert.equal(marker.recordId,recordId);assert.deepEqual(marker.scope,scope);
   assert.ok(marker.source!==env.HFT_LIVE_R1_RELEASE_SHA256,
    'UPGRADE_MUST_USE_NEW_RELEASE_ADMISSION');
   assert.equal((await get()).revision,1);passed.push('fresh-readback');
   const saved=await query({...base,intent:'SAVE',action:'UPDATE',recordId,expectedRevision:1,
    requestId:randomUUID(),reason:'Verified after application upgrade',
    values:{fullName:'R1 Qualification Employee',department:'QA',designation:'Updated'}});
   assert.equal(saved.state,'SAVED_VERIFIED');assert.equal(saved.record.revision,2);
   passed.push('post-upgrade-edit-v2');
   assert.equal((await get()).revision,2);
   const events=await history();assert.deepEqual(events.slice(0,2).map((e:{revision:number})=>e.revision),[2,1]);
   passed.push('history-v1-v2');
  }
  console.log(JSON.stringify({status:'PASS',phase,source:env.HFT_LIVE_R1_RELEASE_SHA256,
   databaseOid:env.HFT_LIVE_R1_DATABASE_OID,passed,originalStockOperations:false}));
 }finally{await pool.end();}
}
main().catch(e=>{console.error('LIVE_R1_REAL_PG_QUALIFICATION_FAILED',e instanceof Error?e.message:'UNKNOWN');process.exitCode=1;});

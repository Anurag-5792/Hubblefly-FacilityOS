/** Draft 077 isolated source integration. Synthetic identity and Pg client only.
 * No live Neon, no real users, no protected SQL execution.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rootCertificates} from 'node:tls';
import {generateKeyPairSync} from 'node:crypto';
import {identityEnv,signedToken} from '../support/signed-session-fixture.ts';
import {resolveVerifiedRequestOperator}
 from '../../lib/hft/security/verified-request.ts';
import {assertDraftProfile,DRAFT_PROFILE,draftPgOptions}
 from '../../lib/hft/draft/draft-profile.ts';
import {DRAFT_CONTRACT,DRAFT_STATE,DRAFT_KINDS,
 validateDraftSave,validateDraftRead}
 from '../../lib/hft/draft/draft-contract.ts';
import {readDrafts,saveDraft,DRAFT_IDENTITY_SQL,
 type DraftPgPool,type DraftPgClient}
 from '../../lib/hft/draft/draft-service.ts';
import {blankP3Xlsx,previewP3ImportXlsx,sampleP3Xlsx}
 from '../../lib/hft/masters/p3-xlsx-transfer.ts';
import {importHeaders,previewP3ImportCsv,fieldGuide}
 from '../../lib/hft/masters/p3-csv-transfer.ts';
import {oidcConfig,encodeFlow,decodeFlow,startUrl}
 from '../../lib/hft/draft/draft-oidc.ts';
const origin='https://facilityos-draft.example.org';
const env={...identityEnv,NODE_ENV:'production',
 HFT_ENVIRONMENT:'retained-draft-nonproduction',HFT_LIVE_POSTING_ENABLED:'false',
 HFT_DRAFT_RUNTIME_PROFILE:DRAFT_PROFILE,
 HFT_DRAFT_DATABASE:'hft_r1_retained_masters_np077',
 HFT_DRAFT_DB_PROJECT:'wandering-cake-50222227',
 HFT_DRAFT_DB_BRANCH:'br-shiny-night-b3qgsj8t',
 HFT_DRAFT_DB_VERSION:'180007',
 HFT_DRAFT_DB_HOST:'ep-hidden-fire-b324s21q.c-4.ap-southeast-1.aws.neon.tech',
 HFT_DRAFT_APPROVED_HOST:'ep-hidden-fire-b324s21q.c-4.ap-southeast-1.aws.neon.tech',
 HFT_DRAFT_DB_PORT:'5432',HFT_DRAFT_DB_USER:'hft_draft077_api_login',
 HFT_DRAFT_DB_PASSWORD:'SYNTHETIC_TEST_NEVER_REAL_0001',
 HFT_DRAFT_APPROVED_SCHEMA_SHA256:'b'.repeat(64),
 HFT_DRAFT_INDEPENDENT_ADMISSION_SHA256:'a'.repeat(64),
 HFT_DRAFT_ENROLLED_SCOPE_ID:'11111111-1111-4111-8111-111111111111',
 HFT_DRAFT_SCOPE_LEGAL_ENTITY:'HFT',HFT_DRAFT_SCOPE_SITE:'SITE1',
 HFT_DRAFT_SCOPE_WAREHOUSE:'WH1',
 HFT_DRAFT_HMAC_KEY_VERSION:'1',
 HFT_DRAFT_HMAC_KEY_BASE64:Buffer.alloc(32,18).toString('base64'),
 HFT_DRAFT_TLS_CA_PEM:rootCertificates[0],HFT_PUBLIC_ORIGIN:origin};
function actor(){
 return resolveVerifiedRequestOperator(new Request(origin+'/api/hft/draft',{
  method:'POST',headers:{origin,'sec-fetch-site':'same-origin',
   cookie:'__Host-hft_session='+signedToken()}}),env,'DRAFT_MASTERS');
}
const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
const values:Record<string,Record<string,string>>={
 LEGAL_ENTITY:{legalName:'Synthetic Legal Entity'},
 SITE:{siteName:'Synthetic Site'},
 EMPLOYEE:{fullName:'Synthetic Person',department:'Stores',
  designation:'Operator',siteId:'SITE1'},
 ITEM:{uom:'PCS',controlType:'NONE'},
 SUPPLIER:{legalName:'Synthetic Supplier'},
 WAREHOUSE:{name:'Synthetic Warehouse',siteId:'SITE1'},
 LOCATION:{parentLocationId:''}};
const idByKind:Record<string,string>={
 LEGAL_ENTITY:'HFT',SITE:'SITE1',EMPLOYEE:'EMP01',ITEM:'ITEM01',
 SUPPLIER:'SUP01',WAREHOUSE:'WH01',LOCATION:'BIN01'};
const writeId='11111111-1111-4111-8111-111111111111';
function command(kind:keyof typeof values,op:'CREATE'|'EDIT'='CREATE',rev='0'){
 return validateDraftSave({
  contractVersion:DRAFT_CONTRACT,intent:'SAVE',operation:op,kind,...scope,
  recordId:idByKind[kind],expectedRevision:rev,writeId,source:'MANUAL',
  reason:'Real employee approved user entry is required, synthetic test here',
  values:values[kind]});
}
type Mode='standard'|'uncertain'|'missingReadback';
function pg(mode:Mode='standard'){
 const records=new Map<string,Record<string,unknown>>();
 const sqls:string[]=[],destroyed:boolean[]=[];
 let connections=0;
 const pool:DraftPgPool={
  async connect(){
   connections++;
   const connection=connections;
   const client:DraftPgClient={
    async query<Row extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]){
     sqls.push(sql);
     let rows:Record<string,unknown>[]=[];
     if(sql===DRAFT_IDENTITY_SQL)rows=[{
      db:env.HFT_DRAFT_DATABASE,login:env.HFT_DRAFT_DB_USER,
      role:env.HFT_DRAFT_DB_USER,version:180007,replica:false,
      tls:true,tls_version:'TLSv1.3',schema_usage:true,schema_create:false,
      can_save:true,can_read:true,secured_function_count:2,
      extra_draft_function_grants:0,direct_relation_grants:0,
      operational_function_grants:0,restricted_login_count:1,
      privileged_memberships:0}];
     if(sql==='SELECT hft_draft077.save_draft_v1($1::text,$2::jsonb) AS evidence'){
      const cmd=JSON.parse(String(params[0])) as {
       scopeId:string;kind:string;recordKey:string;expectedVersion:string;
       requestId:string;values:Record<string,string>;source:string};
      const existing=records.get(cmd.recordKey);
      const old=Number(existing?.revision||0);
      if(old!==Number(cmd.expectedVersion))
       throw Error('DRAFT077_REVISION_CONFLICT');
      const record={recordId:'99999999-9999-4999-8999-999999999999',
       record_key:cmd.recordKey,kind:cmd.kind,revision:old+1,
       state:DRAFT_STATE,values:cmd.values,created_by:'STORE1',
       edited_by:'STORE1',created_at:'2026-11-16T00:00:00Z',
       updated_at:'2026-11-16T00:00:00Z',scopeProvisional:true,
       source_type:cmd.source};
      records.set(cmd.recordKey,record);
      rows=[{evidence:{state:DRAFT_STATE,scopeId:cmd.scopeId,
       recordKey:cmd.recordKey,requestId:cmd.requestId,revision:old+1}}];
     }
     if(sql==='SELECT hft_draft077.read_drafts_v1($1::text,$2::jsonb) AS evidence'){
      const q=JSON.parse(String(params[0])) as {
       scopeId:string;kind:string;intent:string;recordKey:string;
       search:string;offset:string;limit:string};
      const values=mode==='missingReadback'?[]:
       [...records.values()].filter(r=>r.kind===q.kind&&
       (q.intent!=='GET'||r.record_id===q.recordKey)&&
       (q.intent!=='LIST'||String(r.record_id).includes(q.search)));
      rows=[{evidence:{state:'DRAFT_ONLY',scopeId:q.scopeId,actor:'STORE1',
       scopeProvisional:true,offset:Number(q.offset),limit:Number(q.limit),
       records:values.slice(Number(q.offset),Number(q.offset)+Number(q.limit))}}];
     }
     if(sql==='COMMIT'&&mode==='uncertain'&&connection===1)
      throw Error('SIMULATED_LOST_COMMIT_RESPONSE');
     return {rows:rows as unknown as Row[]};
    },release(destroy?:boolean){destroyed.push(destroy===true);}
   };return client;
  },async end(){}
 };
 return {pool,sqls,destroyed,connections:()=>connections};
}
test('draft runtime is isolated from P3 and pins real project, branch and TLS',()=>{
 assert.doesNotThrow(()=>assertDraftProfile(env));
 const options=draftPgOptions(env);
 assert.equal(options.database,env.HFT_DRAFT_DATABASE);
 assert.equal(options.user,env.HFT_DRAFT_DB_USER);
 assert.equal((options.ssl as Record<string,unknown>).rejectUnauthorized,true);
 for(const bad of [{HFT_LIVE_POSTING_ENABLED:'true'},
  {HFT_DRAFT_DB_VERSION:'180006'}, {NODE_ENV:'development'},
  {PGUSER:'hft_engineering'}, {HFT_DRAFT_TLS_CA_PEM:'INVALID'},
  {HFT_DRAFT_DB_USER:'hft_r1_p3_master_owner'},
  {HFT_DRAFT_DB_PROJECT:'wrong-project'}]){
  assert.throws(()=>assertDraftProfile({...env,...bad}));
 }
});
test('all seven strict drafts are provisional and never accept active/approved fields',()=>{
 assert.equal(DRAFT_KINDS.length,7);
 for(const kind of DRAFT_KINDS){
  const cmd=command(kind);
  assert.equal(cmd.kind,kind);
  assert.equal(cmd.expectedRevision,'0');
  assert.equal(cmd.values===values[kind],false);
  assert.throws(()=>validateDraftSave({...cmd,approved:true}),
   /EXACT_FIELDS_REQUIRED/);
  assert.throws(()=>validateDraftSave({...cmd,values:{...cmd.values,active:true}}),
   /EXACT_FIELDS_REQUIRED/);
 }
});
test('SQL client saves and independently rereads a committed draft revision',async()=>{
 const db=pg(),user=actor();
 const first=await saveDraft(db.pool,env,user,command('EMPLOYEE'));
 assert.equal(first.state,DRAFT_STATE);assert.equal(first.revision,1);
 assert.equal(db.connections(),2);
 const edit=await saveDraft(db.pool,env,user,command('EMPLOYEE','EDIT','1'));
 assert.equal(edit.revision,2);
 const read=await readDrafts(db.pool,env,user,validateDraftRead({
  contractVersion:DRAFT_CONTRACT,intent:'READ',kind:'EMPLOYEE',...scope,search:''}));
 assert.equal(read[0].revision,2);
 assert.equal(db.sqls.filter(s=>s==='SELECT hft_draft077.save_draft_v1($1::text,$2::jsonb) AS evidence').length,2);
 assert.equal(db.sqls.filter(s=>s==='SELECT hft_draft077.read_drafts_v1($1::text,$2::jsonb) AS evidence').length,3);
 assert.equal(db.sqls.some(s=>/INSERT INTO hft\.|post_stock_command/.test(s)),false);
});
test('stale concurrent edit fails without changing retained draft revision',async()=>{
 const db=pg(),user=actor();
 await saveDraft(db.pool,env,user,command('SUPPLIER'));
 await assert.rejects(saveDraft(db.pool,env,user,command('SUPPLIER','EDIT','2')),
  /REVISION_CONFLICT/);
 const rows=await readDrafts(db.pool,env,user,validateDraftRead({
  contractVersion:DRAFT_CONTRACT,intent:'READ',kind:'SUPPLIER',...scope,search:''}));
 assert.equal(rows[0].revision,1);
});
test('unknown COMMIT freezes original write id and does not automatically repost',async()=>{
 const db=pg('uncertain');
 await assert.rejects(saveDraft(db.pool,env,actor(),command('ITEM')),
  /COMMIT_OUTCOME_UNCERTAIN_NO_RETRY/);
 assert.equal(db.sqls.filter(s=>s==='SELECT hft_draft077.save_draft_v1($1::text,$2::jsonb) AS evidence').length,1);
 assert.ok(db.destroyed[0]);
});
test('missing fresh committed readback requires reconciliation, never repost',async()=>{
 const db=pg('missingReadback');
 await assert.rejects(saveDraft(db.pool,env,actor(),command('ITEM')),
  /COMMITTED_READBACK_REQUIRED_NO_RETRY/);
 assert.equal(db.sqls.filter(s=>s==='SELECT hft_draft077.save_draft_v1($1::text,$2::jsonb) AS evidence').length,1);
});
test('forged actor and cross-warehouse scope denied before PostgreSQL access',async()=>{
 const db=pg(),user=actor();
 await assert.rejects(saveDraft(db.pool,env,{...user},command('EMPLOYEE')),
  /VERIFIED_REQUEST_IDENTITY_REQUIRED/);
 await assert.rejects(saveDraft(db.pool,env,user,
  validateDraftSave({...command('EMPLOYEE'),warehouseId:'WH2'})),
  /SIGNED_SCOPE_DENIED/);
 assert.equal(db.connections(),0);
});
test('seven-kind CSV/XLSX imports use existing validation and fictional samples are rejected',async()=>{
 for(const kind of DRAFT_KINDS){
  assert.ok(importHeaders(kind).length>=5);
  assert.ok(fieldGuide(kind).some(g=>g.marker==='TEMP'));
  const synthetic:Record<string,string>={
   ...scope,legalName:'Synthetic Company',siteName:'Synthetic Site',
   employeeId:'EMP01',fullName:'Synthetic Person',department:'Stores',
   designation:'Operator',itemCode:'ITEM01',uom:'PCS',controlType:'NONE',
   supplierId:'SUP01',name:'Synthetic Warehouse',locationId:'BIN01',
   parentLocationId:'',reason:'Synthetic data never imported as real'};
  const csv=importHeaders(kind).join(',')+'\r\n'+
   importHeaders(kind).map(f=>synthetic[f]??'').join(',')+'\r\n';
  const a=previewP3ImportCsv(csv,kind,scope);
  const x=await previewP3ImportXlsx(
   blankP3Xlsx(kind,[importHeaders(kind).map(f=>synthetic[f]??'')]),kind,scope);
  assert.deepEqual(x,a);
  assert.equal(x.validRows.length,1);
  const fake=await previewP3ImportXlsx(sampleP3Xlsx(kind),kind,scope);
  assert.equal(fake.validRows.length,0);
  assert.ok(fake.issues.length>0);
 }
});
test('OIDC session keys and PKCE state are generated from test-only managed credentials',()=>{
 const keys=generateKeyPairSync('ed25519');
 const env2={...env,
  HFT_SESSION_ED25519_PUBLIC_KEY_PEM:keys.publicKey.export({type:'spki',format:'pem'}).toString(),
  HFT_DRAFT_SESSION_ED25519_PRIVATE_KEY_PEM:keys.privateKey.export({type:'pkcs8',format:'pem'}).toString(),
  HFT_DRAFT_OIDC_ISSUER:'https://accounts.example.org',
  HFT_DRAFT_OIDC_AUTHORIZE_URL:'https://accounts.example.org/authorize',
  HFT_DRAFT_OIDC_TOKEN_URL:'https://accounts.example.org/token',
  HFT_DRAFT_OIDC_JWKS_URL:'https://accounts.example.org/jwks',
  HFT_DRAFT_OIDC_CLIENT_ID:'synthetic-client',
  HFT_DRAFT_OIDC_CLIENT_SECRET:'SYNTHETIC_NEVER_REAL_00001',
  HFT_DRAFT_OIDC_STATE_KEY_BASE64:Buffer.alloc(32,5).toString('base64'),
  HFT_DRAFT_OIDC_APPROVED_ACTORS_JSON:JSON.stringify({
   'synthetic@example.org':{subject:'STORE1',...scope,warehouseIds:['WH1']}
  })};
 const config=oidcConfig(env2);
 const started=startUrl(config,origin);
 assert.match(started.location,/code_challenge_method=S256/);
 const state={state:'teststate',nonce:'testnonce',verifier:'testverifier',issuedAt:Date.now()};
 const ticket=encodeFlow(state,config.stateKey);
 assert.deepEqual(decodeFlow(ticket,config.stateKey),state);
 assert.throws(()=>decodeFlow(ticket,Buffer.alloc(32,4)));
});

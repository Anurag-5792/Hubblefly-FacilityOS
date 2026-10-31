/** Synthetic DB client protocol tests; not live Neon evidence. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discover,previewConfig,inspectReadOnly}
 from '../../tools/hft_neon_staging_discovery.mjs';
const env={VERCEL_ENV:'preview',
 VERCEL_GIT_COMMIT_REF:'engineering/hft-r1-stores-foundation',
 HFT_STAGING_PGHOST:'ep-test-01.ap-southeast-1.aws.neon.tech',
 HFT_STAGING_PGDATABASE:'neondb',HFT_STAGING_PGUSER:'neondb_owner',
 HFT_STAGING_PGPASSWORD:'SYNTHETIC_NOT_REAL_PASSWORD',
 HFT_STAGING_NEON_PROJECT_ID:'synthetic_project'};
function fake(variant='OK'){
 const executed:string[]=[],released:boolean[]=[];
 let ended=false;
 const pool={async connect(){
  return {connection:{stream:{encrypted:variant!=='NO_TLS',
    authorized:variant!=='NO_TLS',
    getPeerCertificate:()=>({subject:{CN:'synthetic-neon.test'}})}},
   async query(sql:string){
   executed.push(sql);
   if(sql==='BEGIN READ ONLY')return {rows:[]};
   if(sql==='ROLLBACK')return {rows:[]};
   if(sql.includes('current_database()'))return {rows:[{
    db:variant==='WRONG_DB'?'other':'neondb',login:'neondb_owner',
    ver:170000,readonly:'on'}]};
   if(sql.includes('pg_stat_ssl'))return {rows:[{
    ssl:variant!=='NO_TLS'&&variant!=='NO_BACKEND_TLS',version:'TLSv1.3',cipher:'TLS_AES'}]};
   if(sql.includes('rolsuper'))return {rows:[{
    rolsuper:false,rolcreatedb:true,rolcreaterole:false,rolbypassrls:false}]};
   if(sql.includes('to_regclass'))return {rows:[{
    revision:false,ledger:false,writer:false}]};
   throw Error('UNEXPECTED_SQL');
  },release(){released.push(true)}};
 },async end(){ended=true}};
 return {pool,executed,released,ended:()=>ended};
}
test('non-target Preview is skipped without database access',async()=>{
 let opened=0;
 const r=await discover({...env,VERCEL_ENV:'production'},async()=>{opened++;return fake().pool});
 assert.equal(r.skipped,'NOT_TARGET_PREVIEW');assert.equal(opened,0);
});
test('Preview staging requires Neon host and full HFT-prefixed config',()=>{
 for(const e of [{HFT_STAGING_PGHOST:'localhost'},
  {HFT_STAGING_PGHOST:'evil.example.org'},
  {HFT_STAGING_PGUSER:''},{HFT_STAGING_PGPASSWORD:''},
  {HFT_STAGING_NEON_PROJECT_ID:''}]){
  assert.throws(()=>previewConfig({...env,...e}));
 }
});
test('read-only discovery verifies TLS identity and returns redacted classification',async()=>{
 const v=fake();
 const out=await discover(env,async options=>{
  const ssl=options.ssl as Record<string,unknown>;
  assert.equal(ssl.rejectUnauthorized,true);
  assert.equal(ssl.servername,env.HFT_STAGING_PGHOST);
  return v.pool;
 });
 assert.equal(out.connected,true);assert.equal(out.tlsVerified,true);
 assert.equal(out.pgMajor,17);assert.equal(out.ownerLike,true);
 assert.equal(out.schemaPresent,false);
 assert.equal(out.stockPosting,'NOT_RUN');
 assert.ok(v.executed[0]==='BEGIN READ ONLY');
 assert.equal(v.executed.at(-1),'ROLLBACK');
 assert.equal(v.ended(),true);assert.equal(v.released.length,1);
 assert.ok(v.executed.every(q=>/^(BEGIN READ ONLY|ROLLBACK|SELECT )/.test(q)));
 assert.ok(!JSON.stringify(out).includes(env.HFT_STAGING_PGPASSWORD));
});
test('a verified client socket permits pooler backend TLS to be unobservable',async()=>{
 const v=fake('NO_BACKEND_TLS');
 const out=await inspectReadOnly(v.pool,previewConfig(env)!);
 assert.equal(out.tlsVerified,true);
 assert.equal(out.backendTlsVisible,false);
});
test('TLS failure denies qualification and rolls back',async()=>{
 const v=fake('NO_TLS');
 await assert.rejects(inspectReadOnly(v.pool,previewConfig(env)!));
 assert.ok(v.executed.includes('ROLLBACK'));assert.equal(v.ended(),true);
});
test('mismatched target database denies qualification and rolls back',async()=>{
 const v=fake('WRONG_DB');
 await assert.rejects(inspectReadOnly(v.pool,previewConfig(env)!));
 assert.ok(v.executed.includes('ROLLBACK'));
});


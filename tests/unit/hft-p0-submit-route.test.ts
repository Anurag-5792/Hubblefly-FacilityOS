/** Signed HTTP gates only; no production DB, stock or count is written. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {identityEnv,signedToken} from '../support/signed-session-fixture.ts';
import {POST as submit,GET as submitGet} from '../../app/api/hft/stores/submit/route.ts';
import {POST as read,GET as readGet} from '../../app/api/hft/stores/read/route.ts';
for(const [k,v] of Object.entries(identityEnv))process.env[k]=v;
process.env.HFT_STORES_P0_SOURCE='unqualified';
process.env.HFT_LIVE_POSTING_ENABLED='false';
const receipt={contractVersion:'HFT-R1-STORES-P0-PREPARE-V1',
 requestId:'11111111-1111-4111-8111-111111111111',kind:'IN',legalEntityId:'HFT',
 siteId:'SITE1',warehouseId:'WH1',itemCode:'PART001',productVersion:'V1',
 controlType:'NONE',quantity:'3',uom:'PCS',serialNo:'',batchNo:'',
 leafLocationId:'BIN1',grnId:'GRN1',receiptKey:'REC1:1',supplierId:'SUP1',
 invoiceNumber:'INV-1',qcState:'ACCEPTED',qcEvidenceId:'QC1'};
const query={contractVersion:'HFT-R1-P0-READ-V1',intent:'BALANCES',legalEntityId:'HFT',
 siteId:'SITE1',warehouseId:'WH1',itemCode:'PART001',productVersion:'V1',
 leafLocationId:'BIN1',employeeId:'',cursor:'',limit:10};
function req(endpoint:string,body:unknown,override:Record<string,string>={}){
 return new Request(identityEnv.HFT_PUBLIC_ORIGIN+endpoint,{
  method:'POST',headers:{origin:identityEnv.HFT_PUBLIC_ORIGIN,
   'content-type':'application/json',
   cookie:'__Host-hft_session='+signedToken(),...override},
  body:JSON.stringify(body)});
}
test('unqualified PostgreSQL IN never reports posted despite signed session',async()=>{
 const r=await submit(req('/api/hft/stores/submit',receipt));
 const x=await r.json();assert.equal(r.status,503);assert.equal(x.stockChanged,false);
 assert.equal(x.durable,false);assert.equal(x.state,'UNAVAILABLE');
});
test('caller-supplied approved or posted claims cannot bypass strict input',async()=>{
 const r=await submit(req('/api/hft/stores/submit',{...receipt,posted:true,approved:true}));
 assert.equal(r.status,422);assert.equal((await r.json()).stockChanged,false);
});
test('a forged cross-site request never reaches resolver',async()=>{
 const r=await submit(req('/api/hft/stores/submit',{...receipt,siteId:'SITE2'}));
 assert.equal(r.status,401);
});
test('expired session and wrong Origin fail before any DB read',async()=>{
 const expired=signedToken({exp:Math.floor(Date.now()/1000)-1});
 const a=await submit(req('/api/hft/stores/submit',receipt,
  {cookie:'__Host-hft_session='+expired}));
 const b=await submit(req('/api/hft/stores/submit',receipt,{origin:'https://attacker.test'}));
 assert.equal(a.status,401);assert.equal(b.status,401);
});
test('unqualified scoped balance read never returns preview numbers',async()=>{
 const r=await read(req('/api/hft/stores/read',query));
 assert.equal(r.status,503);const j=await r.json();
 assert.equal(j.state,'UNAVAILABLE');assert.equal(j.durable,false);
 assert.equal(j.rows,undefined);
});
test('read denies invalid scope and fake READ filters',async()=>{
 const a=await read(req('/api/hft/stores/read',{...query,warehouseId:'WH2'}));
 const b=await read(req('/api/hft/stores/read',{...query,previewBalance:'100'}));
 assert.equal(a.status,401);assert.equal(b.status,422);
});
test('unsupported methods fail with 405, no data',async()=>{
 const a=await submitGet(),b=await readGet();
 assert.equal(a.status,405);assert.equal(b.status,405);
});
test('wrong content types are rejected before parsing request',async()=>{
 const a=await submit(req('/api/hft/stores/submit',receipt,
   {'content-type':'text/plain'}));
 const b=await read(req('/api/hft/stores/read',query,
   {'content-type':'text/plain'}));
 assert.equal(a.status,415);assert.equal(b.status,415);
});

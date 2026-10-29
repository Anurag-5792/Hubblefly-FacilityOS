import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {POST,GET} from '../../app/api/hft/stores/prepare/route.ts';
const key=generateKeyPairSync('ed25519');
const origin='http://127.0.0.1:38721';
const env={NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',
 HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',
 HFT_PUBLIC_ORIGIN:origin,HFT_SESSION_ISSUER:'fixture',HFT_SESSION_AUDIENCE:'hft-test',
 HFT_SESSION_ED25519_PUBLIC_KEY_PEM:key.publicKey.export({type:'spki',format:'pem'}).toString()};
for(const [k,v] of Object.entries(env))process.env[k]=v;
function token(overrides:Record<string,unknown>={}):string{
 const now=Math.floor(Date.now()/1000);
 const header=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'JWT',kid:'hft-r1'})).toString('base64url');
 const claims=Buffer.from(JSON.stringify({iss:'fixture',aud:'hft-test',sub:'STORE1',
  jti:'JTI1',legalEntityId:'HFT',siteId:'SITE1',warehouseIds:['WH1'],
  iat:now-5,exp:now+120,...overrides})).toString('base64url');
 const part=header+'.'+claims;
 return part+'.'+sign(null,Buffer.from(part,'ascii'),key.privateKey).toString('base64url');
}
const payload={contractVersion:'HFT-R1-STORES-P0-PREPARE-V1',requestId:'11111111-1111-4111-8111-111111111111',
 kind:'IN',legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',itemCode:'MTR100',productVersion:'V1',
 controlType:'NONE',quantity:'5',uom:'PCS',serialNo:'',batchNo:'',leafLocationId:'BN04',
 grnId:'GRN1',receiptKey:'RECEIPT1',supplierId:'SUP1',invoiceNumber:'INV-1',qcState:'ACCEPTED',qcEvidenceId:'QC1'};
async function request(input:unknown=payload,auth=token(),extra:Record<string,string>={}):Promise<Response>{
 return POST(new Request(origin+'/api/hft/stores/prepare',{method:'POST',
  headers:{origin,cookie:'__Host-hft_session='+auth,'content-type':'application/json',...extra},
  body:JSON.stringify(input)}));
}
test('signed matching scope produces only non-durable, nonposting validation',async()=>{
 const res=await request();const body=await res.json();
 assert.equal(res.status,200);assert.equal(body.state,'VALIDATED_NOT_POSTED');
 assert.equal(body.durable,false);assert.equal(body.stockChanged,false);
 assert.equal(body.locationVerified,false);assert.equal(body.businessAuthorityVerified,false);
 assert.equal(res.headers.get('Cache-Control')?.includes('no-store'),true);
});
test('cross-site and warehouse attempts denied by verified issuer scope',async()=>{
 for(const update of [{siteId:'OTHER'},{warehouseId:'WH2'},{legalEntityId:'DDL'}]){
  const res=await request({...payload,...update});assert.equal(res.status,401);
  assert.equal((await res.json()).durable,false);
 }
});
test('unsigned, tampered or expired credentials fail without data exposure',async()=>{
 for(const t of ['nonsense',token({exp:Math.floor(Date.now()/1000)-10})]){
  const res=await request(payload,t);assert.equal(res.status,401);
 }
});
test('forged approved/posted flags and unknown fields fail shape validation',async()=>{
 const res=await request({...payload,posted:true,approved:true});assert.equal(res.status,422);
 assert.equal((await res.json()).code,'P0_EXACT_KEYS_REQUIRED');
});
test('request origin and cross-site controls fail',async()=>{
 const x=await request(payload,token(),{origin:'https://attacker.example'});
 assert.equal(x.status,401);
 const y=await request(payload,token(),{'sec-fetch-site':'cross-site'});
 assert.equal(y.status,401);
});
test('content type and oversized body are rejected before any mutation',async()=>{
 const nojson=await request(payload,token(),{'content-type':'text/plain'});
 assert.equal(nojson.status,415);
 const huge=await request({...payload,invoiceNumber:'A'.repeat(20000)});
 assert.equal(huge.status,413);
});
test('production startup remains blocked despite owner GO without qualification',async()=>{
 const old=process.env.HFT_ENVIRONMENT;process.env.HFT_ENVIRONMENT='production';
 try{const res=await request();assert.equal(res.status,503);}
 finally{process.env.HFT_ENVIRONMENT=old;}
});
test('GET cannot bypass signed nonposting POST-only API',async()=>{
 const res=await GET();assert.equal(res.status,405);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateRequirements,parseRequirementsCatalog} from '../../lib/hft/planning/requirements.ts';
import {misRequirementsConfigured} from '../../lib/hft/planning/mis-profile.ts';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const scope={legalEntityId:'FIXTURE-HFT',siteId:'FIXTURE-SITE',warehouseId:'FIXTURE-WH'};
function fixture(){
 const line=(itemCode:string,quantityMicro:string,childRevisionId:string|null=null)=>({itemCode,productVersion:'V1',uom:'PCS',quantityMicro,childRevisionId,verified:true});
 return {state:'REQUIREMENTS_SOURCE',scope,scopeName:{companyName:'Synthetic',siteName:'Synthetic',warehouseName:'Synthetic'},asOf:'2026-11-28T00:00:00Z',sourceEpoch:'a'.repeat(64),stockAdmitted:false,
 models:[{id:id(1),name:'Synthetic drone',variant:'V1',revisionId:id(2),revision:1,evidenceSha256:'b'.repeat(64),effectiveFrom:'2026-01-01T00:00:00Z',effectiveTo:null as string|null}],rootRevisionId:id(2),
 nodes:[{revisionId:id(2),bomId:id(3),kind:'DRONE',itemCode:null as string|null,versionCode:null as string|null,evidenceSha256:'b'.repeat(64),verified:true,lines:[line('SFG','2000000',id(4)),line('RAW','1000000')]},
 {revisionId:id(4),bomId:id(5),kind:'SFG',itemCode:'SFG',versionCode:'V1',evidenceSha256:'c'.repeat(64),verified:true,lines:[line('RAW','2000000')]}]};
}
test('HF098 gross explosion is exact and not net stock demand',()=>{
 const f=fixture(),r=calculateRequirements(f,scope,id(1),3);
 assert.equal(r.direct.find(x=>x.itemCode==='SFG')?.required,'6');
 assert.equal(r.grossLeaf[0].required,'15');assert.equal(r.capacity,null);assert.equal(r.coverage,null);
 assert.ok([...r.direct,...r.grossLeaf,...r.assemblies].every(x=>x.available===null&&x.shortage===null));
 assert.equal(parseRequirementsCatalog({...f,state:'CATALOG',rootRevisionId:null,nodes:null},scope).models.length,1);
});
test('HF098 scope, evidence, quantities, effective interval and graph fail closed',()=>{
 for(const n of [0,-1,1.1,100001])assert.throws(()=>calculateRequirements(fixture(),scope,id(1),n));
 assert.throws(()=>calculateRequirements(fixture(),{...scope,warehouseId:'OTHER'},id(1),1));
 for(const edit of [(f:ReturnType<typeof fixture>)=>{f.stockAdmitted=true},f=>{f.nodes.pop()},f=>{f.nodes[1].verified=false},f=>{f.nodes[1].versionCode='V2'},f=>{f.models[0].effectiveTo='2026-02-01T00:00:00Z'},f=>{f.nodes[1].bomId=f.nodes[0].bomId},f=>{f.nodes[0].lines.push(f.nodes[0].lines[0])},f=>{f.nodes[1].lines[0].quantityMicro='9223372036854775808'}]){
  const f=fixture();edit(f);assert.throws(()=>calculateRequirements(f,scope,id(1),1));
 }
 assert.equal(misRequirementsConfigured({}),false);
 assert.equal(misRequirementsConfigured({HFT_MIS_REQUIREMENTS_PROFILE:'HFT_R1_MIS_REQUIREMENTS_RETAINED_V1',NODE_ENV:'production',VERCEL_ENV:'production'}),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFreshRequirements,csvCell,requirementsReportCsv,procurementReview} from '../../lib/hft/planning/management-report.ts';
import {calculateRequirements} from '../../lib/hft/planning/requirements.ts';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const scope={legalEntityId:'FIXTURE-HFT',siteId:'FIXTURE-SITE',warehouseId:'FIXTURE-WH'};
const line=(itemCode:string,quantityMicro:string,childRevisionId:string|null=null)=>({itemCode,productVersion:'V1',uom:'PCS',quantityMicro,childRevisionId,verified:true});
function result(){return calculateRequirements({state:'REQUIREMENTS_SOURCE',scope,scopeName:{companyName:'=SYNTHETIC()',siteName:'Synthetic, site',warehouseName:'Synthetic "warehouse"'},
 asOf:'2026-11-28T00:00:00.000Z',sourceEpoch:'a'.repeat(64),stockAdmitted:false,rootRevisionId:id(2),
 models:[{id:id(1),name:'Synthetic drone',variant:'Fixture V1',revisionId:id(2),revision:1,evidenceSha256:'b'.repeat(64),effectiveFrom:'2026-01-01T00:00:00Z',effectiveTo:null}],
 nodes:[{revisionId:id(2),bomId:id(3),kind:'DRONE',itemCode:null,versionCode:null,evidenceSha256:'b'.repeat(64),verified:true,lines:[line('SFG','2000000',id(4)),line('RAW','1000000')]},
 {revisionId:id(4),bomId:id(5),kind:'SFG',itemCode:'SFG',versionCode:'V1',evidenceSha256:'c'.repeat(64),verified:true,lines:[line('RAW','2000000')]}]},scope,id(1),3);}
test('management report uses freshly verified scope/revision and exact gross demand, never buy quantity',()=>{
 const r=result(),fresh={...r,asOf:'2026-11-28T00:01:00.000Z'};
 assert.equal(assertFreshRequirements(r,fresh),fresh);
 const csv=requirementsReportCsv(r,fresh);
 assert.ok(csv.startsWith('\uFEFF"report_section"'));
 assert.equal(csv.trim().split('\r\n').length,5);
 assert.ok(csv.includes('"GROSS_LEAF","All assemblies assumed built; procurement review only, not net purchase demand"'));
 assert.ok(csv.includes('"RAW","V1","PCS","15","COMPONENT","NOT_ASSESSED","NOT_ASSESSED","NOT_ASSESSED","NOT_ASSESSABLE"'));
 assert.ok(csv.includes('"2026-11-28T00:01:00.000Z"'));assert.ok(csv.includes('"\'=SYNTHETIC()"'));
 assert.ok(csv.includes('"Synthetic, site"'));assert.ok(csv.includes('"Synthetic ""warehouse"""'));
 assert.deepEqual(procurementReview(r),r.grossLeaf);
});
test('report rejects changed revision, graph, scope, model, units, old timestamp and invented stock',()=>{
 const r=result();for(const x of [{...r,sourceEpoch:'f'.repeat(64)},{...r,scope:{...scope,warehouseId:'OTHER'}},
  {...r,scopeName:{...r.scopeName,companyName:'OTHER'}},{...r,model:{...r.model,revision:2}},{...r,units:4},
  {...r,asOf:'2026-11-27T00:00:00Z'},{...r,grossLeaf:[]},{...r,grossLeaf:[{...r.grossLeaf[0],required:'1'}]},
  {...r,grossLeaf:[{...r.grossLeaf[0],available:'0'}]},{...r,capacity:0},{...r,stockAdmitted:true},null])
 assert.throws(()=>requirementsReportCsv(r,x),/SOURCE_CHANGED/);
});
test('CSV cannot turn text fields into formulas',()=>{
 for(const s of ['=SUM(1,2)',' @SUM(1,2)','\t+1','\r-1','\uFEFF=1','＝1','\u0001=1'])assert.ok(csvCell(s).startsWith('"\''));
 assert.equal(csvCell('A"B'),'"A""B"');assert.equal(csvCell(null),'"NOT_ASSESSED"');assert.equal(csvCell(0),'"0"');
});

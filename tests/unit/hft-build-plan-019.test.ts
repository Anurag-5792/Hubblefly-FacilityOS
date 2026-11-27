import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan,type Snapshot,type Material,type Model,type PlanRequest,type Bom,type Line} from '../../lib/hft/planning/build-plan.ts';
const scope={legalEntityId:'FIXTURE-HFT',siteId:'FIXTURE-SITE',warehouseId:'FIXTURE-WH'};
const at='2026-11-28T00:00:00.000Z';
const line=(code:string,quantity='1'):Line=>({itemCode:code,productVersion:'V1',uom:'PCS',quantity});
const bom=(lines:Line[]):Bom=>({revisionId:'FIXTURE-BOM-V1',state:'APPROVED',complete:true,effectiveFrom:'2026-01-01T00:00:00.000Z',effectiveTo:null,lines});
const model=(id:string,lines:Line[]):Model=>({id,name:'Synthetic '+id,version:'V1',active:true,bom:bom(lines)});
const material=(code:string,count:string,models=['A','B'],patch:Partial<Material>={}):Material=>({itemCode:code,productVersion:'V1',uom:'PCS',name:'Synthetic '+code,active:true,verified:true,
 applicableModels:models,usedEligibleModels:models,newOnHand:count,usedOnHand:'0',newFree:count,usedFree:'0',held:'0',unknown:'0',reservations:[],assembly:null,...patch});
const fixture=():Snapshot=>({scope,asOf:at,sourceEpoch:'FIXTURE-EPOCH',provenance:'SYNTHETIC TEST ONLY',authoritative:true,complete:true,
 models:[model('A',[line('COMMON'),line('AA')]),model('B',[line('COMMON'),line('BB')])],
 items:[material('COMMON','12'),material('AA','10',['A']),material('BB','10',['B'])]});
const req=(order=['A','B'],patch:Partial<PlanRequest>={}):PlanRequest=>({scope,condition:'NEW_ONLY',mode:'FULL',priorities:order.map(modelId=>({modelId,cap:null})),protect:[],ignore:[],...patch});
test('priority reversal, shared pool and independent maxima not added',()=>{
 const s=fixture();const a=buildPlan(s,req()),b=buildPlan(s,req(['B','A']));
 assert.equal(a.combinedTotal,12);assert.deepEqual(a.models.map(x=>[x.independent,x.allocated]),[[10,10],[10,2]]);
 assert.deepEqual(b.models.map(x=>[x.modelId,x.allocated]),[['B',10],['A',2]]);
 assert.deepEqual(s,fixture());assert.deepEqual(buildPlan(s,req()),a);
});
test('core potential retains other constraints and records ignored demand',()=>{
 const a=buildPlan(fixture(),req(['A','B'],{mode:'CORE',ignore:[line('COMMON')]}));
 assert.equal(a.combinedTotal,20);assert.match(a.label,/Conditional/);
 assert.equal(a.materials.find(x=>x.itemCode==='COMMON')?.ignored,'20');
 assert.throws(()=>buildPlan(fixture(),req(['A','B'],{mode:'CORE',ignore:[line('AA')]})),/NOT_VERIFIED_COMMON/);
});
test('caps and unequal quantities, multiple shared pools',()=>{
 const s=fixture();const a=buildPlan({...s,models:[model('A',[line('COMMON','2'),line('AA')]),...s.models.slice(1)]},
 req(['A','B'],{priorities:[{modelId:'A',cap:3},{modelId:'B',cap:null}]}));
 assert.deepEqual(a.models.map(x=>x.allocated),[3,6]);assert.equal(a.combinedTotal,9);
});
test('protect-other models credits existing eligible reservations exactly once',()=>{
 const s=fixture();const x={...s,items:[material('COMMON','10',['A','B'],{newOnHand:'12',reservations:[{modelId:'B',newQuantity:'2',usedQuantity:'0'}]}),...s.items.slice(1)]};
 const a=buildPlan(x,req(['A'],{protect:[{modelId:'B',quantity:5}]}));
 assert.equal(a.combinedTotal,7);assert.equal(a.protectedMaterials.find(x=>x.itemCode==='COMMON')?.reserved,'2');assert.equal(a.protectedMaterials.find(x=>x.itemCode==='COMMON')?.protected,'3');
 assert.throws(()=>buildPlan(x,req(['A'],{protect:[{modelId:'A',quantity:1}]})),/CONFLICT/);
});
test('condition eligibility, zero is distinct from missing and incomplete scope',()=>{
 const s=fixture(),items=[material('COMMON','0',['A','B'],{usedOnHand:'12',usedFree:'12',usedEligibleModels:['A']}),...s.items.slice(1)];
 assert.equal(buildPlan({...s,items},req()).combinedTotal,0);
 assert.equal(buildPlan({...s,items},req(['A','B'],{condition:'NEW_AND_ELIGIBLE_USED'})).combinedTotal,10);
 assert.equal(buildPlan({...s,items:[{...items[0],newFree:null},...items.slice(1)]},req()).combinedTotal,null);
 assert.equal(buildPlan({...s,complete:false},req()).combinedTotal,null);
 assert.equal(buildPlan({...s,models:[{...s.models[0],bom:null},s.models[1]]},req()).combinedTotal,null);
 assert.throws(()=>buildPlan(s,req(['A'],{scope:{...scope,warehouseId:'OTHER'}})),/SCOPE_MISMATCH/);
});
test('SFG stock first then explode shortage; children never counted twice',()=>{
 const s:Snapshot={...fixture(),models:[model('A',[line('SFG'),line('CHILD')])],
 items:[material('SFG','2',['A'],{assembly:bom([line('CHILD','2')])}),material('CHILD','10',['A'])]};
 const a=buildPlan(s,req(['A']));assert.equal(a.combinedTotal,4);
 assert.equal(a.materials.find(x=>x.itemCode==='SFG')?.drawn,'2');assert.equal(a.materials.find(x=>x.itemCode==='SFG')?.built,'2');
 assert.equal(a.materials.find(x=>x.itemCode==='CHILD')?.drawn,'8');
 const cycle={...s,items:[material('SFG','0',['A'],{assembly:bom([line('SFG')])}),s.items[1]]};
 assert.equal(buildPlan(cycle,req(['A'])).combinedTotal,null);
});
test('unmapped version and UOM, duplicate lines and no assessed requirements',()=>{
 const s=fixture();assert.equal(buildPlan({...s,items:[{...s.items[0],uom:'KG'},...s.items.slice(1)]},req()).combinedTotal,null);
 assert.throws(()=>buildPlan({...s,models:[model('A',[line('AA'),line('AA')]),s.models[1]]},req()),/DUPLICATE/);
 const only={...s,models:[model('A',[line('COMMON')]),s.models[1]]};
 assert.equal(buildPlan(only,req(['A'],{mode:'CORE',ignore:[line('COMMON')]})).combinedTotal,null);
});

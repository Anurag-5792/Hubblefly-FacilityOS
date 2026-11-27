import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyItem,createRevisionDraft,validateRevision,issueGovernedIdentity,requireMasterAction,type CanonicalItem,type Revision,type DroneModel,type MasterAuthority} from '../../lib/hft/planning/master-contracts.ts';
const scope={legalEntityId:'FIXTURE-HFT',siteId:'FIXTURE-SITE',warehouseId:'FIXTURE-WH'};
const item:CanonicalItem={scope,itemCode:'FIXTURE-ITEM',productVersion:'V1',uom:'PCS',active:true,approvedVersion:true,categoryId:'FIXTURE-CAT',name:'Synthetic connector',aliases:['FIXTURE-ALIAS'],manufacturer:'Fixture maker',partNumber:'P01'};
const category={id:'FIXTURE-CAT',label:'Synthetic category',active:true,verified:true};
const model:DroneModel={scope,modelId:'FIXTURE-DRONE',variantId:'V1',name:'Synthetic drone',active:true,revision:1};
const authority:MasterAuthority={scope,principal:{subject:'fixture-subject',sessionId:'fixture-session',employeeId:'fixture-employee',personId:'fixture-person',expiresAt:Math.floor(Date.now()/1000)+600,scopes:[scope]},actions:['BOM_REVISE','CATEGORY_CONFIRM','NUMBER_ISSUE']};
const revision:Revision={scope,subjectId:model.modelId,revisionId:'BOM-V1',priorRevisionId:null,revision:1,state:'APPROVED',effectiveFrom:'2026-01-01T00:00:00Z',effectiveTo:null,applicableModelIds:[model.modelId],lines:[{itemCode:item.itemCode,productVersion:item.productVersion,uom:item.uom,quantity:'1'}]};
test('classification matches legacy alias and exact manufacturer part without issuing code',()=>{
 const input={codeOrAlias:' fixture-alias ',name:'',manufacturer:'',partNumber:''};
 const r=classifyItem(input,[item],[category],scope);assert.equal(r.state,'EXISTING_MATCH');assert.equal(r.itemCode,item.itemCode);
 assert.equal(classifyItem({...input,codeOrAlias:'',manufacturer:'Fixture Maker',partNumber:'p01'},[item],[category],scope).state,'EXISTING_MATCH');
 assert.equal(classifyItem({...input,codeOrAlias:'',name:'synthetic connector'},[item],[category],scope).state,'SUGGEST_CATEGORY');
 assert.equal(classifyItem({...input,codeOrAlias:'not-known'},[item],[category],scope).state,'NEEDS_SELECTION');
 assert.equal(classifyItem(input,[item,{...item,itemCode:'FIXTURE-OTHER'}],[category],scope).state,'CONFLICT');
 assert.equal(classifyItem(input,[item],[category],{...scope,warehouseId:'OTHER'}).state,'NEEDS_SELECTION');
});
test('BOM revision never overwrites approved history and rejects wrong scope, inactive version and cycles',()=>{
 validateRevision(revision,[model],[item],[]);
 const draft=createRevisionDraft(revision,'BOM-V2',authority);
 assert.equal(draft.state,'DRAFT');assert.equal(draft.priorRevisionId,'BOM-V1');assert.equal(revision.state,'APPROVED');
 assert.throws(()=>createRevisionDraft(revision,'BOM-V1',authority),/NEW_REVISION/);
 assert.throws(()=>requireMasterAction(authority,{...scope,warehouseId:'OTHER'},'BOM_REVISE'),/DENIED/);
 assert.throws(()=>requireMasterAction(authority,scope,'BOM_APPROVE'),/DENIED/);
 assert.throws(()=>validateRevision(revision,[model],[{...item,approvedVersion:false}],[]),/UNRESOLVED/);
 assert.throws(()=>validateRevision(revision,[model],[item],[{...item,applicableModelIds:[model.modelId],bom:revision}]),/CYCLE/);
});
test('numbering refuses missing governed policy, unauthorized action and mismatched readback',async()=>{
 let calls=0;const input={scope,categoryId:category.id,description:'Synthetic new part',requestId:'00000000-0000-4000-8000-000000000001',policyRevision:'P1'};
 const policy={scope,categoryId:category.id,namespace:'SYNTHETIC-TEST-NAMESPACE',policyRevision:'P1',evidenceSha256:'a'.repeat(64),approved:true};
 const port={approvedPolicy:async()=>null,issueAndReadback:async()=>{calls++;return {requestId:input.requestId,categoryId:input.categoryId,itemCode:'SYNTHETIC-CODE',policyRevision:'P1',auditDigest:'b'.repeat(64)};}};
 await assert.rejects(issueGovernedIdentity(input,authority,port),/POLICY_NOT_ADMITTED/);assert.equal(calls,0);
 await assert.rejects(issueGovernedIdentity(input,{...authority,actions:[]},port),/DENIED/);assert.equal(calls,0);
 const valid={...port,approvedPolicy:async()=>policy};
 assert.equal((await issueGovernedIdentity(input,authority,valid)).itemCode,'SYNTHETIC-CODE');assert.equal(calls,1);
 await assert.rejects(issueGovernedIdentity(input,authority,{...valid,issueAndReadback:async()=>({...await port.issueAndReadback(),requestId:'wrong'})}),/UNCONFIRMED/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executePlanningRead,type PlanningDeps} from '../../lib/hft/planning/planning-read.ts';
import type {Snapshot} from '../../lib/hft/planning/build-plan.ts';
import type {RoleStore,RoleTransaction,SessionIdentity} from '../../lib/hft/roles/role-service.ts';
import type {Assignment,Principal} from '../../lib/hft/roles/role-assignment.ts';
const scope={legalEntityId:'FIXTURE-HFT',siteId:'FIXTURE-SITE',warehouseId:'FIXTURE-WH'};
const session:SessionIdentity={subject:'fixture-subject',sessionId:'fixture-session',expiresAt:Math.floor(Date.now()/1000)+600,
 scope:{legalEntityId:scope.legalEntityId,siteId:scope.siteId,warehouseIds:[scope.warehouseId]}};
const actor:Principal={...session,employeeId:'FIXTURE-EMP',personId:'FIXTURE-PERSON',scopes:[scope]};
const snapshot:Snapshot={scope,asOf:'2026-11-28T00:00:00.000Z',sourceEpoch:'FIXTURE-EPOCH',provenance:'SYNTHETIC',authoritative:true,complete:true,models:[],items:[]};
const request=new Request('https://fixture.invalid/api/hft/mis',{method:'POST'});
const input={intent:'CATALOG',scope,scenario:null};
test('management permission is independent of stock.read, revocation denies before returning data',async()=>{
 let allowed=true,reads=0;
 const tx={principal:async()=>actor,scopes:async()=>[scope],employee:async()=>({employeeId:actor.employeeId,personId:actor.personId,active:true,fullName:'Synthetic',version:1}),
  assignment:async():Promise<Assignment>=>({scope,employeeId:actor.employeeId,revision:1,revokedFrom:null,periods:[{from:'2026-01-01T00:00:00.000Z',to:null,roles:allowed?['VIEWER']:[]} ]})} as RoleTransaction;
 const roles:RoleStore={read:async work=>work(tx),write:async()=>{throw Error('WRITE_FORBIDDEN');}};
 const deps:PlanningDeps={authenticate:async()=>session,roles,requireManagementRead:async()=>{},source:{read:async()=>{reads++;return snapshot;}}};
 await assert.rejects(executePlanningRead(request,input,{...deps,requireManagementRead:async()=>{throw Error('MANAGEMENT_DENIED');}}),/MANAGEMENT_DENIED/);assert.equal(reads,0);
 await assert.rejects(executePlanningRead(request,{...input,scope:{...scope,warehouseId:'OTHER'}},deps),/DENIED/);assert.equal(reads,0);
 await assert.rejects(executePlanningRead(request,{...input,snapshot},deps),/INVALID_FIELDS/);assert.equal(reads,0);
 const result=await executePlanningRead(request,input,deps);assert.equal(result.state,'CATALOG');
 await assert.rejects(executePlanningRead(request,input,{...deps,source:{read:async()=>{allowed=false;return snapshot;}}}),/DENIED|INVALID/);
});

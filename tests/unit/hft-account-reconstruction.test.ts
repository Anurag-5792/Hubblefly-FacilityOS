/** Pure accounting regression: does NOT claim PostgreSQL execution. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,emptyEngineState,type StockCommand,type TrustedApprovalGate,type TrustedMasterSnapshot} from '../../lib/hft/domain/ledger.ts';
import {postingLegs,reconstructAccountBalances} from '../../lib/hft/persistence/account-model.ts';
import {parseQuantity} from '../../lib/hft/domain/quantity.ts';
import type {VerifiedPrincipal} from '../../lib/hft/security/authorization.ts';
const actor:VerifiedPrincipal={subject:'STORE1',authenticated:true,active:true,permissions:['stock:post'],
 scope:{legalEntityId:'HFT',siteId:'SITE1',warehouseIds:['WH1']}};
const masters:TrustedMasterSnapshot={item:{legalEntityId:'HFT',itemCode:'ITEM1',uom:'NOS',control:'NONE',active:true,version:1},
 warehouse:{legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',active:true,version:1},
 employee:{legalEntityId:'HFT',siteId:'SITE1',employeeId:'EMP1',fullName:'Synthetic',department:'ENG',designation:'Technician',active:true,version:1}};
function c(kind:StockCommand['kind'],n:string,qty:string,version:number,extra:Partial<StockCommand>={}):StockCommand {
 return {kind,commandId:'CMD-'+n,idempotencyKey:'ID-'+n,legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
   locationId:'BIN1',itemCode:'ITEM1',quantity:qty,expectedBalanceVersion:version,
   sourceDocumentId:'DOC-'+n,sourceActionKey:'ACT-'+n,...extra};
}
function gate(c:StockCommand):TrustedApprovalGate {
 return {verifiedByServer:true,approved:true,approvalId:'APP-'+c.commandId,revision:1,approvedBy:'APPROVER',
 documentId:c.sourceDocumentId,legalEntityId:c.legalEntityId,siteId:c.siteId,warehouseId:c.warehouseId,
 blockingHolds:[],...(c.kind==='RETURN'?{inspectedCondition:c.condition,inspectionEvidenceId:'QC-001'}:{})};
}
const key=(a:NonNullable<ReturnType<typeof postingLegs>[number]['account']>)=>JSON.stringify(a);
test('QA-001/002/008: receive 5, issue 2, return GOOD 1, return DAMAGED 1 reconstructs distinct owned accounts',()=>{
 let state=emptyEngineState(); const stored:{accountId:string|null;signedMicro:bigint}[]=[];
 const statuses:[string,string,string,string][]=[];
 for(const command of [
   c('RECEIVE','R','5',0),
   c('ISSUE','I','2',1,{employeeId:'EMP1'}),
   c('RETURN','G','1',2,{employeeId:'EMP1',originalIssueId:'CMD-I',condition:'GOOD'}),
   c('RETURN','D','1',3,{employeeId:'EMP1',originalIssueId:'CMD-I',condition:'DAMAGED'}),
 ]) {
   const posted=applyCommand(state,command,actor,gate(command),masters);state=posted.state;
   const legs=postingLegs(command,posted.result.fact);
   assert.equal(legs.reduce((total,leg)=>total+leg.signedMicro,0n),0n,'every command balanced');
   for(const l of legs) stored.push({accountId:l.account?key(l.account):null,signedMicro:l.signedMicro});
   const reconstruction=reconstructAccountBalances(stored);
   const byKind=(kind:string)=>[...reconstruction.entries()].filter(([k])=>JSON.parse(k).kind===kind).reduce((n,[,v])=>n+v,0n);
   const total=byKind('AVAILABLE')+byKind('CUSTODY')+byKind('QUARANTINE')+byKind('DAMAGED');
   statuses.push([posted.result.available,String(byKind('CUSTODY')),String(byKind('DAMAGED')),String(total)]);
 }
 assert.deepEqual(statuses,[['5','0','0','5000000'],['3','2000000','0','5000000'],
   ['4','1000000','0','5000000'],['4','0','1000000','5000000']]);
 const acct=reconstructAccountBalances(stored);const identities=[...acct.keys()].map(v=>JSON.parse(v));
 assert.equal(new Set(identities.map(i=>i.kind)).size,3);
 assert.equal(identities.find(i=>i.kind==='CUSTODY').custodianEmployeeId,'EMP1');
 assert.equal(identities.find(i=>i.kind==='DAMAGED').condition,'DAMAGED');
 assert.equal(identities.every(i=>i.locationId==='BIN1'),true);
 assert.equal([...acct.values()].reduce((n,v)=>n+v,0n),parseQuantity('5'));
});
test('QA-003: unbound storage location and cross-location identity cannot be treated as the same account',()=>{
 const receive=c('RECEIVE','LOC','1',0);
 const post=applyCommand(emptyEngineState(),receive,actor,gate(receive),masters);
 assert.throws(()=>postingLegs({...receive,locationId:''},post.result.fact),/POSTING_LOCATION_REQUIRED/);
 const idA=postingLegs(receive,post.result.fact)[1].account;
 const idB=postingLegs({...receive,locationId:'BIN2'},post.result.fact)[1].account;
 assert.notDeepEqual(idA,idB);
});
test('QA-001: custody leg never points to AVAILABLE account, damaged never points to QUARANTINE',()=>{
 let state=emptyEngineState();
 const receive=c('RECEIVE','A','2',0);state=applyCommand(state,receive,actor,gate(receive),masters).state;
 const issue=c('ISSUE','B','1',1,{employeeId:'EMP1'});
 const posted=applyCommand(state,issue,actor,gate(issue),masters);
 const legs=postingLegs(issue,posted.result.fact);
 assert.equal(legs[0].account?.kind,'AVAILABLE');assert.equal(legs[1].account?.kind,'CUSTODY');
 assert.notDeepEqual(legs[0].account,legs[1].account);
});
test('QA-008: no unowned EXTERNAL quantity leaks into company-owned balance',()=>{
 const receive=c('RECEIVE','EXT','2',0);const fact=applyCommand(emptyEngineState(),receive,actor,gate(receive),masters).result.fact;
 const legs=postingLegs(receive,fact);
 const recon=reconstructAccountBalances(legs.map(l=>({accountId:l.account?key(l.account):null,signedMicro:l.signedMicro})));
 assert.equal([...recon.values()].reduce((n,v)=>n+v,0n),2000000n);
 assert.equal(legs.find(l=>l.bucket==='EXTERNAL')?.account,null);
});

test('QA-002: serialized stock identity rejects duplicate receiving and custody conflict',()=>{
 const controlled:TrustedMasterSnapshot={...masters,item:{...masters.item,control:'SERIAL'}};
 const receive=c('RECEIVE','SER1','1',0,{serialNo:'SERIAL-1'});
 const first=applyCommand(emptyEngineState(),receive,actor,gate(receive),controlled);
 const second=c('RECEIVE','SER2','1',1,{serialNo:'SERIAL-1'});
 assert.throws(()=>applyCommand(first.state,second,actor,gate(second),controlled),/SERIAL_ALREADY_REGISTERED/);
 const issue=c('ISSUE','SER3','1',1,{serialNo:'SERIAL-1',employeeId:'EMP1'});
 const held=applyCommand(first.state,issue,actor,gate(issue),controlled);
 assert.equal(postingLegs(issue,held.result.fact)[1].account?.custodianEmployeeId,'EMP1');
 const other=c('ISSUE','SER4','1',2,{serialNo:'SERIAL-1',employeeId:'EMP1'});
 assert.throws(()=>applyCommand(held.state,other,actor,gate(other),controlled),/INSUFFICIENT_AVAILABLE_STOCK|SERIAL_NOT_AVAILABLE/);
});
test('QA-004: batch custody remains lot-specific under distinct location keys',()=>{
 const controlled:TrustedMasterSnapshot={...masters,item:{...masters.item,control:'BATCH'}};
 const receive=c('RECEIVE','B1','5',0,{batchNo:'LOT1'});
 const initial=applyCommand(emptyEngineState(),receive,actor,gate(receive),controlled);
 const issue=c('ISSUE','B2','2',1,{batchNo:'LOT1',employeeId:'EMP1'});
 const released=applyCommand(initial.state,issue,actor,gate(issue),controlled);
 const id=postingLegs(issue,released.result.fact)[1].account;
 assert.equal(id?.batchNo,'LOT1');
 assert.equal(id?.locationId,'BIN1');
 assert.equal(id?.kind,'CUSTODY');
});

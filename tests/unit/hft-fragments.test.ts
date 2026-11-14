import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImmutablePostingFragment, type ImmutablePostingFragment, type StockFragmentLine } from '../../lib/hft/domain/stock-fragments.ts';
const digest='a'.repeat(64);
const line:StockFragmentLine={action:'ISSUE',legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
 documentId:'ISSUE1',documentRevision:4,lineActionKey:'LINE1',itemCode:'ITEM1',locationId:'LOC1',batchNo:'',
 serialNo:'',employeeId:'EMP1',originalIssueCommandId:'',authorizedMicro:'5000000',controlType:'NONE'};
const fragment=(name:string,amount:string):ImmutablePostingFragment=>({legalEntityId:'HFT',fragmentId:name,commandId:'CMD-'+name,
 idempotencyKey:'KEY-'+name,sourceDocumentId:'ISSUE1',sourceLineActionKey:'LINE1',action:'ISSUE',
 quantityMicro:amount,employeeId:'EMP1',originalIssueCommandId:'',documentRevision:4,
 actorSubject:'STORE1',approverSubject:'APPROVER2',approvedQuantityMicro:amount,
 approvedPayloadSha256:digest,policyGeneration:3});
test('partial issue of 2 then distinct 3 is accepted without duplicate inventory',()=>{
 const a=fragment('FRAG1','2000000'),b=fragment('FRAG2','3000000');
 assert.deepEqual(planImmutablePostingFragment(line,a,[],null).remainingMicro,'3000000');
 const result=planImmutablePostingFragment(line,b,[a],null);
 assert.equal(result.postedMicro,'5000000');assert.equal(result.remainingMicro,'0');
});
test('partial issue 2 then 4 exceeds original line',()=>{
 const a=fragment('FRAG1','2000000');
 assert.throws(()=>planImmutablePostingFragment(line,fragment('FRAG2','4000000'),[a],null),/FRAGMENT_AUTHORIZED_CUMULATIVE_EXCEEDED/);
});
test('duplicate fragment, command or idempotency key cannot create another issue',()=>{
 const a=fragment('FRAG1','2000000');
 for(const delta of [{fragmentId:a.fragmentId},{commandId:a.commandId},{idempotencyKey:a.idempotencyKey}])
   assert.throws(()=>planImmutablePostingFragment(line,{...fragment('FRAG2','1000000'),...delta},[a],null),/FRAGMENT_IDEMPOTENCY_OR_COMMAND_COLLISION/);
});
test('different source line/revision and forged approved quantity rejected',()=>{
 const a=fragment('FRAG1','2000000');
 assert.throws(()=>planImmutablePostingFragment({...line,documentRevision:5},a,[],null),/FRAGMENT_SOURCE_LINE_OR_REVISION_MISMATCH/);
 assert.throws(()=>planImmutablePostingFragment(line,{...a,sourceLineActionKey:'LINE2'},[],null),/FRAGMENT_SOURCE_LINE_OR_REVISION_MISMATCH/);
 assert.throws(()=>planImmutablePostingFragment(line,{...a,approvedQuantityMicro:'4000000'},[],null),/FRAGMENT_EXACT_APPROVED_QUANTITY_MISMATCH/);
});
test('partial return reduces original issue custody and rejects second overreturn',()=>{
 const retLine:StockFragmentLine={...line,action:'RETURN',documentId:'RETURN1',originalIssueCommandId:'CMD-ORIGINAL',authorizedMicro:'2000000'};
 const ret=(id:string,amount:string):ImmutablePostingFragment=>({...fragment(id,amount),action:'RETURN',sourceDocumentId:'RETURN1',originalIssueCommandId:'CMD-ORIGINAL'});
 const a=ret('RET1','1000000'),b=ret('RET2','1000000');
 const first=planImmutablePostingFragment(retLine,a,[],'2000000');
 assert.equal(first.custodyRemainingMicro,'1000000');
 const second=planImmutablePostingFragment(retLine,b,[a],'1000000');
 assert.equal(second.custodyRemainingMicro,'0');
 assert.throws(()=>planImmutablePostingFragment(retLine,ret('RET3','1000000'),[a,b],'0'),/FRAGMENT_AUTHORIZED_CUMULATIVE_EXCEEDED/);
});
test('serialized partial fragment must be one whole unit',()=>{
 const single:StockFragmentLine={...line,controlType:'SERIAL',serialNo:'SERIAL1',authorizedMicro:'1000000'};
 assert.throws(()=>planImmutablePostingFragment(single,fragment('A','500000'),[],null),/FRAGMENT_SERIAL_UNIT_REQUIRED/);
 assert.equal(planImmutablePostingFragment(single,fragment('B','1000000'),[],null).remainingMicro,'0');
});

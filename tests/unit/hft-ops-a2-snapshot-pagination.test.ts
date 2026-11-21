import {test} from 'node:test';
import assert from 'node:assert/strict';
import {issueSnapshotCursor,inspectSnapshotCursor,snapshotScopeSha256,
 snapshotRowsSha256,verifyCompleteSnapshotPages,
 type SnapshotAnchor,type OrdinalRow,type SnapshotPage}
 from '../../lib/hft/persistence/ops-a2-snapshot-pagination.ts';

const query={contractVersion:'HFT-R1-P0-READ-V1',intent:'MOVEMENTS',
 legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',itemCode:'ITEM1',
 productVersion:'PV1',leafLocationId:'',employeeId:'',cursor:'',limit:20};
const key=new Uint8Array(32).fill(7);
const actor={subject:'ACTOR1',sessionId:'SESSION1'};
const rows:OrdinalRow[]=Array.from({length:42},(_,i)=>({
 ordinal:i,rowSha256:i.toString(16).padStart(64,'0'),movementId:'ENTRY-'+(i+1)
}));
const now=1900000000;
const anchor:SnapshotAnchor={
 snapshotId:'123e4567-e89b-42d3-a456-426614174000',
 scopeSha256:snapshotScopeSha256(query),sourceEpoch:'POLICY-6',
 policyGeneration:6,totalRows:42,snapshotSha256:snapshotRowsSha256(rows),
 expiresAt:now+90,...{actorSubject:actor.subject,sessionId:actor.sessionId}
};
function pages():SnapshotPage<OrdinalRow>[]{
 return [{anchor,offset:0,rows:rows.slice(0,20),nextCursor:'p1'},
 {anchor,offset:20,rows:rows.slice(20,40),nextCursor:'p2'},
 {anchor,offset:40,rows:rows.slice(40),nextCursor:''}];
}
test('snapshot cursor is authenticated, scoped, bound to fresh session and limit',()=>{
 const c=issueSnapshotCursor(anchor,20,20,key);
 assert.match(c,/^[A-Za-z0-9_-]+$/);
 assert.ok(c.length<=512);
 assert.equal(inspectSnapshotCursor(c,{...query,cursor:c},actor,key,now).offset,20);
 for(const q of [
  {...query,legalEntityId:'OTHER'}, {...query,siteId:'SITE2'},
  {...query,warehouseId:'WH2'}, {...query,productVersion:'PV2'},
  {...query,itemCode:'ITEM2'}, {...query,limit:10}
 ])assert.throws(()=>inspectSnapshotCursor(c,{...q,cursor:c},actor,key,now));
 assert.throws(()=>inspectSnapshotCursor(c,{...query,cursor:c},
  {subject:'ACTOR2',sessionId:'SESSION1'},key,now));
 assert.throws(()=>inspectSnapshotCursor(c,{...query,cursor:c},
  {subject:'ACTOR1',sessionId:'SESSION2'},key,now));
 assert.throws(()=>inspectSnapshotCursor(c,{...query,cursor:c},actor,key,now+91));
 assert.throws(()=>inspectSnapshotCursor(c,{...query,cursor:c},actor,
  new Uint8Array(32).fill(8),now));
 const raw=Buffer.from(c,'base64url').toString('utf8');
 const tampered=Buffer.from(raw.replace('POLICY-6','POLICY-7')).toString('base64url');
 assert.throws(()=>inspectSnapshotCursor(tampered,{...query,cursor:tampered},
  actor,key,now),/SIGNATURE_INVALID/);
});
test('snapshot pages require exact rows, order, last terminal page and digest',()=>{
 verifyCompleteSnapshotPages(pages());
 const clone=pages();
 assert.throws(()=>verifyCompleteSnapshotPages(clone.slice(0,2)),
  /TRUNCATED_OR_EXTRA_PAGE/);
 assert.throws(()=>verifyCompleteSnapshotPages(clone.map((p,i)=>i===1?
  {...p,offset:21}:p)),/PAGE_GAP/);
 assert.throws(()=>verifyCompleteSnapshotPages(clone.map((p,i)=>i===1?
  {...p,rows:[p.rows[0],...p.rows]}:p)),/DUPLICATE_GAP/);
 assert.throws(()=>verifyCompleteSnapshotPages(clone.map((p,i)=>i===2?
  {...p,rows:[{...p.rows[0],rowSha256:'f'.repeat(64)},...p.rows.slice(1)]}:p)),
  /DIGEST_INVALID/);
 assert.throws(()=>verifyCompleteSnapshotPages(clone.map((p,i)=>i===1?
  {...p,anchor:{...anchor,sourceEpoch:'POLICY-7'}}:p)),/ANCHOR_DRIFT/);
});
test('snapshot rejects zero-secret, overlong, malformed and expired cursors',()=>{
 assert.throws(()=>issueSnapshotCursor(anchor,20,20,new Uint8Array(5)));
 assert.throws(()=>issueSnapshotCursor(anchor,-1,20,key));
 assert.throws(()=>issueSnapshotCursor(anchor,45,20,key));
 assert.throws(()=>inspectSnapshotCursor('?',query,actor,key,now));
 assert.throws(()=>verifyCompleteSnapshotPages([]));
});

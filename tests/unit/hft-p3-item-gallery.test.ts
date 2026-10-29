/** Synthetic contracts; real DB and media acceptance remain NOT RUN. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateMasterRequest} from '../../lib/hft/masters/p3-contract.ts';
import {handleP3MasterRequest} from '../../lib/hft/masters/p3-service.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';
import type {PgPool} from '../../lib/hft/persistence/isolated-pg-transaction.ts';
import {validateItemGalleryRequest,parseScopedItemGallery,
 publicItemGallery,readApprovedHftPhoto} from '../../lib/hft/masters/p3-item-gallery.ts';
const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
const itemCode='ITEM1',mediaId='11111111-1111-4111-8111-111111111111';
const photo={mediaId,versionCode:'V1',role:'PRIMARY',mimeType:'image/png',
 sha256:'a'.repeat(64),rightsEvidenceSha256:'b'.repeat(64),
 byteSize:128,width:640,height:480,source:'HFT_CAPTURE',
 storageKey:'hft-item-media/HFT/ITEM1/V1/media-001.png',verification:'APPROVED'};
const version=(patch:Record<string,unknown>={})=>({
 versionCode:'V1',state:'RETIRED',linkedCount:1,primaryLinkedCount:1,
 approvedCount:1,approvedPrimaryCount:1,photos:[photo],...patch
});
const response=(versions:unknown[],patch:Record<string,unknown>={})=>({
 state:'AVAILABLE',records:[{legal_entity_id:'HFT',site_id:'',warehouse_id:'',
  kind:'ITEM',record_id:itemCode,versions,...patch}]
});
test('ITEM_GALLERY is exact signed Item lookup, never Employee or arbitrary scope',()=>{
 const ok=validateMasterRequest({intent:'ITEM_GALLERY',kind:'ITEM',...scope,
  recordId:itemCode,search:''});
 assert.equal(ok.intent,'ITEM_GALLERY');
 for(const bad of [
  {intent:'ITEM_GALLERY',kind:'EMPLOYEE',...scope,recordId:itemCode,search:''},
  {intent:'ITEM_GALLERY',kind:'ITEM',...scope,search:''},
  {intent:'ITEM_GALLERY',kind:'ITEM',...scope,recordId:itemCode,search:'',role:'ADMIN'}
 ])assert.throws(()=>validateMasterRequest(bad));
});
test('photo API request has exact action, scope and version/media identity',()=>{
 assert.equal(validateItemGalleryRequest({action:'LIST',...scope,itemCode}).action,'LIST');
 assert.equal(validateItemGalleryRequest({action:'PHOTO',...scope,itemCode,
  versionCode:'V1',mediaId}).mediaId,mediaId);
 for(const bad of [
  {action:'LIST',...scope,itemCode,mediaId},
  {action:'PHOTO',...scope,itemCode,versionCode:'V1'},
  {action:'PHOTO',...scope,itemCode,versionCode:'../../DD',mediaId}
 ])assert.throws(()=>validateItemGalleryRequest(bad));
});
test('retired version stays in HFT census and approved primary is complete',()=>{
 const g=parseScopedItemGallery(response([version()]),scope,itemCode);
 assert.equal(g.status,'COMPLETE');
 assert.equal(g.versions[0].state,'RETIRED');
 assert.equal(g.versions[0].approvedPhotoCount,1);
 assert.ok(!JSON.stringify(publicItemGallery(g)).includes('storageKey'));
});
test('missing primary is not pending and unverified primary is not complete',()=>{
 const missing=parseScopedItemGallery(response([version({
  primaryLinkedCount:0,approvedPrimaryCount:0,
  photos:[{...photo,role:'SIDE'}]
 })]),scope,itemCode);
 assert.equal(missing.versions[0].status,'MISSING_PRIMARY');
 const pending=parseScopedItemGallery(response([version({
  approvedCount:0,approvedPrimaryCount:0,photos:[]
 })]),scope,itemCode);
 assert.equal(pending.versions[0].status,'PENDING_VERIFICATION');
 assert.equal(pending.status,'INCOMPLETE');
});
test('unknown history, oversized census, counter forgery and cross-scope fail closed',()=>{
 assert.throws(()=>parseScopedItemGallery(response([]),scope,itemCode),
 /P3_GALLERY_CENSUS_UNQUALIFIED/);
 assert.throws(()=>parseScopedItemGallery(response([version()],{legal_entity_id:'DDL'}),
 scope,itemCode),/P3_GALLERY_DATABASE_SCOPE_MISMATCH/);
 assert.throws(()=>parseScopedItemGallery(response([version({approvedCount:2})]),
 scope,itemCode),/P3_GALLERY_COUNTER_MISMATCH/);
 assert.throws(()=>parseScopedItemGallery(response(
  Array.from({length:501},(_,i)=>version({versionCode:'V'+i}))),scope,itemCode),
 /P3_GALLERY_CENSUS_UNQUALIFIED/);
});
test('wrong version, unverified rights, invalid MIME or storage traversal denied',()=>{
 for(const entry of [
  {...photo,versionCode:'V2'},
  {...photo,verification:'PENDING'},
  {...photo,rightsEvidenceSha256:null},
  {...photo,mimeType:'image/svg+xml'},
  {...photo,storageKey:'hft-item-media/../../outside'},
  {...photo,mediaId:123}
 ])assert.throws(()=>parseScopedItemGallery(response([version({photos:[entry]})]),
 scope,itemCode));
});
test('not found photo or unqualified HFT-owned root never yields image bytes',async()=>{
 const g=parseScopedItemGallery(response([version()]),scope,itemCode);
 await assert.rejects(readApprovedHftPhoto(g,'V2',mediaId,undefined),
 /P3_GALLERY_PHOTO_NOT_APPROVED_FOR_VERSION/);
 await assert.rejects(readApprovedHftPhoto(g,'V1',mediaId,undefined),
 /P3_GALLERY_HFT_MEDIA_ROOT_NOT_QUALIFIED/);
 await assert.rejects(readApprovedHftPhoto(g,'V1',mediaId,'/'),
 /P3_GALLERY_HFT_MEDIA_ROOT_NOT_QUALIFIED/);
});

test('generic Masters handler refuses storage-bearing gallery intent before DB',async()=>{
 const pool:PgPool={async connect(){throw new Error('UNEXPECTED_DATABASE_CONNECTION');}};
 await assert.rejects(handleP3MasterRequest(pool,{},verifiedFixtureOperator(),{
  intent:'ITEM_GALLERY',kind:'ITEM',...scope,recordId:itemCode,search:''
 }),/P3_ITEM_GALLERY_DEDICATED_ROUTE_REQUIRED/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {evaluateHftItemVersionPhotos,requireCompleteHftItemVersionPhotos,verifyHftItemPhotoBytes,
  type HftItemPhotoAsset,type HftItemVersion,type HftItemVersionPhotoLink} from '../../lib/hft/domain/item-version-photo.ts';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const bytes=Buffer.from('synthetic HFT product photo bytes');
const item='BATTERY',legal='HFT';
const version=(code:string,state:HftItemVersion['state']='ACTIVE'):HftItemVersion=>
  ({legalEntityId:legal,itemCode:item,versionCode:code,state});
const asset=(code:string,id:string,patch:Partial<HftItemPhotoAsset>={}):HftItemPhotoAsset=>({
  legalEntityId:legal,itemCode:item,capturedVersionCode:code,mediaId:id,
  sha256:sha('synthetic HFT product photo bytes'),mimeType:'image/jpeg',byteSize:bytes.length,
  width:1000,height:700,storageKey:`hft-item-media/HFT/BATTERY/${code}/${id}.jpg`,
  source:'HFT_CAPTURE',rightsEvidenceSha256:sha('HFT approved rights'),verification:'APPROVED',...patch
});
const link=(code:string,id:string,role:HftItemVersionPhotoLink['role']='PRIMARY'):
  HftItemVersionPhotoLink=>({legalEntityId:legal,itemCode:item,versionCode:code,mediaId:id,role});
const run=(vs:readonly HftItemVersion[],ps:readonly HftItemPhotoAsset[],ls:readonly HftItemVersionPhotoLink[])=>
  evaluateHftItemVersionPhotos(vs,ps,ls);

test('one version, approved primary and additional detail complete',()=>{
  const r=run([version('V1')],[asset('V1','A1'),asset('V1','A2')],[link('V1','A1'),link('V1','A2','DETAIL')]);
  assert.equal(r[0].status,'COMPLETE');assert.equal(r[0].approvedPhotoCount,2);
  assert.equal(r[0].approvedPrimaryMediaId,'A1');assert.doesNotThrow(()=>requireCompleteHftItemVersionPhotos(r));
});
test('all historical, current and draft product versions require photos',()=>{
  const r=run([version('V1','RETIRED'),version('V2'),version('V3','DRAFT')],
    [asset('V1','A1'),asset('V2','A2'),asset('V3','A3')],
    [link('V1','A1'),link('V2','A2'),link('V3','A3')]);
  assert.deepEqual(r.map(x=>x.status),['COMPLETE','COMPLETE','COMPLETE']);
});
test('retired version missing photo is not silently covered by latest version',()=>{
  const r=run([version('V1','RETIRED'),version('V2')],[asset('V2','A2')],[link('V2','A2')]);
  assert.deepEqual(r.map(x=>x.status),['MISSING_PRIMARY','COMPLETE']);
  assert.throws(()=>requireCompleteHftItemVersionPhotos(r),/ITEM_ALL_VERSIONS_PHOTO_COVERAGE_INCOMPLETE/);
});
test('draft version is still counted in coverage census',()=>{
  const r=run([version('V1','DRAFT')],[],[]);
  assert.equal(r[0].status,'MISSING_PRIMARY');
});
test('no authoritative version rows fails rather than asserting coverage',()=>{
  assert.throws(()=>run([],[],[]),/ITEM_VERSION_CENSUS_REQUIRED/);
});
test('duplicate version rows rejected',()=>{
  assert.throws(()=>run([version('V1'),version('V1')],[],[]),/ITEM_VERSION_DUPLICATE/);
});
test('two distinct primary photos for one version rejected',()=>{
  assert.throws(()=>run([version('V1')],[asset('V1','A1'),asset('V1','A2')],
    [link('V1','A1'),link('V1','A2')]),/PHOTO_DUPLICATE_PRIMARY/);
});
test('asset captured for V1 cannot be silently linked to V2',()=>{
  assert.throws(()=>run([version('V1'),version('V2')],[asset('V1','A1')],[link('V2','A1')]),
    /PHOTO_VERSION_ASSOCIATION_MISMATCH/);
});
test('cross-legal-entity photo cannot be attached to HFT Item Master',()=>{
  assert.throws(()=>run([version('V1')],[asset('V1','A1',{legalEntityId:'DDL'})],
    [link('V1','A1')]),/PHOTO_ASSET_SCOPE_MISMATCH/);
});
test('unknown media or unregistered version links rejected',()=>{
  assert.throws(()=>run([version('V1')],[],[link('V1','A1')]),/PHOTO_LINK_ASSET_NOT_FOUND/);
  assert.throws(()=>run([version('V1')],[],[link('V2','A1')]),/PHOTO_LINK_VERSION_NOT_FOUND/);
});
test('unverified rights or media approval never counts as completed photo',()=>{
  const r=run([version('V1')],[asset('V1','A1',{source:'DD_CODE_ASSET_COPY',
    rightsEvidenceSha256:null,verification:'PENDING'})],[link('V1','A1')]);
  assert.equal(r[0].status,'PENDING_VERIFICATION');
  assert.throws(()=>requireCompleteHftItemVersionPhotos(r),/INCOMPLETE/);
});
test('DD photo copy with approved rights and explicit version maps only to that version',()=>{
  const r=run([version('V1'),version('V2')],
    [asset('V1','A1',{source:'DD_CODE_ASSET_COPY'})],[link('V1','A1')]);
  assert.deepEqual(r.map(x=>x.status),['COMPLETE','MISSING_PRIMARY']);
});
test('invalid SHA or unsafe media storage metadata rejected',()=>{
  assert.throws(()=>run([version('V1')],[asset('V1','A1',{sha256:'not-sha'})],[link('V1','A1')]),
    /PHOTO_SHA256_INVALID/);
  assert.throws(()=>run([version('V1')],[asset('V1','A1',{storageKey:'../../etc/passwd'})],[link('V1','A1')]),
    /PHOTO_HFT_STORAGE_KEY_REQUIRED/);
});
test('image bytes match approved SHA-256 and size',()=>{
  assert.doesNotThrow(()=>verifyHftItemPhotoBytes(asset('V1','A1'),bytes));
});
test('altered media bytes are rejected even if metadata says APPROVED',()=>{
  const altered=Buffer.from('synthetic HFT product photo bytez');
  assert.throws(()=>verifyHftItemPhotoBytes(asset('V1','A1'),altered),/PHOTO_BYTES_SHA256_MISMATCH/);
});
test('duplicate photo links rejected',()=>{
  assert.throws(()=>run([version('V1')],[asset('V1','A1')],[link('V1','A1'),link('V1','A1','FRONT')]),
    /PHOTO_LINK_DUPLICATE/);
});
test('invalid MIME type and oversize file are rejected',()=>{
  assert.throws(()=>run([version('V1')],[asset('V1','A1',{mimeType:'text/html' as HftItemPhotoAsset['mimeType']})],
    [link('V1','A1')]),/PHOTO_MIME_INVALID/);
  assert.throws(()=>run([version('V1')],[asset('V1','A1',{byteSize:25_000_000})],[link('V1','A1')]),/PHOTO_SIZE_INVALID/);
});

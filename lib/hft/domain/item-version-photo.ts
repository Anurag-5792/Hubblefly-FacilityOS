/**
 * HFT R1 Item Master version-photograph SOURCE CONTRACT (nonproduction).
 *
 * Every recorded HFT product version (including superseded/retired versions)
 * needs an independently verified, version-specific PRIMARY photograph.
 * Item Master optimistic record revision is NOT product version identity.
 *
 * This module performs pure checks only. It does not read DD services, import
 * images, approve media, change an Item Master, or grant stock authority.
 */
import {createHash} from 'node:crypto';

export type HftItemVersion = Readonly<{
  legalEntityId: string;
  itemCode: string;
  versionCode: string;
  state: 'DRAFT' | 'ACTIVE' | 'RETIRED';
}>;
export type HftItemPhotoAsset = Readonly<{
  mediaId: string;
  legalEntityId: string;
  itemCode: string;
  capturedVersionCode: string;
  sha256: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
  width: number;
  height: number;
  storageKey: string;
  source: 'HFT_CAPTURE' | 'DD_CODE_ASSET_COPY' | 'SUPPLIER';
  rightsEvidenceSha256: string | null;
  verification: 'PENDING' | 'APPROVED' | 'REJECTED';
}>;
export type HftItemVersionPhotoLink = Readonly<{
  legalEntityId: string;
  itemCode: string;
  versionCode: string;
  mediaId: string;
  role: 'PRIMARY' | 'FRONT' | 'SIDE' | 'BACK' | 'LABEL' | 'DETAIL';
}>;
export type HftItemVersionPhotoCoverage = Readonly<{
  legalEntityId: string;
  itemCode: string;
  versionCode: string;
  state: HftItemVersion['state'];
  status: 'COMPLETE' | 'MISSING_PRIMARY' | 'PENDING_VERIFICATION';
  approvedPhotoCount: number;
  photoCount: number;
  approvedPrimaryMediaId: string | null;
}>;

const identifier=/^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const mediaId=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const digest=/^[0-9a-f]{64}$/;
const allowedMime=new Set(['image/jpeg','image/png','image/webp']);
const allowedRoles=new Set(['PRIMARY','FRONT','SIDE','BACK','LABEL','DETAIL']);
const allowedSources=new Set(['HFT_CAPTURE','DD_CODE_ASSET_COPY','SUPPLIER']);
const allowedStates=new Set(['DRAFT','ACTIVE','RETIRED']);
const allowedVerification=new Set(['PENDING','APPROVED','REJECTED']);
const versionKey=(v:Readonly<{legalEntityId:string;itemCode:string;versionCode:string}>)=>
  JSON.stringify([v.legalEntityId,v.itemCode,v.versionCode]);
const assetKey=(entity:string,id:string)=>JSON.stringify([entity,id]);
function assertIdentifier(value:string,code:string):void{
  if(typeof value!=='string'||!identifier.test(value))throw new Error(code);
}
function assertAsset(a:HftItemPhotoAsset):void{
  assertIdentifier(a.legalEntityId,'PHOTO_ENTITY_INVALID');
  assertIdentifier(a.itemCode,'PHOTO_ITEM_INVALID');
  assertIdentifier(a.capturedVersionCode,'PHOTO_CAPTURE_VERSION_INVALID');
  if(typeof a.mediaId!=='string'||!mediaId.test(a.mediaId))throw new Error('PHOTO_MEDIA_ID_INVALID');
  if(typeof a.sha256!=='string'||!digest.test(a.sha256))throw new Error('PHOTO_SHA256_INVALID');
  if(typeof a.rightsEvidenceSha256!=='string' && a.rightsEvidenceSha256!==null)
    throw new Error('PHOTO_RIGHTS_EVIDENCE_INVALID');
  if(a.rightsEvidenceSha256!==null&&!digest.test(a.rightsEvidenceSha256))
    throw new Error('PHOTO_RIGHTS_EVIDENCE_INVALID');
  if(!allowedMime.has(a.mimeType))throw new Error('PHOTO_MIME_INVALID');
  if(!Number.isSafeInteger(a.byteSize)||a.byteSize<1||a.byteSize>15_000_000)
    throw new Error('PHOTO_SIZE_INVALID');
  if(!Number.isSafeInteger(a.width)||!Number.isSafeInteger(a.height)||
      a.width<128||a.height<128||a.width>10000||a.height>10000)
    throw new Error('PHOTO_DIMENSIONS_INVALID');
  if(typeof a.storageKey!=='string'||!/^hft-item-media\/[A-Za-z0-9._/-]{8,240}$/.test(a.storageKey)||
      a.storageKey.includes('..')||a.storageKey.includes('//'))
    throw new Error('PHOTO_HFT_STORAGE_KEY_REQUIRED');
  if(!allowedSources.has(a.source))throw new Error('PHOTO_SOURCE_INVALID');
  if(!allowedVerification.has(a.verification))throw new Error('PHOTO_VERIFICATION_INVALID');
}
/** Check actual photo bytes as part of HFT-owned media intake; metadata alone is insufficient. */
export function verifyHftItemPhotoBytes(asset:HftItemPhotoAsset,bytes:Uint8Array):void{
  assertAsset(asset);
  if(!(bytes instanceof Uint8Array)||bytes.byteLength!==asset.byteSize)
    throw new Error('PHOTO_BYTES_SIZE_MISMATCH');
  if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)
    throw new Error('PHOTO_BYTES_SHA256_MISMATCH');
}
/**
 * Evaluate every authoritative product-version row, including retired rows.
 * Invalid cross-entity, wrong-version or duplicate links throw; missing
 * photographs produce explicit incomplete results, never an invented image.
 * The supplied version rows must come from an approved, complete HFT version
 * registry; callers cannot claim coverage by omitting historical versions.
 */
export function evaluateHftItemVersionPhotos(
  versions:readonly HftItemVersion[],
  assets:readonly HftItemPhotoAsset[],
  links:readonly HftItemVersionPhotoLink[],
):readonly HftItemVersionPhotoCoverage[]{
  if(!Array.isArray(versions)||versions.length===0)
    throw new Error('ITEM_VERSION_CENSUS_REQUIRED');
  const scope={legalEntityId:versions[0].legalEntityId,itemCode:versions[0].itemCode};
  const versionsByKey=new Map<string,HftItemVersion>();
  for(const v of versions){
    assertIdentifier(v.legalEntityId,'ITEM_VERSION_ENTITY_INVALID');
    assertIdentifier(v.itemCode,'ITEM_VERSION_ITEM_INVALID');
    assertIdentifier(v.versionCode,'ITEM_VERSION_CODE_INVALID');
    if(!allowedStates.has(v.state))throw new Error('ITEM_VERSION_STATE_INVALID');
    if(v.legalEntityId!==scope.legalEntityId||v.itemCode!==scope.itemCode)
      throw new Error('ITEM_VERSION_SCOPE_MISMATCH');
    const key=versionKey(v);
    if(versionsByKey.has(key))throw new Error('ITEM_VERSION_DUPLICATE');
    versionsByKey.set(key,v);
  }
  const assetMap=new Map<string,HftItemPhotoAsset>();
  for(const a of assets){
    assertAsset(a);
    if(a.legalEntityId!==scope.legalEntityId||a.itemCode!==scope.itemCode)
      throw new Error('PHOTO_ASSET_SCOPE_MISMATCH');
    if(!versionsByKey.has(versionKey({...scope,versionCode:a.capturedVersionCode})))
      throw new Error('PHOTO_CAPTURE_VERSION_UNREGISTERED');
    const key=assetKey(a.legalEntityId,a.mediaId);
    if(assetMap.has(key))throw new Error('PHOTO_MEDIA_ID_DUPLICATE');
    assetMap.set(key,a);
  }
  const linkedByVersion=new Map<string,{asset:HftItemPhotoAsset;role:HftItemVersionPhotoLink['role']}[]>();
  const seenLinks=new Set<string>();
  const primaryVersions=new Set<string>();
  for(const l of links){
    assertIdentifier(l.legalEntityId,'PHOTO_LINK_ENTITY_INVALID');
    assertIdentifier(l.itemCode,'PHOTO_LINK_ITEM_INVALID');
    assertIdentifier(l.versionCode,'PHOTO_LINK_VERSION_INVALID');
    if(!allowedRoles.has(l.role))throw new Error('PHOTO_ROLE_INVALID');
    const key=versionKey(l);
    if(!versionsByKey.has(key))throw new Error('PHOTO_LINK_VERSION_NOT_FOUND');
    if(l.legalEntityId!==scope.legalEntityId||l.itemCode!==scope.itemCode)
      throw new Error('PHOTO_LINK_SCOPE_MISMATCH');
    const asset=assetMap.get(assetKey(l.legalEntityId,l.mediaId));
    if(!asset)throw new Error('PHOTO_LINK_ASSET_NOT_FOUND');
    if(asset.capturedVersionCode!==l.versionCode)
      throw new Error('PHOTO_VERSION_ASSOCIATION_MISMATCH');
    const linkId=JSON.stringify([key,l.mediaId]);
    if(seenLinks.has(linkId))throw new Error('PHOTO_LINK_DUPLICATE');
    seenLinks.add(linkId);
    if(l.role==='PRIMARY'){
      if(primaryVersions.has(key))throw new Error('PHOTO_DUPLICATE_PRIMARY');
      primaryVersions.add(key);
    }
    const byVersion=linkedByVersion.get(key)||[];
    byVersion.push({asset,role:l.role});linkedByVersion.set(key,byVersion);
  }
  return Object.freeze(versions.map(v=>{
    const found=linkedByVersion.get(versionKey(v))||[];
    const approved=found.filter(x=>x.asset.verification==='APPROVED'&&x.asset.rightsEvidenceSha256!==null);
    const primary=approved.find(x=>x.role==='PRIMARY');
    const status:HftItemVersionPhotoCoverage['status']=primary?'COMPLETE':
      found.some(x=>x.role==='PRIMARY')?'PENDING_VERIFICATION':'MISSING_PRIMARY';
    return Object.freeze({legalEntityId:v.legalEntityId,itemCode:v.itemCode,versionCode:v.versionCode,
      state:v.state,status,approvedPhotoCount:approved.length,photoCount:found.length,
      approvedPrimaryMediaId:primary?.asset.mediaId??null});
  }));
}
export function requireCompleteHftItemVersionPhotos(coverage:readonly HftItemVersionPhotoCoverage[]):void{
  if(!Array.isArray(coverage)||coverage.length===0||coverage.some(x=>x.status!=='COMPLETE'))
    throw new Error('ITEM_ALL_VERSIONS_PHOTO_COVERAGE_INCOMPLETE');
}

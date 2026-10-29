/** HFT-owned Item product-version photo gallery; no DD runtime or stock writes.
 * P3 signed-session + DB verified scope is required before ANY metadata
 * or photograph is returned. No raw storage key is sent to the client.
 */
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,realpath} from 'node:fs/promises';
import {isAbsolute,parse,relative,resolve,sep} from 'node:path';
import {evaluateHftItemVersionPhotos,type HftItemVersion,
 type HftItemPhotoAsset,type HftItemVersionPhotoLink} from '../domain/item-version-photo.ts';
import type {MasterScope} from './p3-contract.ts';

export type ItemGalleryRequest=Readonly<MasterScope&{
 action:'LIST'|'PHOTO';itemCode:string;versionCode?:string;mediaId?:string;
}>;
export type VerifiedGalleryPhoto=Readonly<{
 mediaId:string;versionCode:string;role:'PRIMARY'|'FRONT'|'BACK'|'SIDE'|'LABEL'|'DETAIL';
 mimeType:'image/jpeg'|'image/png'|'image/webp';sha256:string;
 byteSize:number;width:number;height:number;source:HftItemPhotoAsset['source'];
 rightsEvidenceSha256:string;storageKey:string;
}>;
export type VerifiedVersion=Readonly<{
 versionCode:string;state:HftItemVersion['state'];
 status:'COMPLETE'|'MISSING_PRIMARY'|'PENDING_VERIFICATION';
 approvedPhotoCount:number;photoCount:number;photos:readonly VerifiedGalleryPhoto[];
}>;
export type VerifiedItemGallery=Readonly<MasterScope&{
 itemCode:string;status:'COMPLETE'|'INCOMPLETE';versions:readonly VerifiedVersion[];
}>;
const id=/^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const media=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const digest=/^[0-9a-f]{64}$/;
const roles=new Set(['PRIMARY','FRONT','BACK','SIDE','LABEL','DETAIL']);
const mimeTypes=new Set(['image/jpeg','image/png','image/webp']);
const sources=new Set(['HFT_CAPTURE','DD_CODE_ASSET_COPY','SUPPLIER']);
const states=new Set(['DRAFT','ACTIVE','RETIRED']);
function record(v:unknown,code:string):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw new Error(code);
 return v as Record<string,unknown>;
}
function exact(v:Record<string,unknown>,names:readonly string[]):void{
 if(Object.keys(v).length!==names.length||names.some(k=>!Object.hasOwn(v,k)))
  throw new Error('P3_GALLERY_REQUEST_SHAPE_INVALID');
}
function identity(v:unknown,code:string):string{
 if(typeof v!=='string'||!id.test(v))throw new Error(code);
 return v;
}
function str(v:unknown,code:string):string{
 if(typeof v!=='string'||v.length===0||v.length>255)throw new Error(code);
 return v;
}
function count(v:unknown,code:string):number{
 if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw new Error(code);
 return v;
}
export function validateItemGalleryRequest(value:unknown):ItemGalleryRequest{
 const x=record(value,'P3_GALLERY_REQUEST_REQUIRED');
 if(x.action!=='LIST'&&x.action!=='PHOTO')throw new Error('P3_GALLERY_ACTION_INVALID');
 const action=x.action as ItemGalleryRequest['action'];
 exact(x,action==='LIST'?
 ['action','legalEntityId','siteId','warehouseId','itemCode']:
 ['action','legalEntityId','siteId','warehouseId','itemCode','versionCode','mediaId']);
 const base={action,legalEntityId:identity(x.legalEntityId,'P3_GALLERY_ENTITY_INVALID'),
  siteId:identity(x.siteId,'P3_GALLERY_SITE_INVALID'),
  warehouseId:identity(x.warehouseId,'P3_GALLERY_WAREHOUSE_INVALID'),
  itemCode:identity(x.itemCode,'P3_GALLERY_ITEM_INVALID')};
 if(action==='LIST')return Object.freeze(base);
 if(typeof x.mediaId!=='string'||!media.test(x.mediaId))
  throw new Error('P3_GALLERY_MEDIA_INVALID');
 return Object.freeze({...base,versionCode:identity(x.versionCode,'P3_GALLERY_VERSION_INVALID'),
  mediaId:x.mediaId});
}
function parsePhoto(x:unknown,versionCode:string):VerifiedGalleryPhoto{
 const p=record(x,'P3_GALLERY_PHOTO_SHAPE_INVALID');
 if(p.versionCode!==versionCode||!media.test(String(p.mediaId))||
  !roles.has(String(p.role))||!mimeTypes.has(String(p.mimeType))||
  !sources.has(String(p.source))||p.verification!=='APPROVED'||
  !digest.test(String(p.sha256))||!digest.test(String(p.rightsEvidenceSha256)))
  throw new Error('P3_GALLERY_PHOTO_PROVENANCE_INVALID');
 const byteSize=count(p.byteSize,'P3_GALLERY_PHOTO_SIZE_INVALID');
 const width=count(p.width,'P3_GALLERY_PHOTO_DIMENSION_INVALID');
 const height=count(p.height,'P3_GALLERY_PHOTO_DIMENSION_INVALID');
 const key=str(p.storageKey,'P3_GALLERY_STORAGE_REFERENCE_INVALID');
 if(!/^hft-item-media\/[A-Za-z0-9._/-]{8,240}$/.test(key)||
  key.includes('..')||key.includes('//'))
  throw new Error('P3_GALLERY_STORAGE_REFERENCE_INVALID');
 return Object.freeze({
  mediaId:String(p.mediaId),versionCode,role:p.role as VerifiedGalleryPhoto['role'],
  mimeType:p.mimeType as VerifiedGalleryPhoto['mimeType'],sha256:String(p.sha256),
  byteSize,width,height,source:p.source as HftItemPhotoAsset['source'],
  rightsEvidenceSha256:String(p.rightsEvidenceSha256),storageKey:key
 });
}
/** This is a second defensive boundary after PostgreSQL's signed scope read.
 * The returned row must include *every* authoritative version, never a
 * truncated list. Censuses with zero or more than 500 versions deny.
 */
export function parseScopedItemGallery(response:unknown,scope:MasterScope,
 itemCode:string):VerifiedItemGallery{
 identity(itemCode,'P3_GALLERY_ITEM_INVALID');
 const r=record(response,'P3_GALLERY_DATABASE_RESPONSE_INVALID');
 if(r.state!=='AVAILABLE'||!Array.isArray(r.records)||r.records.length!==1)
  throw new Error('P3_GALLERY_DATABASE_RESPONSE_INVALID');
 const row=record(r.records[0],'P3_GALLERY_DATABASE_ROW_INVALID');
 if(row.legal_entity_id!==scope.legalEntityId||row.kind!=='ITEM'||
  row.record_id!==itemCode||row.site_id!==''||row.warehouse_id!=='')
  throw new Error('P3_GALLERY_DATABASE_SCOPE_MISMATCH');
 const versionsRaw=row.versions;
 if(!Array.isArray(versionsRaw)||versionsRaw.length===0||versionsRaw.length>500)
  throw new Error('P3_GALLERY_CENSUS_UNQUALIFIED');
 const versions:HftItemVersion[]=[];
 const assets:HftItemPhotoAsset[]=[];
 const links:HftItemVersionPhotoLink[]=[];
 const details:{versionCode:string;state:VerifiedVersion['state'];linked:number;approved:number;primary:number;photos:VerifiedGalleryPhoto[]}[]=[];
 const seen=new Set<string>();
 for(const input of versionsRaw){
  const v=record(input,'P3_GALLERY_VERSION_SHAPE_INVALID');
  const code=identity(v.versionCode,'P3_GALLERY_VERSION_INVALID');
  if(seen.has(code)||!states.has(String(v.state)))throw new Error('P3_GALLERY_VERSION_DUPLICATE_OR_STATE');
  seen.add(code);
  const linked=count(v.linkedCount,'P3_GALLERY_LINK_COUNT_INVALID');
  const approved=count(v.approvedCount,'P3_GALLERY_APPROVED_COUNT_INVALID');
  const primary=count(v.approvedPrimaryCount,'P3_GALLERY_PRIMARY_COUNT_INVALID');
  if(linked<approved||primary>1||primary>approved||!Array.isArray(v.photos)||
    v.photos.length!==approved||v.photos.length>100)
   throw new Error('P3_GALLERY_COUNTER_MISMATCH');
  const photos=v.photos.map(p=>parsePhoto(p,code));
  const version: HftItemVersion={legalEntityId:scope.legalEntityId,
   itemCode,versionCode:code,state:v.state as HftItemVersion['state']};
  versions.push(version);
  details.push({versionCode:code,state:version.state,linked,approved,primary,photos});
  for(const p of photos){
   assets.push({mediaId:p.mediaId,legalEntityId:scope.legalEntityId,itemCode,
    capturedVersionCode:code,sha256:p.sha256,mimeType:p.mimeType,
    byteSize:p.byteSize,width:p.width,height:p.height,storageKey:p.storageKey,
    source:p.source,rightsEvidenceSha256:p.rightsEvidenceSha256,verification:'APPROVED'});
   links.push({legalEntityId:scope.legalEntityId,itemCode,versionCode:code,
    mediaId:p.mediaId,role:p.role});
  }
 }
 // Reuse the existing HFT pure validator: it rejects cross-version links,
 // malformed media metadata and duplicate PRIMARY or media identities.
 const verified=evaluateHftItemVersionPhotos(versions,assets,links);
 const result:VerifiedVersion[]=details.map((v,i)=>{
  const status=verified[i].approvedPrimaryMediaId?'COMPLETE':
   v.linked>0?'PENDING_VERIFICATION':'MISSING_PRIMARY';
  if(verified[i].approvedPhotoCount!==v.approved||
    (verified[i].approvedPrimaryMediaId?1:0)!==v.primary)
   throw new Error('P3_GALLERY_PRIMARY_EVIDENCE_MISMATCH');
  return Object.freeze({versionCode:v.versionCode,state:v.state,status,
   approvedPhotoCount:v.approved,photoCount:v.linked,photos:Object.freeze(v.photos)});
 });
 return Object.freeze({...scope,itemCode,status:result.every(v=>v.status==='COMPLETE')?
  'COMPLETE' as const:'INCOMPLETE' as const,versions:Object.freeze(result)});
}
/** Storage keys never leave the server; rights and verification have already
 * been checked and cannot be inferred from filenames or QR labels. */
export function publicItemGallery(gallery:VerifiedItemGallery){
 return {itemCode:gallery.itemCode,status:gallery.status,
  versions:gallery.versions.map(v=>({
    versionCode:v.versionCode,state:v.state,status:v.status,
    approvedPhotoCount:v.approvedPhotoCount,photoCount:v.photoCount,
    photos:v.photos.map(p=>({mediaId:p.mediaId,versionCode:p.versionCode,
     role:p.role,mimeType:p.mimeType,sha256:p.sha256,
     width:p.width,height:p.height,source:p.source}))
  }))};
}
function assertImageMagic(bytes:Buffer,mimeType:VerifiedGalleryPhoto['mimeType']):void{
 if(mimeType==='image/png'){
  if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
   throw new Error('P3_GALLERY_IMAGE_MAGIC_INVALID');
 }else if(mimeType==='image/jpeg'){
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||
    bytes[bytes.length-1]!==217||bytes.includes(Buffer.from('Exif\0\0'),'binary'))
   throw new Error('P3_GALLERY_JPEG_NOT_SANITIZED');
 }else if(bytes.length<12||bytes.toString('ascii',0,4)!=='RIFF'||
  bytes.toString('ascii',8,12)!=='WEBP')throw new Error('P3_GALLERY_WEBP_MAGIC_INVALID');
}
/** HFT-owned local media adapter only, not an uploader.
 * Contents are rehashed before every delivery. Missing root or file denies.
 * Authoritative byte-ingest, malware/EXIF policy and backup need qualification.
 */
export async function readApprovedHftPhoto(gallery:VerifiedItemGallery,
 versionCode:string,mediaId:string,root:string|undefined):Promise<Readonly<{
 bytes:Buffer;mimeType:VerifiedGalleryPhoto['mimeType'];sha256:string
}>>{
 const version=gallery.versions.find(v=>v.versionCode===versionCode);
 const photo=version?.photos.find(p=>p.mediaId===mediaId);
 if(!photo)throw new Error('P3_GALLERY_PHOTO_NOT_APPROVED_FOR_VERSION');
 if(!root||!isAbsolute(root)||resolve(root)===parse(root).root||
  root.toLowerCase().includes('node_modules')||
  root.toLowerCase().includes('public/'))
  throw new Error('P3_GALLERY_HFT_MEDIA_ROOT_NOT_QUALIFIED');
 const base=await realpath(root);
 const absolute=resolve(base,photo.storageKey);
 const rel=relative(base,absolute);
 if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))
  throw new Error('P3_GALLERY_STORAGE_ESCAPE_DENIED');
 const canonical=await realpath(absolute);
 const canonicalRel=relative(base,canonical);
 if(!canonicalRel||canonicalRel==='..'||canonicalRel.startsWith('..'+sep)||isAbsolute(canonicalRel))
  throw new Error('P3_GALLERY_STORAGE_ESCAPE_DENIED');
 const file=await open(absolute,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=await file.stat();
  if(!stat.isFile()||stat.size!==photo.byteSize||stat.size>15_000_000)
   throw new Error('P3_GALLERY_STORAGE_BYTES_MISMATCH');
  const bytes=await file.readFile();
  if(bytes.length!==photo.byteSize||
   createHash('sha256').update(bytes).digest('hex')!==photo.sha256)
   throw new Error('P3_GALLERY_STORAGE_SHA256_MISMATCH');
  assertImageMagic(bytes,photo.mimeType);
  return {bytes,mimeType:photo.mimeType,sha256:photo.sha256};
 }finally{await file.close();}
}

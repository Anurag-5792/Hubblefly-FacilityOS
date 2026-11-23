'use client';
import Link from 'next/link';
/* eslint-disable @next/next/no-img-element -- Blob URLs are identity-scoped,
 * SHA-256 verified HFT-owned image bytes; Next optimizer cannot handle them. */
import {useEffect,useMemo,useState} from 'react';
import {useParams} from 'next/navigation';

type Angle='PRIMARY'|'FRONT'|'BACK'|'SIDE'|'LABEL'|'DETAIL';
type Photo=Readonly<{
 mediaId:string;versionCode:string;role:Angle;mimeType:string;sha256:string;
 width:number;height:number;source:string;
}>;
type Version=Readonly<{
 versionCode:string;state:'DRAFT'|'ACTIVE'|'RETIRED';
 status:'COMPLETE'|'PENDING_VERIFICATION'|'MISSING_PRIMARY';
 approvedPhotoCount:number;photoCount:number;photos:readonly Photo[];
}>;
type Gallery=Readonly<{itemCode:string;status:'COMPLETE'|'INCOMPLETE';versions:readonly Version[]}>;
type JsonReply=Readonly<{state:string;code?:string;gallery?:Gallery}>;
function PhotoTile({photo,scope,itemCode}:{photo:Photo;scope:{
 legalEntityId:string;siteId:string;warehouseId:string};itemCode:string}){
 const [src,setSrc]=useState<string|null>(null);
 const [status,setStatus]=useState('Verified image not loaded');
 useEffect(()=>{
  const abort=new AbortController();let url:string|null=null;
  setSrc(null);setStatus('Verifying approved HFT image bytes');
  void (async()=>{
   try{
    const response=await fetch('/api/hft/items/gallery',{
     method:'POST',headers:{'Content-Type':'application/json'},
     credentials:'same-origin',cache:'no-store',signal:abort.signal,
     body:JSON.stringify({action:'PHOTO',...scope,itemCode,
      versionCode:photo.versionCode,mediaId:photo.mediaId})
    });
    if(!response.ok)throw new Error('Approved image storage unavailable');
    const blob=await response.blob();
    if(!['image/jpeg','image/png','image/webp'].includes(blob.type))
     throw new Error('Verified image content type invalid');
    if(abort.signal.aborted)return;
    url=URL.createObjectURL(blob);setSrc(url);setStatus('Approved image');
   }catch(error){
    if(!abort.signal.aborted)setStatus(error instanceof Error?error.message:'Image not available');
   }
  })();
  return ()=>{abort.abort();if(url)URL.revokeObjectURL(url);};
 },[photo.mediaId,photo.versionCode,itemCode,scope]);
 return <figure className="item-photo-tile">
  {src?<img src={src} alt={photo.role.toLowerCase()+' view of '+itemCode+
   ' product version '+photo.versionCode} loading="lazy" />:
   <div className="item-photo-unavailable" role="status">{status}</div>}
  <figcaption><strong>{photo.role}</strong><span>{photo.width} × {photo.height}</span>
   <span title={photo.sha256}>SHA-256 verified</span></figcaption>
 </figure>;
}
export default function ItemVersionGallery(){
 const params=useParams<{itemCode:string}>();
 const itemCode=String(params.itemCode||'');
 const [legalEntityId,setEntity]=useState(''),[siteId,setSite]=useState(''),
  [warehouseId,setWarehouse]=useState('');
 const [gallery,setGallery]=useState<Gallery|null>(null);
 const [selected,setSelected]=useState(''),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState('No verified item version census loaded.');
 const scope=useMemo(()=>({legalEntityId:legalEntityId.trim(),siteId:siteId.trim(),
  warehouseId:warehouseId.trim()}),[legalEntityId,siteId,warehouseId]);
 const version=gallery?.versions.find(v=>v.versionCode===selected);
 async function load(){
  setBusy(true);setGallery(null);setSelected('');
  setMessage('Checking verified session, HFT version census and photo approvals.');
  try{
   const response=await fetch('/api/hft/items/gallery',{
    method:'POST',headers:{'Content-Type':'application/json'},
    credentials:'same-origin',cache:'no-store',
    body:JSON.stringify({action:'LIST',...scope,itemCode})
   });
   const result=await response.json() as JsonReply;
   if(!response.ok)throw new Error(result.code||'Item version source unavailable');
   if(result.state!=='AVAILABLE'||!result.gallery||
     result.gallery.itemCode!==itemCode||!Array.isArray(result.gallery.versions)||
     result.gallery.versions.length===0)
    throw new Error('Complete authoritative Item version census not verified');
   const data=result.gallery;
   setGallery(data);setSelected(data.versions[0].versionCode);
   setMessage(data.status==='COMPLETE'?
    'Every recorded version has approved primary metadata. Image bytes are separately verified when viewed.':
    'One or more versions lack approved primary metadata. Actual image bytes remain separately verified.');
  }catch(error){setMessage(error instanceof Error?error.message:'Item gallery unavailable');}
  finally{setBusy(false);}
 }
 return <main className="masters-shell">
  <header className="masters-head">
   <div><Link className="mis-link" href="/stores/masters">Item Master</Link>
    <p className="eyebrow">Hubblefly FacilityOS · Item version evidence</p>
    <h1>Product versions · {itemCode}</h1>
    <p>Version identity is separate from the Item Master editing revision.
     Historical and retired versions remain in the census. Only verified HFT-owned
     photographs can appear below.</p></div>
   <Link className="masters-back" href="/stores">Stores</Link>
  </header>
  <section className="panel">
   <div className="panel-heading"><div><p className="eyebrow">Authorized scope</p>
    <h2>Verified version register</h2></div><span className="status">SIGNED READ ONLY</span></div>
   <div className="masters-scope">
    <label>Legal entity ID<input required value={legalEntityId}
     onChange={e=>setEntity(e.target.value)} placeholder="Authorized entity"/></label>
    <label>Site ID<input required value={siteId}
     onChange={e=>setSite(e.target.value)} placeholder="Authorized site"/></label>
    <label>Warehouse ID<input required value={warehouseId}
     onChange={e=>setWarehouse(e.target.value)} placeholder="Authorized warehouse"/></label>
   </div>
   <p className="masters-help">Scope selectors never grant permission. The server validates
    your signed session and current warehouse grant before any data is returned.</p>
   <div className="masters-actions"><button type="button" disabled={busy}
    onClick={()=>void load()}>{busy?'Verifying…':'Load all product versions'}</button></div>
  </section>
  <div role="status" aria-live="polite" className="masters-result">{message}</div>
  {gallery?<section className="item-gallery-layout" aria-label="Item version photograph register">
   <div className="panel"><div className="panel-heading"><h2>Version census</h2>
    <span className="status">{gallery.status}</span></div>
    <p className="masters-help">{gallery.versions.length} authoritative recorded versions.
     No versions are hidden because they are retired.</p>
    <div className="item-version-list">
     {gallery.versions.map(v=><button type="button"
      aria-pressed={selected===v.versionCode}
      className={selected===v.versionCode?'item-version active':'item-version'}
      key={v.versionCode} onClick={()=>setSelected(v.versionCode)}>
      <strong>{v.versionCode}</strong><small>{v.state}</small>
      <span>{v.status.replaceAll('_',' ')}</span></button>)}
    </div>
   </div>
   <div className="panel">
    <div className="panel-heading"><div><p className="eyebrow">Exact manufacturing version</p>
     <h2>{version?.versionCode||'No version selected'}</h2></div>
     <span className="status">{version?.status.replaceAll('_',' ')||'UNAVAILABLE'}</span></div>
    {version?<><p className="masters-help">Approved photographs: {version.approvedPhotoCount}.
     All linked photographs: {version.photoCount}. Unapproved, rejected and revoked images are never displayed.</p>
     {version.photos.length>0?<div className="item-photo-grid">
      {version.photos.map(photo=><PhotoTile
       key={photo.mediaId} photo={photo} itemCode={itemCode} scope={scope}/>)}
     </div>:<div className="item-photo-empty" role="status">
      No approved photographs for this version. An independently verified primary
      image is required before this version can be complete.
     </div>}
     {version.status!=='COMPLETE'?<p className="preview-note">
      This version is incomplete. Upload, verification, replacement and independent
      image approval remain blocked until the governed HFT media service is qualified.</p>:null}
    </>:null}
   </div>
  </section>:null}
 </main>;
}

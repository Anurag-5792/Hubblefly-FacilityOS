'use client';
import {useCallback,useEffect,useState,useRef,type FormEvent} from 'react';
import Link from 'next/link';
import {workspaceView,workspaceViewUrl} from '../../../lib/hft/ui-reuse/workspace-view-state.ts';
import s from '../../masters/live/workspace.module.css';
import {INTAKE_VIEWS,type IntakeView} from '../../../lib/hft/intake/intake-contract.ts';
import {IntakeAccessFence,validIntakeContext,readIntakeMarker,hasOtherIntakeMarkers,persistIntakeMarker,clearIntakeMarker,sameIntakeMarker,type IntakePending,type IntakeTicket} from '../../../lib/hft/intake/intake-client-state.ts';
const names:Record<IntakeView,string>={items:'Item directory',opening:'Opening observations',current:'Current stock sheet',issues:'Issues',hft_issues:'HFT issues',movement_holds:'Movement holds',racks:'Rack levels',positions:'Positions',containers:'Containers',stickers:'Sticker / QR register'};
type PageData={headers:string[];rows:unknown[][];total:number;offset:number;canRename:boolean};
type Pending=IntakePending;
type Edit={itemId:string;revision:number;name:string;original:string;reason:string};
class ApiError extends Error{constructor(public status:number,public code:string){super(code);}}
function obj(x:unknown):Record<string,unknown>{if(!x||typeof x!=='object'||Array.isArray(x))throw Error('INVALID_RESPONSE');return x as Record<string,unknown>;}
function parsePage(x:unknown):PageData{
 const r=obj(x);if(r.classification!=='UNADMITTED_INVENTORY_REVIEW'||!Array.isArray(r.headers)||r.headers.some(h=>typeof h!=='string')||
 !Array.isArray(r.rows)||r.rows.some(v=>!Array.isArray(v))||!Number.isSafeInteger(r.total)||!Number.isSafeInteger(r.offset)||typeof r.canRename!=='boolean')throw Error('INVALID_RESPONSE');
 return {headers:r.headers as string[],rows:r.rows as unknown[][],total:r.total as number,offset:r.offset as number,canRename:r.canRename};
}
function display(v:unknown){return v===null||v===undefined||v===''?'—':typeof v==='object'?JSON.stringify(v):String(v);}
const accessLost=(e:unknown)=>e instanceof ApiError&&(e.status===401||e.status===403);
async function call(payload:unknown,ctx:string,signal?:AbortSignal){
 const response=await fetch('/api/hft/intake',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',...(ctx?{'x-hft-intake-context':ctx}:{})},body:JSON.stringify(payload),signal});
 // Even a non-JSON denial is definitive access loss, not a generic save failure.
 if(response.status===401||response.status===403)throw new ApiError(response.status,'INTAKE_ACCESS_LOST');
 const result=obj(await response.json());
 if(!response.ok)throw new ApiError(response.status,String(result.code||'INTAKE_UNAVAILABLE'));
 if(result.state!=='INVENTORY_REVIEW_RESULT'||!validIntakeContext(result.contextId)||typeof result.expiresAt!=='number'||!Number.isSafeInteger(result.expiresAt)||result.expiresAt<=Date.now()/1000||(ctx&&ctx!==result.contextId))
  throw new ApiError(401,'INTAKE_CONTEXT_CHANGED');
 return {contextId:result.contextId,expiresAt:result.expiresAt,data:result.data};
}
export default function IntakePage(){
 const [view,setView]=useState<IntakeView>('items'),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[offset,setOffset]=useState(0);
 const [data,setData]=useState<PageData|null>(null),[state,setState]=useState<'loading'|'ready'|'signin'|'error'>('loading'),[ctx,setCtx]=useState('');
 const [pending,setPending]=useState<Pending|null>(null),[storage,setStorage]=useState(false),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const [edit,setEdit]=useState<Edit|null>(null),[notice,setNotice]=useState('');
 const [legacyHold,setLegacyHold]=useState(false),[signingOut,setSigningOut]=useState(false);
 const fence=useRef(new IntakeAccessFence()),readAbort=useRef<AbortController|null>(null),opAbort=useRef<AbortController|null>(null);
 const busyRef=useRef(false),closed=useRef(false),logoutRef=useRef(false),logoutUnconfirmed=useRef(false);
 const [expiresAt,setExpiresAt]=useState(0);
 const pageSize=50;
 const [viewReady,setViewReady]=useState(false);
 const dropAccess=useCallback((message='Access ended. Any unconfirmed request remains retained for authorized reconciliation.')=>{
  closed.current=true;fence.current.invalidate();readAbort.current?.abort();opAbort.current?.abort();
  busyRef.current=false;setBusy(false);setCtx('');setExpiresAt(0);setData(null);setPending(null);setEdit(null);
  setStorage(false);setLegacyHold(false);setQuery('');setSearch('');setOffset(0);setNotice(message);setState('signin');
 },[]);
 useEffect(()=>{
  setView(workspaceView(window.location.href,'view',INTAKE_VIEWS,'items'));setViewReady(true);
  const lifetime=fence.current;
  return()=>{lifetime.invalidate();readAbort.current?.abort();opAbort.current?.abort();};
 },[]);
 useEffect(()=>{
  if(!viewReady||closed.current)return;
  const control=new AbortController(),ticket=fence.current.capture();readAbort.current=control;
  setState('loading');setData(null);setPending(null);setEdit(null);setStorage(false);setLegacyHold(false);
  void call({intent:'READ',view,search,offset,limit:pageSize},ticket.contextId,control.signal).then(result=>{
   if(control.signal.aborted||!fence.current.current(ticket))return;
   const p=parsePage(result.data);
   if(!fence.current.admit(ticket,result.contextId,result.expiresAt)){dropAccess();return;}
   setCtx(result.contextId);setExpiresAt(result.expiresAt);setData(p);setState('ready');
   try{setPending(readIntakeMarker(sessionStorage,result.contextId));setLegacyHold(hasOtherIntakeMarkers(sessionStorage,result.contextId));setStorage(true);}
   catch{setPending(null);setStorage(false);}
  }).catch(error=>{
   if(control.signal.aborted||!fence.current.current(ticket))return;
   if(accessLost(error)){dropAccess();return;}
   // Preserve the last verified context for a bound retry; do not silently adopt another identity.
   setData(null);setPending(null);setEdit(null);setStorage(false);setLegacyHold(false);setState('error');
  });
  return()=>control.abort();
 },[viewReady,view,search,offset,reload,dropAccess]);
 useEffect(()=>{
  if(!expiresAt)return;
  const ticket=fence.current.capture();
  const timer=window.setTimeout(()=>{if(fence.current.capture().epoch===ticket.epoch)dropAccess('Your corporate access has expired. Any original request remains retained.');},Math.max(0,expiresAt*1000-Date.now()));
  return()=>window.clearTimeout(timer);
 },[expiresAt,dropAccess]);
 function selectView(v:IntakeView){if(busyRef.current||pending||closed.current)return;window.history.replaceState(window.history.state,'',workspaceViewUrl(window.location.href,'view',v,INTAKE_VIEWS));setEdit(null);setView(v);setQuery('');setSearch('');setOffset(0);setNotice('');}
 function find(e:FormEvent){e.preventDefault();if(busyRef.current||closed.current)return;setEdit(null);setOffset(0);setSearch(query.trim());setReload(x=>x+1);}
 function begin(){if(busyRef.current||closed.current||state!=='ready')return null;const ticket=fence.current.capture();if(!ticket.contextId||!fence.current.current(ticket))return null;
  const control=new AbortController();opAbort.current=control;busyRef.current=true;setBusy(true);return {ticket,control};}
 function end(ticket:IntakeTicket){if(fence.current.current(ticket)){busyRef.current=false;setBusy(false);}}
 function clearPending(p:Pending){clearIntakeMarker(sessionStorage,p);setPending(null);}
 async function save(e:FormEvent){
  e.preventDefault();if(!edit||!data?.canRename||pending||!storage||legacyHold||!ctx)return;
  const name=edit.name.trim(),reason=edit.reason.trim();
  if(!name||name.length>240||reason.length<8||reason.length>300){setNotice('Enter a display name and a change reason of at least eight characters.');return;}
  const op=begin();if(!op)return;const {ticket,control}=op;
  const p:Pending={contextId:ticket.contextId,requestId:crypto.randomUUID(),itemId:edit.itemId,expectedRevision:edit.revision};
  try{persistIntakeMarker(sessionStorage,p);setPending(p);}
  catch{setStorage(false);setNotice('Request tracking unavailable. No change submitted.');end(ticket);return;}
  try{
   const response=await call({intent:'RENAME',requestId:p.requestId,itemId:p.itemId,revision:p.expectedRevision,name,reason},ticket.contextId,control.signal);
   if(control.signal.aborted||!fence.current.current(ticket))return;
   const r=obj(response.data);
   if(r.state!=='RECORDED'||r.requestId!==p.requestId||r.itemId!==p.itemId||r.revision!==p.expectedRevision+1||r.name!==name)throw Error('UNCONFIRMED');
   clearPending(p);setEdit(null);setNotice('Name saved and verified. The original source name is unchanged.');setReload(x=>x+1);
  }catch(err){
   if(control.signal.aborted||!fence.current.current(ticket))return;
   if(accessLost(err)){dropAccess();return;}
   if(err instanceof ApiError&&err.code==='INTAKE_RENAME_REJECTED'){try{clearPending(p);setNotice('Change rejected. Refresh and check the current record.');}catch{setStorage(false);}}
   else{setNotice('Save outcome not confirmed. Check the original request before making another change.');}
  }finally{end(ticket);}
 }
 async function reconcile(){
  if(!pending||!ctx||!storage)return;
  const op=begin();if(!op)return;const {ticket,control}=op;
  try{
   try{if(!sameIntakeMarker(readIntakeMarker(sessionStorage,ticket.contextId),pending))throw Error('MARKER_CHANGED');}
   catch{setStorage(false);throw Error('MARKER_UNAVAILABLE');}
   const r=obj((await call({intent:'RECONCILE',requestId:pending.requestId},ticket.contextId,control.signal)).data);
   if(control.signal.aborted||!fence.current.current(ticket))return;
   if(r.state==='RECORDED'&&r.requestId===pending.requestId&&r.itemId===pending.itemId&&r.revision===pending.expectedRevision+1){
    clearPending(pending);setEdit(null);setNotice('The original change is recorded.');setReload(x=>x+1);
   }else setNotice('No committed result found. Request remains held for review; do not submit it again.');
  }catch(err){if(!control.signal.aborted&&fence.current.current(ticket)){
   if(accessLost(err))dropAccess();else setNotice('Reconciliation unavailable. Original request remains held.');
  }}finally{end(ticket);}
 }
 async function signOut(){
  if(logoutRef.current)return;logoutRef.current=true;setSigningOut(true);
  // Clear before the network call, including while a READ or mutation is in flight.
  logoutUnconfirmed.current=true;dropAccess('Signed out of this workspace. Original requests remain retained.');
  try{const r=await fetch('/api/hft/live-masters/signout',{method:'POST',credentials:'same-origin',cache:'no-store'});
   if(!r.ok||obj(await r.json()).state!=='SIGNED_OUT')throw Error('SIGNOUT_FAILED');logoutUnconfirmed.current=false;
  }catch{setNotice('Sign-out could not be confirmed by the server. Retry sign-out before continuing.');}
  finally{logoutRef.current=false;setSigningOut(false);}
 }
 function refreshConnection(){if(logoutRef.current||logoutUnconfirmed.current)return;closed.current=false;setNotice('');setReload(x=>x+1);}
 return <div className={s.shell}>
  <aside className={s.sidebar}><div className={s.brand}><div className={s.brandMark}>H</div><div><strong>HUBBLEFLY</strong><span>HFT-OS</span></div></div>
   <div className={s.sideCaption}>STORES · INVENTORY REVIEW</div>
   {state==='ready'&&<nav className={s.navigation} aria-label="Inventory registers">{INTAKE_VIEWS.map(v=><button type="button" key={v} disabled={busy||!!pending||state!=='ready'} aria-current={v===view?'page':undefined} className={v===view?s.navSelected:s.navButton} onClick={()=>selectView(v)}>{names[v]}</button>)}</nav>}
   <div className={s.sidebarBottom}><Link className={s.navButton} href="/masters/live">Masters workspace</Link><span>Stock posting not enabled</span></div>
  </aside>
  <div className={s.main}><header className={s.topbar}><div className={s.breadcrumb}>HFT-OS / Stores / <strong>Inventory intake</strong></div>{(ctx||state==='ready'||state==='loading')&&<button type="button" className={s.secondary} disabled={signingOut} onClick={()=>void signOut()}>Sign out</button>}</header>
   <main className={s.content}>
    {state==='signin'||state==='error'?<section className={s.signinCard}><h1>Inventory review</h1><p>{state==='signin'?'This private inventory requires a separately authorized corporate owner session.':'The inventory connection is unavailable. Any unresolved request must be reconciled before retrying.'}</p>{notice&&<p role="status">{notice}</p>}{!signingOut&&<a className={s.primary} href="/api/hft/live-masters/auth/start">Corporate Google sign-in</a>}<button type="button" className={s.secondary} disabled={signingOut||logoutUnconfirmed.current} onClick={refreshConnection}>Refresh connection</button><button type="button" className={s.secondary} disabled={signingOut} onClick={()=>void signOut()}>Sign out</button></section>:
    <><div className={s.pageHeading}><div><p className={s.kicker}>STORES / IMPORTED DATA</p><h1>{names[view]}</h1><p>Review the actual shared source records. Imported counts are not approved stock balances.</p></div></div>
    <div className={s.notice+' '+s.warning} role="status">Unadmitted inventory · Source quantities and locations are recorded observations. Current stock is the worksheet projection, not the authoritative ledger.</div>
    {notice&&<div className={s.notice} role="status">{notice}</div>}
    {!storage&&state==='ready'&&<div className={s.notice+' '+s.warning} role="alert">Request tracking unavailable. Renaming is disabled.</div>}
    {legacyHold&&<div className={s.notice+' '+s.warning} role="alert">A retained request from a prior or unbound context requires administrator review. Renaming is disabled. No request has been reassigned.</div>}
    {pending&&<section className={s.pending}><strong>Original request requires verification</strong><p>{pending.requestId}</p><button type="button" className={s.secondary} disabled={busy||!storage} onClick={()=>void reconcile()}>Check original request</button></section>}
    {edit&&<section className={s.editor} aria-label="Edit item name"><div className={s.cardHeading}><div><h2>Edit display name</h2><p>{edit.itemId} · revision {edit.revision}</p></div><button type="button" className={s.secondary} disabled={busy||!!pending} onClick={()=>setEdit(null)}>Cancel</button></div>
    <form className={s.form} onSubmit={e=>void save(e)}><label>Original item name<input value={edit.original} readOnly/></label><label>Display name<input required maxLength={240} disabled={busy||!!pending} value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></label><label>Reason<textarea required minLength={8} maxLength={300} disabled={busy||!!pending} value={edit.reason} onChange={e=>setEdit({...edit,reason:e.target.value})}/></label><div className={s.formFooter}><button className={s.primary} type="submit" disabled={busy||!!pending||!storage||legacyHold}>Save name</button></div></form></section>}
    <section className={s.directory} aria-label={names[view]}><div className={s.cardHeading}><div><h2>{names[view]}</h2><p aria-live="polite">{data?data.total+' matching records':'Loading imported records'}</p></div><button type="button" className={s.secondary} disabled={busy} onClick={()=>setReload(x=>x+1)}>Refresh</button></div>
     <form className={s.toolbar} onSubmit={find}><div className={s.search}><input aria-label="Search inventory" placeholder="Search source records" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)}/></div><button type="submit" className={s.secondary} disabled={busy}>Search</button></form>
     {!data?<div className={s.empty} role="status"><span className={s.spinner}/><h3>Loading records</h3></div>:data.rows.length===0?<div className={s.empty}><h3>No matching records</h3></div>:<div className={s.tableWrap}><table className={s.table}><thead><tr>{data.headers.map((h,i)=><th scope="col" key={i}>{h||'Source column '+(i+1)}</th>)}{view==='items'&&<th scope="col">Action</th>}</tr></thead><tbody>{data.rows.map((r,i)=><tr key={offset+i}>{data.headers.map((_,j)=><td key={j}>{display(r[j])}</td>)}{view==='items'&&<td><button className={s.textButton} type="button" disabled={busy||!!pending||!storage||legacyHold||!data.canRename} onClick={()=>setEdit({itemId:String(r[0]),name:String(r[2]),original:String(r[3]),revision:Number(r[8]),reason:''})}>Edit name</button></td>}</tr>)}</tbody></table></div>}
     {data&&<div className={s.tableFooter}><span>{data.total?offset+1:0}–{Math.min(offset+data.rows.length,data.total)} of {data.total}</span><div><button className={s.secondary} type="button" disabled={busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-pageSize))}>Previous</button> <button className={s.secondary} type="button" disabled={busy||offset+pageSize>=data.total} onClick={()=>setOffset(offset+pageSize)}>Next</button></div></div>}
    </section></>}
   </main></div></div>;
}

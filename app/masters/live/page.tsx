'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {LIVE_KINDS,LIVE_FIELDS,LIVE_R1_VERSION,validateLiveRequest,validatedScope,
 type LiveKind,type LiveRecord,type LiveScope} from '../../../lib/hft/live/live-contract.ts';
import s from './workspace.module.css';
import {workspaceView,workspaceViewUrl} from '../../../lib/hft/ui-reuse/workspace-view-state.ts';

const meta:Record<LiveKind,{plural:string;singular:string;id:string;desc:string;icon:string}>={
 EMPLOYEE:{plural:'Employees',singular:'employee',id:'Employee ID',desc:'Manage employee details, departments and designations.',icon:'people'},
 ITEM:{plural:'Items',singular:'item',id:'Item code',desc:'Maintain item identifiers, units of measure and tracking types.',icon:'box'},
 SUPPLIER:{plural:'Suppliers',singular:'supplier',id:'Supplier ID',desc:'Maintain supplier identities and registered legal names.',icon:'truck'},
 WAREHOUSE:{plural:'Warehouses',singular:'warehouse',id:'Warehouse ID',desc:'Manage warehouse records in your assigned scope.',icon:'warehouse'},
 LOCATION:{plural:'Locations',singular:'location',id:'Location ID',desc:'Maintain location references and their parent locations.',icon:'pin'},
 SITE:{plural:'Sites',singular:'site',id:'Site ID',desc:'Manage site identifiers and names.',icon:'site'}
};
const labels:Record<string,string>={fullName:'Full name',department:'Department',designation:'Designation',
 uom:'Unit of measure',controlType:'Tracking type',legalName:'Legal name',name:'Warehouse name',
 parentLocationId:'Parent location ID',siteName:'Site name'};
const placeholders:Record<string,string>={fullName:'Enter full name',department:'e.g. Stores',designation:'e.g. Supervisor',
 uom:'Approved UOM code',legalName:'Registered supplier name',name:'Enter warehouse name',
 parentLocationId:'Optional parent reference',siteName:'Enter site name'};
const paths:Record<string,string>={
 people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M22 21v-2a4 4 0 0 0-3-3.87 M17 3.13a4 4 0 0 1 0 7.75',
 box:'M12 3l9 5-9 5-9-5 9-5 M3 8v8l9 5 9-5V8 M12 13v8 M7.5 5.5l9 5',
 truck:'M2 5h13v12H2z M15 9h4l3 4v4h-7 M7 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M21 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
 warehouse:'M3 21V8l9-5 9 5v13 M7 21V11h10v10 M7 15h10 M7 18h10 M2 21h20',
 pin:'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 site:'M3 21h18 M5 21V3h10v18 M15 10h4v11 M8 7h4 M8 11h4 M8 15h4',
 lock:'M5 10h14v11H5z M8 10V7a4 4 0 1 1 8 0v3 M12 14v3',
 plus:'M12 5v14 M5 12h14',search:'M19 19l3 3 M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16',
 refresh:'M20 11a8 8 0 1 0-2 6 M20 3v8h-8',chevron:'M9 18l6-6-6-6',
 close:'M6 6l12 12 M18 6 6 18',check:'M5 12l4 4L19 6',
 logout:'M10 4H4v16h6 M10 12h11 M17 8l4 4-4 4',
 history:'M3 12a9 9 0 1 0 3-6.7 M3 3v6h6 M12 7v5l3 2'
};
function Icon({name}:{name:string}){return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
 fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]||paths.box}/></svg>;}
type Session={scope:{legalEntityId:string;siteId:string;warehouseIds:string[]};expiresAt:number;qualification:boolean;actorPartition:string};
type Audit={revision:number;action:string;actor_subject:string;occurred_at:string;reason:string;event_sha256:string;request_id:string;actorMatchesSession:boolean};
type Editor={recordId:string;revision:number;action:'CREATE'|'UPDATE';values:Record<string,string>;reason:string;deleted:boolean};
type Pending={actorPartition:string;requestId:string;kind:LiveKind;scope:LiveScope;recordId:string;expectedRevision:number;action:'CREATE'|'UPDATE'};
type Notice={tone:'neutral'|'error'|'success'|'warning';text:string};
const legacyPendingKey='hft.liveMasters.pending.v1';
const validPartition=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function pendingKey(actorPartition:string){
 if(!validPartition(actorPartition))throw Error('INVALID_ACTOR_PARTITION');
 return 'hft.liveMasters.pending.v2.'+actorPartition;
}
const object=(x:unknown):Record<string,unknown>=>{
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('INVALID_RESPONSE');
 return x as Record<string,unknown>;
};
const sameScope=(a:LiveScope,b:LiveScope)=>a.legalEntityId===b.legalEntityId&&a.siteId===b.siteId&&a.warehouseId===b.warehouseId;
const permitted=(session:Session,scope:LiveScope)=>session.scope.legalEntityId===scope.legalEntityId&&
 session.scope.siteId===scope.siteId&&session.scope.warehouseIds.includes(scope.warehouseId);
class ApiError extends Error{constructor(public status:number,public code:string){super(code);}}
async function api(body:unknown,signal?:AbortSignal,actorPartition?:string):Promise<unknown>{
 if(actorPartition!==undefined&&!validPartition(actorPartition))throw Error('INVALID_ACTOR_PARTITION');
 const response=await fetch('/api/hft/live-masters',{method:'POST',credentials:'same-origin',
  cache:'no-store',headers:{'Content-Type':'application/json',...(actorPartition?{'X-HFT-Live-Actor-Partition':actorPartition}:{})},body:JSON.stringify(body),signal});
 const result=object(await response.json());
 if(!response.ok||result.state!=='AUTHORITATIVE_RESULT')throw new ApiError(response.status,
  typeof result.code==='string'?result.code:'LIVE_R1_UNAVAILABLE');
 return result.data;
}
function friendly(error:unknown){
 const code=error instanceof Error?error.message:'';
 if(code.includes('SESSION_REQUIRED')||code.includes('ACTOR_CONTEXT_CHANGED'))return 'Your session has ended. Sign in again to continue.';
 if(code.includes('SCOPE_OR_PERMISSION'))return 'This action is not available in your assigned access scope.';
 if(code.includes('REVISION_OR_REQUEST_CONFLICT'))return 'The record or request has changed. Reopen the latest record before making another edit.';
 if(code.includes('INVALID')||code.includes('CONTRACT'))return 'Check the required fields and identifiers, then try again.';
 return 'The requested information is unavailable. Refresh or contact your administrator.';
}
function sessionContext(value:unknown):Session{
 const r=object(value),sc=object(r.scope);
 if(r.state!=='SIGNED_SESSION_CONTEXT'||!validPartition(r.actorPartition)||typeof r.expiresAt!=='number'||!Number.isSafeInteger(r.expiresAt)||
  r.expiresAt<=Date.now()/1000||typeof r.qualification!=='boolean'||!Array.isArray(sc.warehouseIds)||
  !sc.warehouseIds.length||sc.warehouseIds.length>32||new Set(sc.warehouseIds).size!==sc.warehouseIds.length)
  throw Error('INVALID_SESSION_CONTEXT');
 const scopes=sc.warehouseIds.map(warehouseId=>validatedScope({legalEntityId:sc.legalEntityId,siteId:sc.siteId,warehouseId}));
 return {scope:{legalEntityId:scopes[0].legalEntityId,siteId:scopes[0].siteId,warehouseIds:scopes.map(x=>x.warehouseId)},
  expiresAt:r.expiresAt,qualification:r.qualification,actorPartition:r.actorPartition};
}
function parseRecord(value:unknown,kind:LiveKind,scope:LiveScope,id?:string):LiveRecord{
 const r=object(value),recordScope=validatedScope(r.scope),values=object(r.values);
 if(r.kind!==kind||!sameScope(recordScope,scope)||typeof r.recordId!=='string'||
  !/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(r.recordId)||(id!==undefined&&r.recordId!==id)||
  typeof r.revision!=='number'||!Number.isSafeInteger(r.revision)||r.revision<1||
  typeof r.deleted!=='boolean'||r.state!=='RECORDED_UNAPPROVED'||
  LIVE_FIELDS[kind].some(f=>typeof values[f]!=='string')||
  typeof r.updatedAt!=='string')throw Error('INVALID_RECORD_RESPONSE');
 return r as unknown as LiveRecord;
}
function parseHistory(value:unknown):Audit[]{
 if(!Array.isArray(value)||value.length>100)throw Error('INVALID_HISTORY');
 for(const v of value){const a=object(v);if(typeof a.revision!=='number'||!Number.isSafeInteger(a.revision)||
  a.revision<1||typeof a.actorMatchesSession!=='boolean'||!['CREATE','UPDATE','DELETE'].includes(String(a.action))||
  ['actor_subject','occurred_at','reason','event_sha256','request_id'].some(f=>typeof a[f]!=='string'))
  throw Error('INVALID_HISTORY_ROW');}
 return value as Audit[];
}
function read(session:Session,kind:LiveKind,scope:LiveScope,intent:'LIST'|'GET'|'HISTORY',id='',search='',signal?:AbortSignal){
 return api({contractVersion:LIVE_R1_VERSION,intent,kind,scope,recordId:intent==='LIST'?'':id,
  search:intent==='LIST'?search:''},signal,session.actorPartition);
}
function readPending(actorPartition:string):Pending|null{
 const raw=sessionStorage.getItem(pendingKey(actorPartition));if(raw===null)return null;
 const p=object(JSON.parse(raw)),scope=validatedScope(p.scope);
 if(Object.keys(p).length!==7||p.actorPartition!==actorPartition||!LIVE_KINDS.includes(p.kind as LiveKind)||typeof p.requestId!=='string'||
  !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.requestId)||
  typeof p.recordId!=='string'||!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(p.recordId)||
  typeof p.expectedRevision!=='number'||!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<0||
  !['CREATE','UPDATE'].includes(String(p.action))||(p.action==='CREATE')!==(p.expectedRevision===0))
  throw Error('INVALID_PENDING_REQUEST');
 return {...p,scope} as Pending;
}
function samePending(a:Pending|null,b:Pending){
 return !!a&&a.actorPartition===b.actorPartition&&a.requestId===b.requestId&&a.kind===b.kind&&
  a.recordId===b.recordId&&a.expectedRevision===b.expectedRevision&&a.action===b.action&&sameScope(a.scope,b.scope);
}
function persistPending(marker:Pending){
 if(sessionStorage.getItem(legacyPendingKey)!==null||readPending(marker.actorPartition)!==null)
  throw Error('EXISTING_UNRESOLVED_REQUEST');
 sessionStorage.setItem(pendingKey(marker.actorPartition),JSON.stringify(marker));
 if(!samePending(readPending(marker.actorPartition),marker))throw Error('REQUEST_TRACKING_UNAVAILABLE');
}
function removePending(marker:Pending){
 if(!samePending(readPending(marker.actorPartition),marker))throw Error('REQUEST_TRACKING_CHANGED');
 sessionStorage.removeItem(pendingKey(marker.actorPartition));
 if(readPending(marker.actorPartition)!==null)throw Error('REQUEST_TRACKING_UNAVAILABLE');
}
function recordTitle(r:LiveRecord){return r.values.fullName||r.values.legalName||r.values.name||r.values.siteName||r.recordId;}
function recordDetails(r:LiveRecord){return LIVE_FIELDS[r.kind].map(f=>r.values[f]).filter(Boolean).join(' ');}
function date(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?'Not available':d.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});}
function anchor(kind:LiveKind,scope:LiveScope){return kind==='SITE'?scope.siteId:kind==='WAREHOUSE'?scope.warehouseId:'';}
const actionName=(action:string)=>action==='CREATE'?'Created':action==='UPDATE'?'Updated':'Retired';
function definitiveDenial(error:unknown){
 return error instanceof ApiError&&((error.status===401&&error.code==='LIVE_R1_CORPORATE_SESSION_REQUIRED')||
  (error.status===403&&error.code==='LIVE_R1_SCOPE_OR_PERMISSION_DENIED')||
  (error.status===422&&['LIVE_R1_CONTRACT_REJECTED','LIVE_R1_PAYLOAD_INVALID'].includes(error.code))||
  (error.status===413&&error.code==='LIVE_R1_REQUEST_TOO_LARGE')||
  (error.status===415&&error.code==='LIVE_R1_JSON_REQUIRED'));
}
export default function LiveMastersPage(){
 const [kind,setKind]=useState<LiveKind>('EMPLOYEE'),[warehouse,setWarehouse]=useState('');
 const [viewReady,setViewReady]=useState(false);
 useEffect(()=>{
  setKind(workspaceView(window.location.href,'view',LIVE_KINDS,'EMPLOYEE'));setViewReady(true);
 },[]);
 const [session,setSession]=useState<Session|null>(null),sessionRef=useRef<Session|null>(null),[auth,setAuth]=useState<'checking'|'signed-out'|'ready'|'unavailable'>('checking');
 const [records,setRecords]=useState<LiveRecord[]>([]),[loadedKey,setLoadedKey]=useState(''),[listState,setListState]=useState<'idle'|'loading'|'ready'|'error'>('idle');
 const [filter,setFilter]=useState(''),[serverSearch,setServerSearch]=useState(''),[department,setDepartment]=useState('');
 const [refresh,setRefresh]=useState(0),[editor,setEditor]=useState<Editor|null>(null),[audit,setAudit]=useState<Audit[]>([]);
 const [busy,setBusy]=useState(false),busyRef=useRef(false);
 const [pending,setPending]=useState<Pending|null>(null),[storageState,setStorageState]=useState<'checking'|'ready'|'blocked'|'legacy'>('checking');
 const [notice,setNotice]=useState<Notice|null>(null);
 const entity=session?.scope.legalEntityId||'',site=session?.scope.siteId||'';
 const scope:LiveScope={legalEntityId:entity,siteId:site,warehouseId:warehouse};
 const current=meta[kind],locked=busy||!!pending||storageState!=='ready';
 const contextKey=[kind,entity,site,warehouse,serverSearch].join('|');
 const currentRecords=loadedKey===contextKey?records:[];
 const currentListState=loadedKey===contextKey?listState:'loading';
 const dropSession=useCallback(()=>{
  sessionRef.current=null;setSession(null);setPending(null);setStorageState('checking');
  setAuth('signed-out');setRecords([]);setLoadedKey('');setListState('idle');setEditor(null);setAudit([]);
  setWarehouse('');setFilter('');setServerSearch('');setDepartment('');setNotice(null);
 },[]);
 const isCurrent=(ctx:Session)=>sessionRef.current===ctx&&ctx.expiresAt>Date.now()/1000;
 useEffect(()=>{
  const controller=new AbortController();
  void api({contractVersion:LIVE_R1_VERSION,intent:'SESSION_CONTEXT'},controller.signal)
   .then(value=>{if(controller.signal.aborted)return;const ctx=sessionContext(value);
    // Never enumerate storage or read a pending marker before verified context.
    try{
     const saved=readPending(ctx.actorPartition);
     const legacy=sessionStorage.getItem(legacyPendingKey)!==null;
     setPending(saved);setStorageState(legacy?'legacy':'ready');
    }catch{setPending(null);setStorageState('blocked');}
    sessionRef.current=ctx;setSession(ctx);setWarehouse(ctx.scope.warehouseIds[0]);setAuth('ready');})
   .catch(error=>{if(!controller.signal.aborted){dropSession();setAuth(error instanceof ApiError&&error.status===401?'signed-out':'unavailable');}});
  return()=>controller.abort();
 },[dropSession]);
 useEffect(()=>{
  if(!session)return;
  const timer=window.setTimeout(()=>{if(sessionRef.current!==session)return;dropSession();
   setNotice({tone:'neutral',text:'Your corporate session has expired. Sign in again to continue.'});},
  Math.max(0,session.expiresAt*1000-Date.now()+100));
  return()=>window.clearTimeout(timer);
 },[session,dropSession]);
 useEffect(()=>{
  if(!viewReady||auth!=='ready'||!session||!entity||!site||!warehouse)return;
  const controller=new AbortController(),requested={legalEntityId:entity,siteId:site,warehouseId:warehouse};
  setListState('loading');setRecords([]);setLoadedKey([kind,entity,site,warehouse,serverSearch].join('|'));
  void read(session,kind,requested,'LIST','',serverSearch,controller.signal).then(value=>{
   if(controller.signal.aborted||sessionRef.current!==session)return;
   if(!Array.isArray(value)||value.length>100)throw Error('INVALID_LIST');
   setRecords(value.map(v=>parseRecord(v,kind,requested)));setLoadedKey([kind,entity,site,warehouse,serverSearch].join('|'));setListState('ready');
  }).catch(error=>{
   if(controller.signal.aborted||sessionRef.current!==session)return;
   setRecords([]);setLoadedKey([kind,entity,site,warehouse,serverSearch].join('|'));setListState('error');
   if(error instanceof ApiError&&error.status===401){dropSession();setNotice({tone:'neutral',text:friendly(error)});}
   else setNotice({tone:'error',text:friendly(error)});
  });
  return()=>controller.abort();
 },[viewReady,auth,session,entity,site,warehouse,kind,serverSearch,refresh,dropSession]);
 function begin(){if(busyRef.current)return false;busyRef.current=true;setBusy(true);return true;}
 function end(){busyRef.current=false;setBusy(false);}
 function resetSelection(){setEditor(null);setAudit([]);setFilter('');setServerSearch('');setDepartment('');setRecords([]);setLoadedKey('');setListState('loading');setNotice(null);}
 function changeKind(next:LiveKind){if(busyRef.current||pending||next===kind)return;window.history.replaceState(window.history.state,'',workspaceViewUrl(window.location.href,'view',next,LIVE_KINDS));resetSelection();setKind(next);}
 function changeWarehouse(next:string){if(busyRef.current||pending||!session?.scope.warehouseIds.includes(next)||next===warehouse)return;resetSelection();setWarehouse(next);}
 function startNew(){
  if(locked||!session||!isCurrent(session)||!permitted(session,scope)||currentListState!=='ready')return;
  setAudit([]);setNotice(null);setEditor({recordId:anchor(kind,scope),revision:0,action:'CREATE',
   values:kind==='ITEM'?{controlType:'NONE'}:{},reason:'',deleted:false});
 }
 async function reopen(row:LiveRecord){
  if(locked||!session||!isCurrent(session)||!permitted(session,scope)||!sameScope(row.scope,scope)||row.kind!==kind||!begin())return;
  setNotice(null);
  try{
   const [record,history]=await Promise.all([read(session,kind,scope,'GET',row.recordId),read(session,kind,scope,'HISTORY',row.recordId)]);
   if(!isCurrent(session))return;
   const fresh=parseRecord(record,kind,scope,row.recordId);
   setAudit(parseHistory(history));setEditor({recordId:fresh.recordId,revision:fresh.revision,action:'UPDATE',
    values:{...fresh.values},reason:'',deleted:fresh.deleted});
  }catch(error){if(!isCurrent(session))return;if(error instanceof ApiError&&error.status===401)dropSession();
   setNotice({tone:'error',text:friendly(error)});}finally{end();}
 }
 function clearPending(ctx:Session,marker:Pending){
  if(!isCurrent(ctx)||ctx.actorPartition!==marker.actorPartition)throw Error('ACTOR_CONTEXT_CHANGED');
  removePending(marker);setPending(null);
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(locked||!editor||editor.deleted||!session||!isCurrent(session)||!permitted(session,scope)||!begin())return;
  let marker:Pending|null=null;
  try{
   const requestId=crypto.randomUUID();
   const payload=validateLiveRequest({contractVersion:LIVE_R1_VERSION,intent:'SAVE',kind,scope,
    recordId:editor.recordId.trim(),expectedRevision:editor.revision,action:editor.action,requestId,
    reason:editor.reason.trim(),values:Object.fromEntries(LIVE_FIELDS[kind].map(f=>[f,(editor.values[f]||'').trim()]))});
   if(payload.intent!=='SAVE'||payload.action==='DELETE')throw Error('INVALID_SAVE');
   const tracked:Pending={actorPartition:session.actorPartition,requestId,kind,scope,recordId:payload.recordId,expectedRevision:editor.revision,action:editor.action};
   // Persist only the unresolved request reference, not employee fields or tokens.
   // If storage is unavailable no mutation is submitted.
   try{persistPending(tracked);}catch{setStorageState('blocked');throw Error('REQUEST_TRACKING_UNAVAILABLE');}
   marker=tracked;setPending(tracked);
   const result=object(await api(payload,undefined,session.actorPartition));
   if(!isCurrent(session))return;
   const record=parseRecord(result.record,kind,scope,payload.recordId);
   if(result.state!=='SAVED_VERIFIED'||result.requestId!==requestId||result.operationalApproval!==false||
    record.revision!==editor.revision+1||result.historyRevision!==record.revision||record.deleted||
    LIVE_FIELDS[kind].some(f=>record.values[f]!==payload.values[f]))throw Error('UNCONFIRMED_SAVE');
   clearPending(session,tracked);marker=null;
   setEditor({...editor,recordId:record.recordId,revision:record.revision,values:{...record.values},action:'UPDATE',reason:''});
   setFilter('');setServerSearch('');setDepartment('');setRefresh(v=>v+1);
   setNotice({tone:'success',text:'Record saved and verified. You can reopen it after signing in again.'});
   try{const history=parseHistory(await read(session,kind,scope,'HISTORY',record.recordId));
    if(isCurrent(session))setAudit(history);}
   catch(error){if(isCurrent(session)){
    if(error instanceof ApiError&&error.status===401){dropSession();setNotice({tone:'neutral',text:friendly(error)});}
    else{setAudit([]);setNotice({tone:'success',text:'Record saved and verified. Reopen it to load the change history.'});}
   }}
  }catch(error){
   if(!isCurrent(session))return;
   // Auth/context changes preserve the original marker for reauthentication.
   if(error instanceof ApiError&&error.status===401){dropSession();setNotice({tone:'neutral',text:friendly(error)});return;}
   if(marker&&definitiveDenial(error)){
    try{clearPending(session,marker);marker=null;}catch{setStorageState('blocked');}
    setNotice({tone:'error',text:friendly(error)});
   }else if(marker){setPending(marker);setNotice({tone:'warning',text:'The save outcome is not confirmed. Check the original request before any further changes.'});}
   else setNotice({tone:'error',text:'Check the required fields. A save also requires working browser session storage.'});
  }finally{end();}
 }
 async function reconcile(){
  if(!pending||!session||!isCurrent(session)||pending.actorPartition!==session.actorPartition||
   !permitted(session,pending.scope)||storageState==='blocked'||!begin())return;
  try{
   try{if(!samePending(readPending(session.actorPartition),pending))throw Error('REQUEST_TRACKING_CHANGED');}
   catch{setStorageState('blocked');throw Error('REQUEST_TRACKING_UNAVAILABLE');}
   const history=parseHistory(await read(session,pending.kind,pending.scope,'HISTORY',pending.recordId));
   if(!isCurrent(session))return;
   const match=history.find(v=>v.actorMatchesSession===true&&v.request_id===pending.requestId&&v.revision===pending.expectedRevision+1&&v.action===pending.action);
   if(!match){setNotice({tone:'warning',text:'The original request has not been confirmed. No retry is permitted; retain the request reference for support.'});return;}
   try{clearPending(session,pending);}catch(error){setStorageState('blocked');throw error;}
   setEditor(null);setAudit([]);setRefresh(v=>v+1);
   setNotice({tone:'success',text:'The original request is present in the verified change history. Reopen the record before continuing.'});
  }catch(error){if(!isCurrent(session))return;
   if(error instanceof ApiError&&error.status===401){dropSession();setNotice({tone:'neutral',text:friendly(error)});}
   else setNotice({tone:'warning',text:friendly(error)+' The original request remains locked.'});
  }finally{end();}
 }
 async function signOut(){
  if(!begin())return;
  try{const r=await fetch('/api/hft/live-masters/signout',{method:'POST',credentials:'same-origin'});
   const body=object(await r.json());if(!r.ok||body.state!=='SIGNED_OUT')throw Error('SIGNOUT_FAILED');
   dropSession();
  }catch{dropSession();setAuth('unavailable');setNotice({tone:'error',text:'Sign-out could not be confirmed. Refresh before continuing.'});}finally{end();}
 }
 const filtered=currentRecords.filter(r=>{
  const q=filter.trim().toLocaleLowerCase();
  return (!q||(r.recordId+' '+recordDetails(r)).toLocaleLowerCase().includes(q))&&
   (!department||r.values.department===department);
 });
 const departments=[...new Set(currentRecords.map(r=>r.values.department).filter(Boolean))].sort();
 const existingAnchor=currentRecords.find(r=>r.recordId===anchor(kind,scope));
 const canCreate=!locked&&auth==='ready'&&currentListState==='ready'&&!existingAnchor;
 const editField=(key:string,value:string)=>setEditor(e=>e?{...e,values:{...e.values,[key]:value}}:null);
 return <div className={s.shell}>
  <aside className={s.sidebar}>
   <div className={s.brand}><div className={s.brandMark}>H</div><div><strong>HUBBLEFLY</strong><span>HFT-OS</span></div></div>
   <div className={s.sideCaption}>MASTER DATA</div>
   <nav className={s.navigation} aria-label="Master data">
    {LIVE_KINDS.map(k=><button key={k} type="button" aria-pressed={kind===k}
     className={kind===k?s.navSelected:s.navButton} disabled={busy||!!pending||auth!=='ready'}
     onClick={()=>changeKind(k)}><Icon name={meta[k].icon}/><span>{meta[k].plural}</span>{kind===k&&<Icon name="chevron"/>}</button>)}
   </nav>
   <div className={s.sideCaption}>OPERATIONS</div>
   <div className={s.lockedNav}><Icon name="warehouse"/><span>Stores</span><Icon name="lock"/></div>
   <div className={s.lockedNav}><Icon name="people"/><span>Users &amp; roles</span><Icon name="lock"/></div>
   <div className={s.lockedNav}><Icon name="site"/><span>Reports</span><Icon name="lock"/></div>
   <div className={s.sidebarBottom}><span className={s.sideCaption}>CURRENT RELEASE</span><strong>Masters workspace</strong><span>Operations not released</span></div>
  </aside>
  <div className={s.main}>
   <header className={s.topbar}><div className={s.breadcrumb}>FacilityOS <Icon name="chevron"/> Master data <Icon name="chevron"/> <strong>{current.plural}</strong></div>
    <div className={s.headerRight}><span className={s.environment}>{session?(session.qualification?'Qualification':'Masters only'):'Protected workspace'}</span>
     {auth==='ready'&&<button className={s.secondary} type="button" disabled={busy} onClick={()=>void signOut()}><Icon name="logout"/> Sign out</button>}</div>
   </header>
   <main className={s.content}>
    {auth!=='ready'?<section className={s.signinCard} aria-label="Corporate sign-in">
     <div className={s.signinIcon}><Icon name="lock"/></div>
     <p className={s.kicker}>HUBBLEFLY FACILITYOS</p>
     <h1>Master data workspace</h1>
     <p>{auth==='checking'?'Checking your corporate session…':auth==='unavailable'?'The workspace is not available right now. Refresh or sign in using your corporate account.':'Sign in with your corporate Google account to access your assigned company and warehouse.'}</p>
     {notice&&<p className={s.notice} role="status">{notice.text}</p>}
     {auth!=='checking'&&<a className={s.primary} href="/api/hft/live-masters/auth/start">Corporate Google sign-in <Icon name="chevron"/></a>}
     {auth==='unavailable'&&<button className={s.secondary} type="button" onClick={()=>window.location.reload()}>Refresh workspace</button>}
     <p className={s.small}>Access is restricted to approved corporate accounts. Stock posting is not enabled.</p>
    </section>:<>
     <div className={s.pageHeading}><div><p className={s.kicker}>MASTER DATA / {current.plural.toUpperCase()}</p><h1>{current.plural}</h1><p>{current.desc}</p></div>
      <button className={s.primary} type="button" disabled={!canCreate} onClick={startNew}><Icon name="plus"/> Add {current.singular}</button>
     </div>
     <section className={s.context} aria-label="Assigned workspace">
      <div className={s.contextLead}><span className={s.contextIcon}><Icon name="site"/></span><div><strong>Assigned workspace</strong><small>Corporate session scope</small></div></div>
      <label>Company<input aria-label="Company" value={entity} readOnly/></label>
      <label>Site<input aria-label="Site" value={site} readOnly/></label>
      <label>Warehouse<select value={warehouse} disabled={busy||!!pending} onChange={e=>changeWarehouse(e.target.value)}>{session?.scope.warehouseIds.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
     </section>
     {session?.qualification&&<div className={s.qualificationNote}><Icon name="lock"/><span>Qualification workspace. Use test records only. Saved records do not authorize stock or procurement.</span></div>}
     {notice&&<div className={s.notice+' '+s[notice.tone]} role="status"><span>{notice.text}</span><button type="button" className={s.iconButton} aria-label="Dismiss message" onClick={()=>setNotice(null)}><Icon name="close"/></button></div>}
     {storageState==='blocked'&&<div className={s.notice+' '+s.warning} role="alert">Browser request tracking is unavailable. Changes are disabled until it is restored.</div>}
     {storageState==='legacy'&&<div className={s.notice+' '+s.warning} role="alert">An unbound legacy request requires administrator review. Changes are disabled. No request has been attributed or replayed.</div>}
     {pending&&<section className={s.pending} aria-label="Unconfirmed save" role="alert">
      <strong>Check original save before continuing</strong><p>Request reference: <code>{pending.requestId}</code></p>
      <button type="button" className={s.secondary} onClick={()=>void reconcile()} disabled={busy||storageState==='blocked'||!session||pending.actorPartition!==session.actorPartition||!permitted(session,pending.scope)}>Check change history</button>
     </section>}
     <div className={s.workspaceGrid+(editor?' '+s.withEditor:'')}>
      <section className={s.directory} aria-label={current.plural+' directory'}>
       <div className={s.cardHeading}><div><h2>{current.plural} directory</h2><p>{currentListState==='ready'?currentRecords.length+' records loaded from your assigned scope':'Scoped records'}</p></div>
        <button type="button" className={s.secondary} disabled={busy} onClick={()=>setRefresh(v=>v+1)}><Icon name="refresh"/> Refresh</button></div>
       <div className={s.toolbar}>
        <div className={s.search}><Icon name="search"/><input aria-label="Search loaded records" placeholder={'Search '+current.plural.toLowerCase()} value={filter} maxLength={80} onChange={e=>setFilter(e.target.value)}/></div>
        {kind==='EMPLOYEE'&&<select aria-label="Filter by department" value={department} onChange={e=>setDepartment(e.target.value)}><option value="">All departments</option>{departments.map(d=><option value={d} key={d}>{d}</option>)}</select>}
        <button type="button" className={s.secondary} disabled={busy||!filter.trim()||!/^[A-Za-z0-9 ._-]{1,80}$/.test(filter.trim())}
         onClick={()=>{setServerSearch(filter.trim());setRefresh(v=>v+1);}}>Find by ID</button>
       </div>
       {serverSearch&&<p className={s.filterNote}>Database ID search: {serverSearch} <button type="button" className={s.textButton} disabled={busy} onClick={()=>{setServerSearch('');setFilter('');}}>Clear</button></p>}
       {currentListState==='loading'?<div className={s.empty} role="status"><span className={s.spinner}/><h3>Loading records</h3><p>Reading your assigned workspace.</p></div>:
        currentListState==='error'?<div className={s.empty}><Icon name="lock"/><h3>Records unavailable</h3><p>Refresh to check the connection and your permissions.</p></div>:
        !filtered.length?<div className={s.empty}><div className={s.emptyIcon}><Icon name={current.icon}/></div><h3>{currentRecords.length?'No matching records':'No '+current.plural.toLowerCase()+' recorded'}</h3>
         <p>{currentRecords.length?'Change your search or filter.':'Add a record to this assigned workspace.'}</p>
         {canCreate&&currentRecords.length===0&&<button type="button" className={s.secondary} onClick={startNew}><Icon name="plus"/> Add {current.singular}</button>}</div>:
        <div className={s.tableWrap}><table className={s.table}><thead><tr><th>{kind==='ITEM'?current.id:'Name / ID'}</th>
         {kind==='EMPLOYEE'?<><th>Department</th><th>Designation</th></>:kind==='ITEM'?<><th>UOM</th><th>Tracking</th></>:kind==='LOCATION'?<th>Parent location</th>:null}
         <th>Status</th><th className={s.right}>Action</th></tr></thead><tbody>
          {filtered.map(r=><tr key={r.recordId}><td><div className={s.recordName}><span className={s.avatar}><Icon name={current.icon}/></span><div><strong>{recordTitle(r)}</strong>{recordTitle(r)!==r.recordId&&<small>{r.recordId}</small>}</div></div></td>
           {kind==='EMPLOYEE'?<><td>{r.values.department}</td><td>{r.values.designation}</td></>:kind==='ITEM'?<><td>{r.values.uom}</td><td>{r.values.controlType}</td></>:kind==='LOCATION'?<td>{r.values.parentLocationId||'—'}</td>:null}
           <td><span className={s.statusPill}>{r.deleted?'Retired':'Recorded'}</span></td><td className={s.right}><button type="button" className={s.textButton} disabled={locked} onClick={()=>void reopen(r)}>{r.deleted?'View':'Open'} <Icon name="chevron"/></button></td></tr>)}
         </tbody></table></div>}
       <footer className={s.tableFooter}><span>{currentListState==='ready'?filtered.length+' of '+currentRecords.length+' loaded records':'No verified list yet'}</span><span>Up to 100 per database search. Name filters apply to loaded records.</span></footer>
      </section>
      {editor&&<aside className={s.editor} aria-label={editor.action==='CREATE'?'New record':'Record details'}>
       <div className={s.cardHeading}><div><p className={s.kicker}>{current.plural}</p><h2>{editor.deleted?'View':editor.action==='CREATE'?'Add':'Edit'} {current.singular}</h2><p>{editor.action==='CREATE'?'Enter the required record details.':editor.recordId}</p></div>
        <button type="button" className={s.iconButton} disabled={busy} aria-label="Close record" onClick={()=>{setEditor(null);setAudit([]);}}><Icon name="close"/></button></div>
       <form className={s.form} onSubmit={e=>void save(e)}>
        <div className={s.fieldGrid}>
         <label>{current.id}<input required maxLength={64} value={editor.recordId} disabled={locked||editor.action==='UPDATE'||!!anchor(kind,scope)} onChange={e=>setEditor(p=>p?{...p,recordId:e.target.value.toUpperCase()}:p)} placeholder={current.id}/></label>
         {LIVE_FIELDS[kind].map(f=><label key={f}>{labels[f]||f}{f==='controlType'?<select value={editor.values[f]||''} disabled={locked||editor.deleted} required onChange={e=>editField(f,e.target.value)}>
          <option value="">Select tracking type</option><option value="NONE">No tracking</option><option value="BATCH">Batch tracked</option><option value="SERIAL">Serial tracked</option></select>:
          <input required={f!=='parentLocationId'} maxLength={160} value={editor.values[f]||''} disabled={locked||editor.deleted}
           placeholder={placeholders[f]||labels[f]} onChange={e=>editField(f,['uom','parentLocationId'].includes(f)?e.target.value.toUpperCase():e.target.value)}/>}</label>)}
        </div>
        {!editor.deleted&&<><label>Reason for {editor.action==='CREATE'?'adding':'updating'} this record<textarea value={editor.reason} required minLength={8} maxLength={300} disabled={locked}
         placeholder="Briefly explain the change" onChange={e=>setEditor(p=>p?{...p,reason:e.target.value}:p)}/></label>
         <div className={s.formFooter}><button className={s.secondary} type="button" disabled={busy} onClick={()=>{setEditor(null);setAudit([]);}}>Cancel</button><button className={s.primary} type="submit" disabled={locked}><Icon name="check"/> {busy?'Saving…':editor.action==='CREATE'?'Save record':'Save changes'}</button></div></>}
       </form>
       {editor.revision>0&&<section className={s.audit} aria-label="Change history"><h3><Icon name="history"/> Change history</h3>
        {!audit.length?<p className={s.small}>Reopen the record to refresh its verified history.</p>:audit.map(a=><article key={a.request_id}>
         <div><strong>{actionName(a.action)}</strong><small>{date(a.occurred_at)}</small></div><p>{a.reason}</p>
         <details><summary>Audit details · revision {a.revision}</summary><p>Actor: {a.actor_subject}</p><code>{a.event_sha256}</code></details>
        </article>)}</section>}
      </aside>}
     </div>
    </>}
   </main>
  </div>
 </div>;
}

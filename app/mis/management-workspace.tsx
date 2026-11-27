'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {CorporateBrand,Icon} from '../masters/live/workspace-components';
import {requirementsReportCsv,procurementReview} from '../../lib/hft/planning/management-report.ts';
import BuildPlanner from './build-planner';
import type {Scope} from '../../lib/hft/roles/role-assignment.ts';
import type {ScopeName,RequirementsCatalog,RequirementsResult,RequirementsRow} from '../../lib/hft/planning/requirements.ts';
import s from './planning.module.css';
type Context={state:'MIS_CONTEXT';contextId:string;expiresAt:number;stockAdmitted:false;scopes:{scope:Scope;scopeName:ScopeName}[]};
const scopeKey=(x:Scope)=>JSON.stringify([x.legalEntityId,x.siteId,x.warehouseId]);
const hex=/^[0-9a-f]{64}$/;
const unknown='Not assessed';
async function read(p:unknown,signal:AbortSignal,context?:string){
 const r=await fetch('/api/hft/mis',{method:'POST',credentials:'same-origin',cache:'no-store',signal,
  headers:{'Content-Type':'application/json',...(context?{'x-hft-operator-context':context}:{})},body:JSON.stringify(p)});
 if(!r.ok)throw Error('MIS_READ_DENIED');return r.json() as Promise<unknown>;
}
function RequirementsOverview({planning}:{planning:boolean}){
 const [ctx,setCtx]=useState<Context|null>(null),ctxRef=useRef<Context|null>(null);
 const [selected,setSelected]=useState(''),[catalog,setCatalog]=useState<RequirementsCatalog|null>(null);
 const [model,setModel]=useState(''),[units,setUnits]=useState('1'),[detail,setDetail]=useState<RequirementsResult|null>(null);
 const [view,setView]=useState<'direct'|'grossLeaf'|'assemblies'|'procurement'>('direct'),[query,setQuery]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('Checking authorized management access…');
 const epoch=useRef(0),abort=useRef<AbortController|null>(null);
 function invalidate(){epoch.current++;abort.current?.abort();setBusy(false);}
 function clear(reason:string){
  invalidate();ctxRef.current=null;setCtx(null);setSelected('');setCatalog(null);setModel('');setUnits('1');setDetail(null);setQuery('');setView('direct');setMessage(reason);
 }
 function next(){invalidate();const c=new AbortController();abort.current=c;setBusy(true);return {n:++epoch.current,signal:c.signal};}
 function current(n:number,signal:AbortSignal,c?:Context){return n===epoch.current&&!signal.aborted&&(!c||ctxRef.current===c&&c.expiresAt>Date.now()/1000);}
 async function overview(c:Context,scope:Scope){
  setCatalog(null);setModel('');setDetail(null);setQuery('');setView('direct');
  const {n,signal}=next();
  try{
   const x=await read({intent:'OVERVIEW',scope},signal,c.contextId) as RequirementsCatalog;
   if(!current(n,signal,c))return;
   if(x.state!=='CATALOG'||x.stockAdmitted!==false||scopeKey(x.scope)!==scopeKey(scope)||!Array.isArray(x.models))throw Error('MIS_SOURCE');
   setCatalog(x);setMessage(x.models.length?'Approved effective BOMs only. Eligible stock and capacity are not assessed.':'No approved effective drone BOM is available in this authorized scope.');
  }catch{if(current(n,signal,c))clear('Management access or the approved source could not be verified. Reload or sign in again.');}
  finally{if(n===epoch.current)setBusy(false);}
 }
 async function load(){
  clear('Checking authorized management access…');const {n,signal}=next();
  try{
   const x=await read({intent:'CONTEXT'},signal) as Context;
   if(!current(n,signal))return;
   if(x.state!=='MIS_CONTEXT'||x.stockAdmitted!==false||!hex.test(x.contextId)||!Number.isSafeInteger(x.expiresAt)||x.expiresAt<=Date.now()/1000||!Array.isArray(x.scopes)||!x.scopes.length||x.scopes.length>32)throw Error('MIS_CONTEXT');
   ctxRef.current=x;setCtx(x);const first=x.scopes[0].scope;setSelected(scopeKey(first));void overview(x,first);
  }catch{if(current(n,signal))clear('No admitted management source. Approved BOMs, stock and readiness are unavailable.');}
  finally{if(n===epoch.current)setBusy(false);}
 }
 function cancelPending(){epoch.current++;abort.current?.abort();ctxRef.current=null;}
 useEffect(()=>{void load();return cancelPending; // initial mount only
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useEffect(()=>{
  if(!ctx)return;const timer=window.setTimeout(()=>clear('Management session expired. Sign in again.'),Math.max(0,ctx.expiresAt*1000-Date.now()+50));
  return()=>window.clearTimeout(timer);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ctx]);
 function chooseScope(value:string){
  const c=ctxRef.current,found=c?.scopes.find(x=>scopeKey(x.scope)===value);if(!c||!found)return;
  setSelected(value);void overview(c,found.scope);
 }
 async function requirements(id:string,quantity=units){
  const c=ctxRef.current,scope=c?.scopes.find(x=>scopeKey(x.scope)===selected)?.scope;
  if(!c||!scope||!catalog?.models.some(m=>m.id===id))return;
  if(!/^[1-9]\d{0,5}$/.test(quantity)||Number(quantity)>100000){setMessage('Enter between 1 and 100,000 whole drone units.');return;}
  setModel(id);setDetail(null);setView('direct');setQuery('');
  const {n,signal}=next();
  try{
   const x=await read({intent:'REQUIREMENTS',scope,modelId:id,units:Number(quantity)},signal,c.contextId) as RequirementsResult;
   if(!current(n,signal,c))return;
   if(x.state!=='REQUIREMENTS_VERIFIED'||x.stockAdmitted!==false||x.readiness!=='NOT_ASSESSABLE'||x.capacity!==null||x.coverage!==null||x.model.id!==id||x.units!==Number(quantity)||scopeKey(x.scope)!==scopeKey(scope)||
    x.model.revisionId!==catalog.models.find(m=>m.id===id)?.revisionId||![x.direct,x.grossLeaf,x.assemblies].every(a=>Array.isArray(a)&&a.every(r=>r.available===null&&r.shortage===null)))throw Error('MIS_SOURCE');
   setDetail(x);setMessage('Verified approved BOM demand. Gross SFG explosion assumes assemblies must be built. No stock or shortage calculation.');
  }catch{if(current(n,signal,c))clear('Management access, BOM revision or source verification changed. Reload the authorized source.');}
  finally{if(n===epoch.current)setBusy(false);}
 }
 async function exportReport(){
  const c=ctxRef.current,d=detail;
  const scope=c?.scopes.find(x=>scopeKey(x.scope)===selected)?.scope;
  if(!c||!d||!scope||busy||c.expiresAt<=Date.now()/1000||scopeKey(d.scope)!==scopeKey(scope))return;
  const {n,signal}=next();
  try{
   // No cached-only download: current scoped identity, action and effective
   // revision must pass the same restricted server read again.
   const verified=await read({intent:'REQUIREMENTS',scope,modelId:d.model.id,units:d.units},signal,c.contextId);
   if(!current(n,signal,c))return;
   const csv=requirementsReportCsv(d,verified);
   if(!current(n,signal,c))return;
   const href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   const a=document.createElement('a');a.href=href;
   a.download='HFT-OS-BOM-requirements-r'+d.model.revision+'-'+d.units+'-units.csv';
   document.body.appendChild(a);try{a.click();}finally{a.remove();window.setTimeout(()=>URL.revokeObjectURL(href),1000);}
   setMessage('Freshly verified requirements report exported. Stock, shortages and net purchase quantities are not assessed.');
  }catch{if(current(n,signal,c))clear('Report source or management authorization changed. No report exported. Reload the authorized source.');}
  finally{if(n===epoch.current)setBusy(false);}
 }
 const rows:readonly RequirementsRow[]=detail?(view==='procurement'?procurementReview(detail):detail[view]):[];
 const filtered=rows.filter(r=>(r.itemCode+' '+r.productVersion+' '+r.uom).toLowerCase().includes(query.toLowerCase().trim()));
 const cards=[{key:'models',label:'Effective drone BOMs',value:catalog?.models.length??'—',sub:'Open verified model directory'},
  {key:'direct',label:'Direct requirements',value:detail?.direct.length??'—',sub:'Show BOM lines'},
  {key:'grossLeaf',label:'Gross components',value:detail?.grossLeaf.length??'—',sub:'Show exploded leaf requirements'},
  {key:'procurement',label:'Procurement review',value:detail?.grossLeaf.length??'—',sub:'Gross components; net buy unknown'},
  {key:'capacity',label:'Full build capacity',value:'—',sub:'Stock source not admitted'}] as const;
 return <main className={s.shell}>
  <header className={s.top}><div className={s.misBrand}><CorporateBrand/><strong>Management / MIS</strong></div><Link href="/">Application dashboard</Link></header>
  <section className={s.hero}><div><p>{planning?'BUILD DEMAND PLANNING':'MANAGEMENT OVERVIEW'} · READ ONLY</p><h1>{planning?'Plan My Builds':'Build readiness'}</h1><p>Approved drone models, effective BOMs and material demand. Stock coverage is deliberately separate.</p></div><div className={s.heroNumber}><span>Material-supported units</span><strong>—</strong><small>Eligible stock and reservations not admitted</small></div></section>
  <section className={s.panel}><div className={s.sectionTitle}><div><h2>Authorized management source</h2><p>Only current scoped approval records are displayed.</p></div><button type="button" onClick={()=>void load()} disabled={busy}>Refresh source</button></div>
   {ctx&&<label className={s.field}>Workspace<select aria-label="Management workspace" value={selected} disabled={busy} onChange={e=>chooseScope(e.target.value)}>
    {ctx.scopes.map(x=><option key={scopeKey(x.scope)} value={scopeKey(x.scope)}>{x.scopeName.companyName} / {x.scopeName.siteName} / {x.scopeName.warehouseName}</option>)}</select></label>}
   {!ctx&&!busy&&<p><a className={s.signinLink} href="/api/hft/live-masters/auth/start?return=roles">Corporate Google sign-in</a></p>}
   {catalog&&<p className={s.help}>Verified source at {new Date(catalog.asOf).toLocaleString('en-IN')}</p>}
   <p className={s.message} role="status">{busy?'Reading authorized source…':message}</p>
  </section>
  <section className={s.overviewCards} aria-label="Management summary">{cards.map(c=><button type="button" key={c.key} disabled={c.key==='models'?!catalog:c.key==='capacity'||!detail}
    aria-pressed={c.key===view} onClick={()=>{if(c.key==='models')document.getElementById('effective-models')?.scrollIntoView({block:'start'});else if(c.key==='direct'||c.key==='grossLeaf'||c.key==='procurement'){setView(c.key);document.getElementById('requirements-detail')?.scrollIntoView({block:'start'});}}}>
    <span>{c.label}</span><strong>{c.value}</strong><small>{c.sub}</small></button>)}</section>
  <section className={s.panel} id="effective-models"><h2>{planning?'Select a drone to plan material demand':'Drone-wise readiness'}</h2>{planning&&<p className={s.help}>Calculate approved gross demand for a planned quantity. New/used stock selection, shared-part allocation and full or conditional capacity remain unavailable until eligible stock and reservations are admitted.</p>}
   {!catalog?.models.length?<div className={s.empty}>No verified effective drone BOM displayed.</div>:<div className={s.modelDirectory}>{catalog.models.map(m=><article key={m.id}>
    <div><strong>{m.name}</strong><span>{m.variant} · BOM revision {m.revision}</span><small>Approved effective revision · readiness {unknown.toLowerCase()}</small></div>
    <button type="button" disabled={busy} aria-pressed={model===m.id} onClick={()=>void requirements(m.id)}>View requirements</button></article>)}</div>}
  </section>
  {detail&&<section className={s.panel} id="requirements-detail">
   <div className={s.sectionTitle}><div><h2>{detail.model.name} — Material requirements</h2><p>{detail.model.variant} · BOM revision {detail.model.revision}</p></div>
    <form className={s.quantityForm} onSubmit={e=>{e.preventDefault();void requirements(model);}}><label>Planned units<input aria-label="Planned units" value={units} onChange={e=>setUnits(e.target.value)} type="number" min="1" max="100000" step="1" required/></label><button disabled={busy}>Calculate requirements</button></form>
    <button type="button" className={s.exportButton} disabled={busy||!ctx} onClick={()=>void exportReport()}>Export CSV report</button>
   </div><p className={s.message}>Calculated for {detail.units} unit(s). Available stock, shortages and coverage: {unknown.toLowerCase()}.</p>
   <div className={s.reqTabs}>{(['direct','grossLeaf','assemblies','procurement'] as const).map((v,i)=><button type="button" key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{['Direct BOM','Gross leaf requirements','Assemblies','Procurement review'][i]}</button>)}</div>
   <p className={s.help}>{view==='procurement'?'Gross leaf demand to review for procurement. Net purchase quantities cannot be calculated without eligible stock, reservations, open purchase orders and policy. This is not a purchase requisition.':view==='grossLeaf'?'Gross requirements assume no existing assembly stock. Do not add these quantities to direct assembly requirements.':view==='assemblies'?'Nested assemblies and exact approved child revisions.':'Direct approved bill of materials.'}</p>
   <label className={s.field}>Filter item codes<input aria-label="Filter material requirements" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search item, version or UOM"/></label>
   <div className={s.tableWrap}><table><thead><tr><th>Item / version</th><th>UOM</th><th>Required</th><th>Available</th><th>Shortage</th><th>Child revision</th>{view==='procurement'&&<th>Net purchase quantity</th>}</tr></thead>
    <tbody>{filtered.map(r=><tr key={JSON.stringify([r.itemCode,r.productVersion,r.uom])}><td><strong>{r.itemCode}</strong><small>{r.productVersion}</small></td><td>{r.uom}</td><td><strong>{r.required}</strong></td><td>—</td><td>—</td><td>{r.childRevisionId??'Component'}</td>{view==='procurement'&&<td>Not assessed</td>}</tr>)}</tbody></table></div>
   {!filtered.length&&<p className={s.help}>No matching material lines.</p>}
   <p className={s.help}>CSV includes all three demand sections, regardless of the current filter. Direct, assembly and gross leaf quantities are separate views and must not be added together.</p>
   <details><summary>Source and approval evidence</summary><p>Revision: {detail.model.revisionId}</p><p>Effective from: {detail.model.effectiveFrom}</p><p>Approval evidence SHA-256: <code>{detail.model.evidenceSha256}</code></p><p>Source epoch: <code>{detail.sourceEpoch}</code></p></details>
  </section>}
  <footer className={s.footer}>Requirements are not stock balances, allocations, procurement or manufacturing approval.</footer>
 </main>;
}
export default function ManagementWorkspace({requirementsOnly}:{requirementsOnly:boolean}){
 const [tab,setTab]=useState<'overview'|'plan'>('overview'),[sidebarVisible,setSidebarVisible]=useState(true);
 return <div className={s.managementShell+(!sidebarVisible?' '+s.managementCollapsed:'')}>
  <aside id="mis-sidebar" hidden={!sidebarVisible} className={s.managementSidebar}>
   <CorporateBrand/>
   <div className={s.railCaption}>MANAGEMENT</div>
   <nav className={s.managementTabs} aria-label="Management workspace views">
    <button type="button" aria-current={tab==='overview'?'page':undefined} aria-pressed={tab==='overview'} onClick={()=>setTab('overview')}><Icon name="site"/> Management overview</button>
    <button type="button" aria-current={tab==='plan'?'page':undefined} aria-pressed={tab==='plan'} onClick={()=>setTab('plan')}><Icon name="box"/> Plan My Builds</button>
   </nav>
   {requirementsOnly&&<p className={s.railNote}>Requirements-only access. Full and conditional stock planning requires separately admitted balances.</p>}
   <div className={s.railFoot}><Link href="/"><Icon name="chevron"/> Application dashboard</Link><span><Icon name="lock"/> Read-only management</span></div>
  </aside>
  <div className={s.managementMain}>
   <header className={s.managementToolbar}>
    <button type="button" aria-controls="mis-sidebar" aria-expanded={sidebarVisible} onClick={()=>setSidebarVisible(v=>!v)}><Icon name="sidebar"/> {sidebarVisible?'Hide Sidebar':'Show Sidebar'}</button>
    {!sidebarVisible&&<div className={s.misCompactBrand}><CorporateBrand/></div>}
    <strong>Management / {tab==='overview'?'Overview':'Plan My Builds'}</strong>
   </header>
   {tab==='plan'&&!requirementsOnly?<BuildPlanner/>:<RequirementsOverview planning={tab==='plan'}/>}
  </div>
 </div>;
}

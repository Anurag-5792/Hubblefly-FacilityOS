'use client';
import Link from 'next/link';
import {useState,useRef,useEffect} from 'react';
import type {BuildResult,ItemRef,PlanRequest} from '../../lib/hft/planning/build-plan.ts';
import type {Scope} from '../../lib/hft/roles/role-assignment.ts';
import s from './planning.module.css';
type Catalog={state:'CATALOG';scope:Scope;asOf:string;sourceEpoch:string;complete:boolean;
 models:{id:string;name:string;version:string;active:boolean;bomReady:boolean}[];
 common:(ItemRef&{name:string})[]};
const key=(i:ItemRef)=>JSON.stringify([i.itemCode,i.productVersion,i.uom]);
const defaultScope={legalEntityId:'',siteId:'',warehouseId:''};
const unknown=(v:unknown)=>v===null||v===undefined?'—':String(v);
async function read(body:unknown,signal:AbortSignal){
 const response=await fetch('/api/hft/mis',{method:'POST',credentials:'same-origin',cache:'no-store',
 headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 if(!response.ok)throw Error('MIS_SOURCE_NOT_ADMITTED');
 return response.json() as Promise<unknown>;
}
export default function BuildPlanner(){
 const [scope,setScope]=useState<Scope>(defaultScope),[catalog,setCatalog]=useState<Catalog|null>(null);
 const [mode,setMode]=useState<PlanRequest['mode']>('FULL'),[condition,setCondition]=useState<PlanRequest['condition']>('NEW_ONLY');
 const [order,setOrder]=useState<string[]>([]),[caps,setCaps]=useState<Record<string,string>>({}),[protect,setProtect]=useState<Record<string,string>>({});
 const [ignore,setIgnore]=useState<string[]>([]),[result,setResult]=useState<BuildResult|null>(null),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState('Select a verified scope to load its approved model and material sources.');
 const [filter,setFilter]=useState<'BOTH'|'REQUIRED'|'AVAILABLE'|'SHORTAGES'|'UNMAPPED'>('BOTH');
 const epoch=useRef(0),abort=useRef<AbortController|null>(null);
 function invalidate(){epoch.current++;abort.current?.abort();setResult(null);setBusy(false);}
 function editScope(k:keyof Scope,v:string){invalidate();setScope(p=>({...p,[k]:v}));setCatalog(null);setOrder([]);setCaps({});setProtect({});setIgnore([]);}
 useEffect(()=>()=>abort.current?.abort(),[]);
 function next(){abort.current?.abort();const c=new AbortController();abort.current=c;return {n:++epoch.current,signal:c.signal};}
 async function load(){
  invalidate();setCatalog(null);setOrder([]);setCaps({});setProtect({});setIgnore([]);const {n,signal}=next();setBusy(true);
  try{const c=await read({intent:'CATALOG',scope,scenario:null},signal) as Catalog;
   if(n!==epoch.current||signal.aborted)return;
   if(c.state!=='CATALOG'||c.scope.legalEntityId!==scope.legalEntityId||c.scope.siteId!==scope.siteId||c.scope.warehouseId!==scope.warehouseId||!Array.isArray(c.models)||!Array.isArray(c.common))throw Error('INVALID_SCOPE');
   setCatalog(c);setMessage(c.complete?'Select models and order their build priorities.':'The authorized snapshot is incomplete. Reliable build totals are not available.');
  }catch{if(n===epoch.current&&!signal.aborted){setCatalog(null);setMessage('No admitted management source for this scope. No inventory or build quantities are available.');}}
  finally{if(n===epoch.current)setBusy(false);}
 }
 function changeMode(v:PlanRequest['mode']){invalidate();setMode(v);if(v==='FULL')setIgnore([]);}
 function toggle(id:string){invalidate();setOrder(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);setProtect(p=>{const x={...p};delete x[id];return x;});}
 function move(id:string,dir:number){invalidate();setOrder(p=>{const a=[...p],i=a.indexOf(id),j=i+dir;if(i<0||j<0||j>=a.length)return p;[a[i],a[j]]=[a[j],a[i]];return a;});}
 function quantity(text:string){if(!/^(0|[1-9][0-9]*)$/.test(text)||!Number.isSafeInteger(Number(text)))throw Error('Enter nonnegative whole quantities.');return Number(text);}
 async function plan(){
  if(!catalog||!order.length)return;
  const {n,signal}=next();setBusy(true);setResult(null);
  try{
   const scenario={mode,condition,priorities:order.map(modelId=>({modelId,cap:caps[modelId]?quantity(caps[modelId]):null})),
    protect:Object.entries(protect).filter(([id,v])=>!order.includes(id)&&v!=='').map(([modelId,v])=>({modelId,quantity:quantity(v)})),
    ignore:mode==='CORE'?catalog.common.filter(x=>ignore.includes(key(x))).map(({itemCode,productVersion,uom})=>({itemCode,productVersion,uom})):[]};
   const data=await read({intent:'PLAN',scope,scenario},signal) as BuildResult;
   if(n!==epoch.current||signal.aborted)return;
   if(!['ASSESSED','NOT_ASSESSABLE'].includes(data.state)||data.mode!==mode||data.sourceEpoch!==catalog.sourceEpoch||data.scope.legalEntityId!==scope.legalEntityId||data.scope.siteId!==scope.siteId||data.scope.warehouseId!==scope.warehouseId)throw Error('STALE_SCOPE_OR_SNAPSHOT');
   setResult(data);setMessage(data.state==='ASSESSED'?'Material scenario calculated. No stock is reserved.':'Some requirements are unresolved; no reliable combined total is available.');
  }catch(e){if(n===epoch.current&&!signal.aborted){setResult(null);setCatalog(null);setOrder([]);setProtect({});setCaps({});setIgnore([]);setMessage(e instanceof Error&&e.message.startsWith('Enter ')?e.message:'Source or authorization could not be verified. Reload the scope.');}}
  finally{if(n===epoch.current)setBusy(false);}
 }
 const rows=result?.requirements??[];
 const visible=rows.filter(x=>filter==='SHORTAGES'?x.shortage!=='0':filter==='UNMAPPED'?x.itemCode===null||x.eligibleNewFree===null:true);
 const reliable=result?.state==='ASSESSED';
 const metrics=[{id:'BOTH' as const,label:'Required lines',value:rows.length},{id:'SHORTAGES' as const,label:'Shortage lines',value:rows.filter(x=>x.shortage!=='0').length},{id:'UNMAPPED' as const,label:'Unresolved lines',value:rows.filter(x=>x.itemCode===null||x.eligibleNewFree===null).length}];
 return <main className={s.shell}>
  <header className={s.top}><div><span>HFT-OS</span><strong>Management / MIS</strong></div><Link href="/">Operations home</Link></header>
  <section className={s.hero}><div><p>PRODUCTION PLANNING · READ ONLY</p><h1>Plan My Builds</h1><p>See material-supported drone capacity, protect other demand and compare a conditional core build scenario.</p></div><div className={s.heroNumber}><span>{mode==='CORE'?'Conditional potential':'Combined material-supported units'}</span><strong>{unknown(result?.combinedTotal)}</strong><small>{reliable?'Verified scenario, not a reservation':'Awaiting an assessable source'}</small></div></section>
  <section className={s.panel}><div className={s.sectionTitle}><div><h2>Assigned source</h2><p>Exact authorized company, site and warehouse scope. No intake quantities are substituted.</p></div>{catalog&&<span>{new Date(catalog.asOf).toLocaleString('en-IN')}</span>}</div>
   <form className={s.scope} onSubmit={e=>{e.preventDefault();void load();}}>{(['legalEntityId','siteId','warehouseId'] as const).map((k,i)=><label key={k}>{['Company ID','Site ID','Warehouse ID'][i]}<input value={scope[k]} onChange={e=>editScope(k,e.target.value)} required maxLength={128}/></label>)}<button disabled={busy}>Load source</button></form>
   <p className={s.message} role="status">{message}</p>
  </section>
  <section className={s.panel}><h2>Build scenario</h2><div className={s.modeGrid}>
   <button type="button" aria-pressed={mode==='FULL'} onClick={()=>changeMode('FULL')}><strong>Full Build Plan</strong><span>Include every approved requirement.</span></button>
   <button type="button" aria-pressed={mode==='CORE'} onClick={()=>changeMode('CORE')}><strong>Core Build Potential</strong><span>Explicitly omit selected verified shared items. Not material-ready.</span></button>
   </div><label className={s.field}>Eligible condition<select value={condition} onChange={e=>{invalidate();setCondition(e.target.value as PlanRequest['condition']);}}><option value="NEW_ONLY">New only</option><option value="NEW_AND_ELIGIBLE_USED">New + eligible used</option></select></label>
   <h3>Choose drone models in priority order</h3><p className={s.help}>Higher priority is maximized first; independent model capacities cannot be added.</p>
   {!catalog?<div className={s.empty}>Verified model and effective BOM catalog unavailable.</div>:<div className={s.models}>{catalog.models.filter(m=>m.active).map(m=><label key={m.id} className={s.model}><input type="checkbox" checked={order.includes(m.id)} onChange={()=>toggle(m.id)}/><span><strong>{m.name}</strong><small>{m.id} · {m.version} · {m.bomReady?'Approved BOM recorded':'BOM unresolved'}</small></span></label>)}</div>}
   {order.length>0&&<ol className={s.priority}>{order.map((id,i)=><li key={id}><strong>{i+1}. {catalog?.models.find(m=>m.id===id)?.name}</strong><div><button type="button" aria-label={'Move '+id+' up'} disabled={i===0} onClick={()=>move(id,-1)}>↑</button><button type="button" aria-label={'Move '+id+' down'} disabled={i===order.length-1} onClick={()=>move(id,1)}>↓</button><label>Unit cap<input type="number" min="0" step="1" placeholder="No cap" value={caps[id]??''} onChange={e=>{invalidate();setCaps(p=>({...p,[id]:e.target.value}));}}/></label></div></li>)}</ol>}
   {mode==='CORE'&&<div className={s.sub}><h3>Ignored shared requirements</h3><p className={s.help}>Shared does not mean dispensable. Select only explicitly mapped items.</p>{catalog?.common.map(i=><label key={key(i)} className={s.check}><input type="checkbox" checked={ignore.includes(key(i))} onChange={()=>{invalidate();setIgnore(p=>p.includes(key(i))?p.filter(x=>x!==key(i)):[...p,key(i)]);}}/>{i.name} · {i.productVersion} / {i.uom}</label>)}{!catalog?.common.length&&<p>No verified common items available.</p>}</div>}
   <div className={s.sub}><h3>Protect Other Drones</h3><p className={s.help}>Optional prior demand, net of verified existing reservations. Does not allocate stock.</p>{catalog?.models.filter(m=>m.active&&!order.includes(m.id)).map(m=><label className={s.protect} key={m.id}>{m.name}<input aria-label={'Protect '+m.name} type="number" min="0" step="1" value={protect[m.id]??''} onChange={e=>{invalidate();setProtect(p=>({...p,[m.id]:e.target.value}));}}/></label>)}</div>
   <button type="button" className={s.cta} onClick={()=>void plan()} disabled={!catalog||!order.length||busy||(mode==='CORE'&&!ignore.length)}>{busy?'Reading source…':'Show Build Readiness'}</button>
  </section>
  <section className={s.summary} aria-label="Planning summary">{metrics.map(m=><button type="button" key={m.id} aria-pressed={filter===m.id} onClick={()=>setFilter(m.id)}><span>{m.label}</span><strong>{reliable?m.value:'—'}</strong><small>Filter material requirements</small></button>)}</section>
  {result&&<section className={s.panel}><h2>{result.label}</h2><p className={s.help}>{result.advice}</p>{result.mode==='CORE'&&<p className={s.message}>Full plan: {unknown(result.fullComparison.combinedTotal)} · Conditional core: {unknown(result.combinedTotal)} · Omitted requirements must still be covered for a full build.</p>}
   <div className={s.results}>{result.models.map(m=><article key={m.modelId}><strong>{m.name}</strong><span>Independent <b>{unknown(m.independent)}</b></span><span>Priority allocation <b>{unknown(m.allocated)}</b></span></article>)}</div>
   {result.issues.length>0&&<details open><summary>Unresolved requirements</summary>{result.issues.map(i=><p key={i}>{i}</p>)}</details>}
   <details><summary>What's stopping us?</summary>{result.models.map(m=><div key={m.modelId}><strong>{m.name}</strong>{m.bindingItems.map(i=><p key={i.key}>{i.name} · {i.shortage} {i.uom} shortage for the next additional drone</p>)}</div>)}</details>
   <details><summary>Ignored requirements in allocated plan</summary>{result.materials.filter(i=>i.ignored!=='0').map(i=><p key={i.key}>{i.name} · {i.ignored} {i.uom} omitted — required for full coverage</p>)}</details>
   <details><summary>Prior demand and unmet protected quantities</summary>{result.protectedMaterials.map(i=><p key={i.key}>{i.name} · {i.reserved} already reserved · {i.protected} additional free demand · {i.shortage} unmet ({i.uom})</p>)}</details>
   <p className={s.help}>*Used free is shown before model-specific suitability. The calculation only consumes approved eligible used stock. Requirement quantities below use each explicit cap or one drone when no cap is entered. Snapshot: {result.asOf} · {result.provenance}</p>
  </section>}
  <section className={s.panel}><div className={s.sectionTitle}><h2>Material requirements</h2><select aria-label="Requirement view" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="BOTH">Required &amp; available</option><option value="REQUIRED">Required</option><option value="AVAILABLE">Available</option><option value="SHORTAGES">Shortages only</option><option value="UNMAPPED">Unmapped</option></select></div>
   {!result?<div className={s.empty}>No calculated material rows. Load an admitted source and select a scenario.</div>:<div className={s.tableWrap}><table><thead><tr><th>Item / version</th><th>Applicable models</th><th>UOM</th>{filter!=='AVAILABLE'&&<th>Required</th>}{filter!=='REQUIRED'&&<><th>New / used on-hand</th><th>New / used free*</th><th>Held / unknown</th><th>Remaining new / used*</th></>}{filter!=='AVAILABLE'&&<><th>Shortage</th><th>Ignored</th></>}</tr></thead><tbody>{visible.map(i=><tr key={i.key}><td><strong>{i.name}</strong><small>{i.itemCode??'Unmapped'} / {i.productVersion??'Unknown'}</small></td><td>{i.applicableModels?.map(id=>catalog?.models.find(m=>m.id===id)?.name??id).join(', ')??'Unmapped'}</td><td>{unknown(i.uom)}</td>{filter!=='AVAILABLE'&&<td>{reliable?i.required:'—'}</td>}{filter!=='REQUIRED'&&<><td>{unknown(i.newOnHand)} / {unknown(i.usedOnHand)}</td><td>{unknown(i.eligibleNewFree)} / {unknown(i.usedFreeBeforeSuitability)}</td><td>{unknown(i.held)} / {unknown(i.unknown)}</td><td>{unknown(i.remainingNew)} / {unknown(i.remainingUsedBeforeSuitability)}</td></>}{filter!=='AVAILABLE'&&<><td>{reliable?i.shortage:'—'}</td><td>{reliable?i.ignored:'—'}</td></>}</tr>)}</tbody></table></div>}
  </section>
  <footer className={s.footer}>Material planning only. No operational stock posting, procurement approval or quality release.</footer>
 </main>;
}

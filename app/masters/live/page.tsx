'use client';
/** Reuses existing FacilityOS masters-shell / panel / data-table styling and validators. */
import Link from 'next/link';
import {useState,type FormEvent} from 'react';
import {LIVE_KINDS,LIVE_FIELDS,LIVE_R1_VERSION,
 type LiveKind,type LiveRecord,type LiveScope} from '../../../lib/hft/live/live-contract.ts';
const blank:LiveScope={legalEntityId:'',siteId:'',warehouseId:''};
const fields:Readonly<Record<string,string>>={fullName:'Full name',department:'Department',
 designation:'Designation',uom:'UOM',controlType:'Control type',legalName:'Legal name',
 name:'Warehouse name',parentLocationId:'Parent location ID',siteName:'Site name'};
type AuditRow={revision:number;action:string;actor_subject:string;occurred_at:string;
 reason:string;event_sha256:string};
export default function LiveMastersPage(){
 const [kind,setKind]=useState<LiveKind>('EMPLOYEE'),[scope,setScope]=useState<LiveScope>(blank);
 const [recordId,setRecordId]=useState(''),[search,setSearch]=useState(''),[values,setValues]=useState<Record<string,string>>({});
 const [revision,setRevision]=useState(0),[operation,setOperation]=useState<'CREATE'|'UPDATE'|'DELETE'>('CREATE');
 const [reason,setReason]=useState(''),[records,setRecords]=useState<LiveRecord[]>([]);
 const [audit,setAudit]=useState<AuditRow[]>([]),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState('Corporate sign-in and a separately admitted production database are required.');
 const [unconfirmed,setUnconfirmed]=useState('');
 function reset(){setRecordId('');setRevision(0);setValues({});setAudit([]);setOperation('CREATE');setRecords([]);}
 async function api(body:unknown){
  const r=await fetch('/api/hft/live-masters',{method:'POST',credentials:'same-origin',
   cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await r.json() as {state:string;code?:string;data?:unknown};
  if(!r.ok||result.state!=='AUTHORITATIVE_RESULT')throw Error(result.code??'LIVE_R1_NOT_ADMITTED');
  return result.data;
 }
 const read=(intent:'GET'|'LIST'|'HISTORY',id=recordId)=>api({contractVersion:LIVE_R1_VERSION,
  intent,kind,scope,recordId:intent==='LIST'?'':id,search:intent==='LIST'?search:''});
 async function load(){
  if(busy||unconfirmed)return;setBusy(true);
  try{const rows=await read('LIST') as LiveRecord[];
   if(!Array.isArray(rows))throw Error('LIVE_R1_READ_INVALID');
   setRecords(rows);setMessage('Authoritative scoped PostgreSQL LIST returned '+rows.length+' records.');}
  catch(e){setMessage(e instanceof Error?e.message:'Unavailable');}finally{setBusy(false);}
 }
 async function select(r:LiveRecord){
  if(busy||unconfirmed)return;setBusy(true);
  try{
   const fresh=await read('GET',r.recordId) as LiveRecord;
   if(!fresh||fresh.recordId!==r.recordId||fresh.kind!==kind||JSON.stringify(fresh.scope)!==JSON.stringify(scope))
    throw Error('LIVE_R1_STALE_SELECTION');
   setRecordId(fresh.recordId);setValues({...fresh.values});setRevision(fresh.revision);
   setOperation('UPDATE');setAudit(await read('HISTORY',r.recordId) as AuditRow[]);
   setMessage('Reopened revision '+fresh.revision+'. Record is not stock-approved.');
  }catch(e){setMessage(e instanceof Error?e.message:'Read unavailable');}
  finally{setBusy(false);}
 }
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy||unconfirmed)return;
  const requestId=crypto.randomUUID();setBusy(true);
  setUnconfirmed(requestId);
  try{
   const result=await api({contractVersion:LIVE_R1_VERSION,intent:'SAVE',kind,
    scope,recordId:recordId.trim(),expectedRevision:revision,
    action:operation,requestId,reason:reason.trim(),
    values:operation==='DELETE'?{}:Object.fromEntries(LIVE_FIELDS[kind].map(f=>[f,(values[f]??'').trim()]))
   }) as {state:string;record:LiveRecord;requestId:string};
   if(result.state!=='SAVED_VERIFIED'||result.requestId!==requestId)throw Error('LIVE_R1_UNCONFIRMED');
   setUnconfirmed('');setRevision(result.record.revision);setOperation('UPDATE');
   setAudit(await read('HISTORY',recordId) as AuditRow[]);
   setMessage('Saved and independently read back revision '+result.record.revision+
    '. Business record remains RECORDED_UNAPPROVED.');await load();
  }catch(e){
   setMessage('Outcome not confirmed for original request '+requestId+'. '+(e instanceof Error?e.message:'')+
    ' Do not retry this mutation. Investigate the original request/audit first.');
  }finally{setBusy(false);}
 }
 async function signOut(){
  const r=await fetch('/api/hft/live-masters/signout',{method:'POST',credentials:'same-origin',
   headers:{Origin:window.location.origin}});
  if(r.ok){reset();setMessage('Signed out. Corporate sign-in is required.');}
  else setMessage('Sign-out not verified.');
 }
 return <main className="masters-shell">
  <header className="masters-head"><div><p className="eyebrow">FacilityOS / Production R1</p>
   <h1>Live Masters</h1><p>Employee, Item, Supplier, Warehouse, Location, Site</p></div>
   <Link href="/">Home</Link></header>
  <section className="panel"><p role="status">{message}</p>
   <p className="masters-help">Saved record ≠ approved stock or procurement authority. Production release gates remain separate.</p>
   <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
    <a href="/api/hft/live-masters/auth/start">Corporate sign-in</a>
    <button onClick={()=>void signOut()} disabled={busy}>Sign out</button></div>
   {unconfirmed&&<p role="alert">UNCONFIRMED request: {unconfirmed}. No blind retry is allowed.</p>}
  </section>
  <section className="panel"><h2>Record scope</h2><div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
   {(['legalEntityId','siteId','warehouseId'] as const).map(f=><label key={f}>{f}
    <input value={scope[f]} disabled={busy||!!unconfirmed}
     onChange={e=>{reset();setScope(prev=>({...prev,[f]:e.target.value.toUpperCase()}));}}/></label>)}
   <label>Master type<select value={kind} disabled={busy||!!unconfirmed}
    onChange={e=>{reset();setKind(e.target.value as LiveKind);}}>
    {LIVE_KINDS.map(k=><option key={k}>{k}</option>)}</select></label>
  </div></section>
  <div className="masters-grid">
   <section className="panel"><h2>Search and reopen</h2>
    <input value={search} maxLength={80} placeholder="Record ID" onChange={e=>setSearch(e.target.value)}/>
    <button onClick={()=>void load()} disabled={busy||!!unconfirmed}>Search / refresh</button>
    <div className="masters-table-wrap"><table className="data-table"><thead><tr>
     <th>ID</th><th>Revision</th><th>Status</th><th>Action</th></tr></thead>
     <tbody>{records.map(r=><tr key={r.recordId}><td>{r.recordId}</td><td>{r.revision}</td>
      <td>{r.deleted?'Soft deleted':'Recorded—not approved'}</td>
      <td><button onClick={()=>void select(r)} disabled={busy||!!unconfirmed}>Reopen</button></td></tr>)}</tbody>
    </table></div>
   </section>
   <section className="panel"><h2>{operation} {kind}</h2>
    <button type="button" onClick={reset} disabled={busy||!!unconfirmed}>New record</button>
    <form onSubmit={e=>void save(e)}>
     <label>Record ID<input required value={recordId} disabled={busy||!!unconfirmed||operation!=='CREATE'}
      onChange={e=>setRecordId(e.target.value.toUpperCase())}/></label>
     <p>Expected revision: {revision}</p>
     {LIVE_FIELDS[kind].map(f=><label key={f}>{fields[f]??f}<input
      value={values[f]??''} disabled={busy||!!unconfirmed||operation==='DELETE'}
      onChange={e=>setValues(p=>({...p,[f]:e.target.value}))}/></label>)}
     <label>Reason<textarea required minLength={8} value={reason} disabled={busy||!!unconfirmed}
      onChange={e=>setReason(e.target.value)}/></label>
     <div style={{display:'flex',gap:8}}>
      <button className="primary-button" disabled={busy||!!unconfirmed} type="submit">Save {operation}</button>
      {revision>0&&<button type="button" disabled={busy||!!unconfirmed} onClick={()=>setOperation('DELETE')}>
       Prepare soft delete</button>}</div>
    </form>
   </section>
  </div>
  <section className="panel"><h2>Immutable revision history</h2>
   <div className="masters-table-wrap"><table className="data-table"><thead><tr>
    <th>Revision</th><th>Change</th><th>Actor</th><th>When</th><th>Audit digest</th></tr></thead>
    <tbody>{audit.map(a=><tr key={a.revision}><td>{a.revision}</td><td>{a.action}</td>
     <td>{a.actor_subject}</td><td>{a.occurred_at}</td><td><code>{a.event_sha256}</code></td></tr>)}</tbody>
   </table></div>
  </section>
 </main>;
}

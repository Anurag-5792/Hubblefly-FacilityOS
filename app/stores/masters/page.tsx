'use client';
import {useState,type FormEvent} from 'react';

type Kind='EMPLOYEE'|'ITEM'|'SUPPLIER'|'WAREHOUSE'|'LOCATION';
type Operation='CREATE'|'EDIT'|'ACTIVATE'|'DEACTIVATE';
type Item=Record<string,unknown>;
type Field=Readonly<{name:string;label:string;hint?:string;options?:readonly string[]}>;
const kinds:readonly Kind[]=['EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION'];
const fields:Readonly<Record<Kind,readonly Field[]>>={
 EMPLOYEE:[{name:'fullName',label:'Full name'},
  {name:'department',label:'Department'},{name:'designation',label:'Designation'},
  {name:'siteId',label:'Employee site ID'}],
 ITEM:[{name:'uom',label:'Unit of measure'},
  {name:'controlType',label:'Traceability',options:['NONE','BATCH','SERIAL']}],
 SUPPLIER:[{name:'legalName',label:'Supplier legal name'}],
 WAREHOUSE:[{name:'name',label:'Warehouse name'},{name:'siteId',label:'Warehouse site ID'}],
 LOCATION:[{name:'parentLocationId',label:'Parent location ID',hint:'Blank for top-level location'}]
};
const empty:Readonly<Record<Kind,string>>={
 EMPLOYEE:'Employee ID',ITEM:'Item code',SUPPLIER:'Supplier ID',
 WAREHOUSE:'Warehouse ID',LOCATION:'Location ID'
};
type View='LIST'|'REQUESTS';
type Reply={state?:string;code?:string;records?:readonly Item[]};
export default function MastersPage(){
 const [kind,setKind]=useState<Kind>('EMPLOYEE');
 const [entity,setEntity]=useState(''),[site,setSite]=useState(''),
  [warehouse,setWarehouse]=useState('');
 const [view,setView]=useState<View>('LIST'),[search,setSearch]=useState('');
 const [records,setRecords]=useState<readonly Item[]>([]);
 const [operation,setOperation]=useState<Operation>('CREATE');
 const [recordId,setRecordId]=useState(''),[version,setVersion]=useState('0');
 const [reason,setReason]=useState(''),[values,setValues]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('No verified database result loaded.');
 const scope={legalEntityId:entity.trim(),siteId:site.trim(),warehouseId:warehouse.trim()};
 function changeKind(next:Kind){setKind(next);setRecords([]);setValues({});
  setRecordId('');setVersion('0');setOperation('CREATE');setStatus('Select scope and load authoritative records.');}
 async function call(payload:unknown):Promise<Reply>{
  const response=await fetch('/api/hft/masters',{method:'POST',
   headers:{'Content-Type':'application/json'},credentials:'same-origin',
   cache:'no-store',body:JSON.stringify(payload)});
  const result=await response.json() as Reply;
  if(!response.ok)throw new Error(result.code||'P3_REQUEST_FAILED');
  return result;
 }
 async function load(selected:View=view){
  setBusy(true);setStatus('Checking signed session and persistent source.');
  try{
   const result=await call({intent:selected,kind,...scope,search:search.trim()});
   setRecords(result.records||[]);
   setView(selected);
   setStatus(result.records?.length?
    'Database records received. Read-only view.':
    'No records returned for this scope; no sample records inserted.');
  }catch(e){setRecords([]);setStatus(e instanceof Error?e.message:'Source unavailable');}
  finally{setBusy(false);}
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);
  setStatus('Submitting immutable change request; no master activation has occurred.');
  try{
   const v:Record<string,string>={};
   if(operation==='CREATE'||operation==='EDIT')
    for(const f of fields[kind])v[f.name]=(values[f.name]||'').trim();
   const result=await call({intent:'SUBMIT',change:{
    contractVersion:'HFT-R1-P3-MASTER-V1',requestId:crypto.randomUUID(),
    kind,operation,...scope,recordId:recordId.trim(),expectedVersion:version.trim(),
    reason:reason.trim(),values:v}});
   if(result.state!=='PENDING_APPROVAL')throw new Error('P3_APPROVAL_STATE_NOT_CONFIRMED');
   setStatus('Request persisted and read back: PENDING APPROVAL. No operational master was changed.');
   setView('REQUESTS');setRecords(result.records||[]);
  }catch(e){setStatus(e instanceof Error?e.message:'Request unavailable');}
  finally{setBusy(false);}
 }
 function selectRow(row:Item){
  const id=String(row.record_id||'');
  setRecordId(id);setVersion(String(row.version||'0'));setOperation('EDIT');
  const val=row.values;
  if(val&&typeof val==='object'&&!Array.isArray(val))
   setValues(Object.fromEntries(Object.entries(val as Record<string,unknown>)
    .map(([k,v])=>[k,typeof v==='string'?v:''])));
  setStatus('Drafting a change for '+id+'. Existing data will not change without approval.');
 }
 return <main className="masters-shell">
  <header className="masters-head">
   <div><a href="/stores" className="mis-link">Stores / Master Data</a>
    <p className="eyebrow">HFT FacilityOS · Nonproduction source candidate</p>
    <h1>Employee & Stores Masters</h1>
    <p>Every change is a request. No master is activated by submitting this form.
     Signed sessions, scoped permissions and a qualified database are required.</p>
   </div>
   <a href="/" className="masters-back">Operations home</a>
  </header>
  <section className="panel" aria-label="Authority scope">
   <div className="panel-heading"><div><p className="eyebrow">Authority</p><h2>Signed scope</h2></div>
    <span className="status">Database source required</span></div>
   <div className="masters-scope">
    <label>Legal entity ID<input value={entity} onChange={e=>setEntity(e.target.value)}
      placeholder="From your authorized entity"/></label>
    <label>Site ID<input value={site} onChange={e=>setSite(e.target.value)}
      placeholder="From your authorized site"/></label>
    <label>Warehouse ID<input value={warehouse} onChange={e=>setWarehouse(e.target.value)}
      placeholder="From your authorized warehouse"/></label>
   </div>
   <p className="masters-help">These fields select a scope. They never grant access; the API verifies the signed session and persisted permissions.</p>
  </section>
  <div className="masters-columns">
   <section className="panel">
    <div className="panel-heading"><div><p className="eyebrow">Persistent records</p><h2>Search & review</h2></div></div>
    <label className="masters-field">Master type
     <select value={kind} onChange={e=>changeKind(e.target.value as Kind)}>
      {kinds.map(k=><option key={k} value={k}>{k}</option>)}
     </select>
    </label>
    <label className="masters-field">Search IDs<input value={search} onChange={e=>setSearch(e.target.value)}
      placeholder="Optional record ID filter" maxLength={80}/></label>
    <div className="masters-actions">
     <button type="button" disabled={busy} onClick={()=>void load('LIST')}>Load masters</button>
     <button type="button" disabled={busy} onClick={()=>void load('REQUESTS')}>Pending / denied requests</button>
      {kind==='EMPLOYEE'?<a className="mis-link" href="/stores/masters/approvals">
        Independent Employee approvals</a>:null}
    </div>
    <div className="masters-table-wrap">
     <table className="data-table"><thead><tr><th>ID</th><th>State</th><th>Revision</th><th>Action</th></tr></thead>
     <tbody>{records.map((record,i)=>{
      const recordKey=String(record.record_id||record.request_id||i);
      const state=String(record.state|| (record.active?'ACTIVE':'INACTIVE'));
      return <tr key={recordKey}><td>{recordKey}</td>
       <td><span className="status">{state.replaceAll('_',' ')}</span></td>
       <td>{String(record.version||record.expected_version||'—')}</td>
       <td>{view==='LIST'?<button type="button" disabled={busy} onClick={()=>selectRow(record)}>Request edit</button>:
        String(record.operation||'')}</td></tr>;
     })}</tbody>
     </table>
     {records.length===0?<p className="masters-help">No verified records available for this selection.</p>:null}
    </div>
   </section>
   <section className="panel">
    <div className="panel-heading"><div><p className="eyebrow">Governed workflow</p><h2>Propose a change</h2></div>
     <span className="status">No automatic approval</span></div>
    <form onSubmit={e=>void submit(e)} className="masters-form">
     <label>Operation<select value={operation} onChange={e=>{
      const op=e.target.value as Operation;setOperation(op);if(op==='CREATE')setVersion('0');}}>
      <option value="CREATE">Register inactive draft</option>
      <option value="EDIT">Request field revision</option>
      <option value="ACTIVATE">Request activation</option>
      <option value="DEACTIVATE">Request deactivation</option>
     </select></label>
     <label>{empty[kind]}<input required value={recordId} onChange={e=>setRecordId(e.target.value)}
      placeholder={empty[kind]}/></label>
     <label>Expected record revision<input required value={version} onChange={e=>setVersion(e.target.value)}
      inputMode="numeric"/></label>
     {operation==='CREATE'||operation==='EDIT'?fields[kind].map(field=>
      <label key={field.name}>{field.label}
       {field.options?<select value={values[field.name]||''} onChange={e=>setValues(v=>({...v,[field.name]:e.target.value}))}>
        <option value="">Select</option>{field.options.map(o=><option key={o}>{o}</option>)}</select>:
       <input value={values[field.name]||''} onChange={e=>setValues(v=>({...v,[field.name]:e.target.value}))}
         placeholder={field.hint||field.label} required={field.name!=='parentLocationId'}/>}
      </label>):null}
     <label>Reason for change<textarea required minLength={8} maxLength={300} value={reason}
       onChange={e=>setReason(e.target.value)} placeholder="Explain the business reason and supporting evidence"/></label>
     <button type="submit" className="primary-button" disabled={busy}>
      {busy?'Verifying…':'Submit for independent approval'}</button>
     <p className="masters-help">CREATE stages an inactive record. EDIT cannot change active status.
      ACTIVATE / DEACTIVATE require separate approval authority, not this form.</p>
    </form>
   </section>
  </div>
  <div role="status" aria-live="polite" className="masters-result">{status}</div>
 </main>;
}

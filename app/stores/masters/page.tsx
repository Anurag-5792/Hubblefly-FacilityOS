'use client';
import Link from 'next/link';
import {useState,useRef,type FormEvent} from 'react';
import {EmployeeMasterDirectory} from '../../../lib/hft/ui-reuse/EmployeeMasterDirectory';
import {OwnerAccessProposalEditor} from '../../../lib/hft/ui-reuse/OwnerAccessProposalEditor';
import {readEmployeeDirectory,bindEmployeeEditSelection,
 assertCurrentEmployeeEdit,sameEmployeeScope,
 type EmployeeMasterRow,type EmployeeScope,type EmployeeEditSelection}
 from '../../../lib/hft/ui-reuse/employee-view-model';

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
 type EmployeeListContext=Readonly<{
  sourceScope:EmployeeScope;readEpoch:number;records:readonly Item[]
 }>;
 const [employeeList,setEmployeeList]=useState<EmployeeListContext|null>(null);
 const employeeListRef=useRef<EmployeeListContext|null>(null);
 const employeeEditRef=useRef<EmployeeEditSelection|null>(null);
 const requestEpoch=useRef(0);
 const [operation,setOperation]=useState<Operation>('CREATE');
 const [recordId,setRecordId]=useState(''),[version,setVersion]=useState('0');
 const [reason,setReason]=useState(''),[values,setValues]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[submitting,setSubmitting]=useState(false);
 const [status,setStatus]=useState('No verified database result loaded.');
 const [lastRequestId,setLastRequestId]=useState('');
 const scope={legalEntityId:entity.trim(),siteId:site.trim(),warehouseId:warehouse.trim()};
 function clearEmployeeSelection(){
  employeeEditRef.current=null;
  setRecordId('');setVersion('0');setValues({});setReason('');
  setOperation('CREATE');
 }
 function clearEmployeeList(){
  employeeListRef.current=null;setEmployeeList(null);
 }
 function scopeChanged(setter:(value:string)=>void,value:string){
  if(submitting)return;
  // Epoch and refs change synchronously, before any pending LIST can resolve.
  requestEpoch.current++;setter(value);setRecords([]);clearEmployeeList();
  clearEmployeeSelection();setView('LIST');setLastRequestId('');setBusy(false);
  setStatus('Scope changed. Fresh authenticated LIST and selection required for Employee EDIT.');
 }
 function changeKind(next:Kind){
  requestEpoch.current++;setKind(next);setRecords([]);clearEmployeeList();
  clearEmployeeSelection();setLastRequestId('');
  setStatus('Select scope and load authoritative records.');
 }
 async function call(payload:unknown):Promise<Reply>{
  const response=await fetch('/api/hft/masters',{method:'POST',
   headers:{'Content-Type':'application/json'},credentials:'same-origin',
   cache:'no-store',body:JSON.stringify(payload)});
  const result=await response.json() as Reply;
  if(!response.ok)throw new Error(result.code||'P3_REQUEST_FAILED');
  return result;
 }
 async function load(selected:View=view){
  const epoch=++requestEpoch.current;
  const readScope:EmployeeScope={...scope};
  setBusy(true);clearEmployeeList();setRecords([]);
  if(kind==='EMPLOYEE')clearEmployeeSelection();
  setStatus('Checking signed session and persisted P3 scope.');
  try{
   const result=await call({intent:selected,kind,...readScope,search:search.trim()});
   if(epoch!==requestEpoch.current)return; // Stale async LIST is never published.
   if(result.state!=='AVAILABLE'||!Array.isArray(result.records))
    throw new Error('P3_SIGNED_LIST_READBACK_NOT_AVAILABLE');
   if(kind==='EMPLOYEE'&&selected==='LIST'){
    // Reject an inconsistent complete readback before creating a selection source.
    readEmployeeDirectory(result.records,readScope);
    const context:EmployeeListContext={
     sourceScope:Object.freeze({...readScope}),readEpoch:epoch,records:result.records};
    employeeListRef.current=context;setEmployeeList(context);
   }
   setRecords(result.records);setView(selected);
   setStatus(result.records.length?
    'Scoped database response received; no records changed.':
    'No verified records available for this scope.');
  }catch(e){
   if(epoch===requestEpoch.current){
    setRecords([]);clearEmployeeList();
    setStatus(e instanceof Error?e.message:'Source unavailable');
   }
  }finally{if(epoch===requestEpoch.current)setBusy(false);}
 }
 async function verifySavedRequest(){
  if(!lastRequestId||busy)return;
  const id=lastRequestId,epoch=++requestEpoch.current;
  setBusy(true);
  setStatus('Fresh signed database read of the saved request. This does not activate a master.');
  try{
   const verified=await call({intent:'REQUESTS',kind,...scope,search:''});
   if(epoch!==requestEpoch.current)return;
   const saved=verified.records?.find(x=>x.request_id===id);
   if(verified.state!=='AVAILABLE'||!saved)
    throw Error('P3_SAVED_REQUEST_NOT_IN_AUTHENTICATED_READ_NO_RETRY');
   setRecords(verified.records||[]);setView('REQUESTS');
   setStatus('Independent readback confirmed request '+id+
    ' as '+String(saved.state)+'. Check master LIST after governed approval; request is not an active master.');
  }catch(e){
   if(epoch===requestEpoch.current)setStatus(
    e instanceof Error?e.message:'Saved request readback unavailable');
  }finally{if(epoch===requestEpoch.current)setBusy(false);}
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy)return;
  // Mandatory preflight occurs BEFORE random UUID generation and ANY fetch.
  if(kind==='EMPLOYEE'&&operation==='EDIT'){
   try{
    assertCurrentEmployeeEdit(employeeEditRef.current,scope,requestEpoch.current,
     recordId.trim(),version.trim());
   }catch{
    clearEmployeeSelection();
    setStatus('C050_EMPLOYEE_EDIT_STALE_SELECTION_SCOPE_OR_REVISION — fresh authenticated LIST and selection required.');
    return;
   }
  }
  const epoch=++requestEpoch.current;
  clearEmployeeList();employeeEditRef.current=null;
  setBusy(true);setSubmitting(true);
  setStatus('Submitting immutable change request; no master activation has occurred.');
  try{
   const v:Record<string,string>={};
   if(operation==='CREATE'||operation==='EDIT')
    for(const f of fields[kind])v[f.name]=(values[f.name]||'').trim();
   const requestId=crypto.randomUUID();
   const result=await call({intent:'SUBMIT',change:{
    contractVersion:'HFT-R1-P3-MASTER-V1',requestId,
    kind,operation,...scope,recordId:recordId.trim(),expectedVersion:version.trim(),
    reason:reason.trim(),values:v}});
   if(epoch!==requestEpoch.current)return;
   if(result.state!=='PENDING_APPROVAL')throw new Error('P3_APPROVAL_STATE_NOT_CONFIRMED');
   setLastRequestId(requestId);
   setStatus('Saved and read back pending request '+requestId+
    '. No master was created or activated. Verify again using an independent signed request.');
   setView('REQUESTS');setRecords(result.records||[]);
  }catch(e){
   if(epoch===requestEpoch.current)
    setStatus(e instanceof Error?e.message:'Request unavailable');
  }finally{
   if(epoch===requestEpoch.current){setBusy(false);setSubmitting(false);}
  }
 }
 function selectRow(row:Item){
  const id=String(row.record_id||'');
  setRecordId(id);setVersion(String(row.version||'0'));setOperation('EDIT');
  const val=row.master_values??row.values;
  if(val&&typeof val==='object'&&!Array.isArray(val))
   setValues(Object.fromEntries(Object.entries(val as Record<string,unknown>)
    .map(([k,v])=>[k,typeof v==='string'?v:''])));
  setStatus('Drafting a change for '+id+'. Existing data will not change without approval.');
 }
 function selectEmployee(row:EmployeeMasterRow){
  const context=employeeListRef.current;
  if(kind!=='EMPLOYEE'||view!=='LIST'||!context||
     context.readEpoch!==requestEpoch.current||
     !sameEmployeeScope(context.sourceScope,scope)){
   setStatus('Employee source scope changed. Fresh LIST required.');return;
  }
  try{
   // Only a row returned by this same verified LIST/revision may be selected.
   const original=readEmployeeDirectory(context.records,context.sourceScope)
    .find(r=>r.recordId===row.recordId&&r.version===row.version);
   if(!original)throw Error('C050_EMPLOYEE_SELECTION_NOT_IN_LIST');
   const selected=bindEmployeeEditSelection(original,context.sourceScope,
    context.readEpoch);
   employeeEditRef.current=selected;
   setRecordId(original.recordId);setVersion(original.version);setOperation('EDIT');
   setReason('');setValues({fullName:original.fullName,department:original.department,
    designation:original.designation,siteId:original.siteId});
   setStatus('P3 Employee EDIT draft selected. Submit via independent approval workflow.');
  }catch{
   clearEmployeeSelection();
   setStatus('Employee selection no longer qualified. Fresh LIST required.');
  }
 }
 return <main className="masters-shell">
  <header className="masters-head">
   <div><Link href="/stores" className="mis-link">Stores / Master Data</Link>
    <p className="eyebrow">HFT FacilityOS · Nonproduction source candidate</p>
    <h1>Employee & Stores Masters</h1>
    <p>Every change is a request. No master is activated by submitting this form.
     Signed sessions, scoped permissions and a qualified database are required.</p>
   </div>
   <Link href="/" className="masters-back">Operations home</Link>
  </header>
  <section className="panel" aria-label="Authority scope">
   <div className="panel-heading"><div><p className="eyebrow">Authority</p><h2>Signed scope</h2></div>
    <span className="status">Database source required</span></div>
   <div className="masters-scope">
    <label>Legal entity ID<input value={entity} disabled={submitting}
      onChange={e=>scopeChanged(setEntity,e.target.value)}
      placeholder="From your authorized entity"/></label>
    <label>Site ID<input value={site} disabled={submitting}
      onChange={e=>scopeChanged(setSite,e.target.value)}
      placeholder="From your authorized site"/></label>
    <label>Warehouse ID<input value={warehouse} disabled={submitting}
      onChange={e=>scopeChanged(setWarehouse,e.target.value)}
      placeholder="From your authorized warehouse"/></label>
   </div>
   <p className="masters-help">These fields select a scope. They never grant access; the API verifies the signed session and persisted permissions.</p>
  </section>
  <div className="masters-columns">
   <section className="panel">
    <div className="panel-heading"><div><p className="eyebrow">Persistent records</p><h2>Search & review</h2></div></div>
    <label className="masters-field">Master type
     <select value={kind} disabled={busy} onChange={e=>changeKind(e.target.value as Kind)}>
      {kinds.map(k=><option key={k} value={k}>{k}</option>)}
     </select>
    </label>
    <label className="masters-field">Search IDs<input value={search} onChange={e=>setSearch(e.target.value)}
      placeholder="Optional record ID filter" maxLength={80}/></label>
    {kind==='ITEM'?<section className="masters-help" aria-label="Item version photo requirements">
      <strong>Mandatory photographs for every product version</strong>
      <p>Each Item Code needs a separate version list (including retired versions), with one verified
      PRIMARY photograph and optional additional views per version. Product version is different
      from the Item Master record revision. Missing historical photos remain visibly incomplete.</p>
      <p>Version gallery, media upload and approvals: NOT YET QUALIFIED. This form does not
      upload a photo, import DD media, or claim that a version has approved photographs.</p>
    </section>:null}
    <div className="masters-actions">
     <button type="button" disabled={busy} onClick={()=>void load('LIST')}>Load masters</button>
     <button type="button" disabled={busy} onClick={()=>void load('REQUESTS')}>Pending / denied requests</button>
     {lastRequestId?<button type="button" disabled={busy}
      onClick={()=>void verifySavedRequest()}>Re-read saved request</button>:null}
      {kind==='EMPLOYEE'?<Link className="mis-link" href="/stores/masters/approvals">
        Independent Employee approvals</Link>:null}
    </div>
    {kind==='EMPLOYEE'&&view==='LIST'?
     <EmployeeMasterDirectory rawP3Records={
      employeeList&&employeeList.readEpoch===requestEpoch.current&&
       sameEmployeeScope(employeeList.sourceScope,scope)?employeeList.records:[]}
      requestedScope={scope}
      verifiedReadResponse={Boolean(employeeList&&
       employeeList.readEpoch===requestEpoch.current&&
       sameEmployeeScope(employeeList.sourceScope,scope))}
      mayRequestEdit={!busy}
      onRequestEdit={selectEmployee}
     />:<div className="masters-table-wrap">
     <table className="data-table"><thead><tr><th>ID</th><th>State</th><th>Revision</th><th>Action</th></tr></thead>
     <tbody>{records.map((record,i)=>{
      const recordKey=String(record.record_id||record.request_id||i);
      const state=String(record.state|| (record.active?'ACTIVE':'INACTIVE'));
      return <tr key={recordKey}><td>{recordKey}</td>
       <td><span className="status">{state.replaceAll('_',' ')}</span></td>
       <td>{String(record.version||record.expected_version||'—')}</td>
       <td>{view==='LIST'?<div className="item-master-actions">
        <button type="button" disabled={busy} onClick={()=>selectRow(record)}>Request edit</button>
        {kind==='ITEM'?<Link className="mis-link"
         href={'/stores/items/'+encodeURIComponent(recordKey)}>View all product versions</Link>:null}
       </div>:String(record.operation||'')}</td></tr>;
     })}</tbody>
     </table>
     {records.length===0?<p className="masters-help">No verified records available for this selection.</p>:null}
    </div>}
   </section>
   <section className="panel">
    <div className="panel-heading"><div><p className="eyebrow">Governed workflow</p><h2>Propose a change</h2></div>
     <span className="status">No automatic approval</span></div>
    <form onSubmit={e=>void submit(e)} className="masters-form">
     <label>Operation<select value={operation} onChange={e=>{
      const op=e.target.value as Operation;
      if(kind==='EMPLOYEE'&&op!==operation)clearEmployeeSelection();
      setOperation(op);if(op==='CREATE')setVersion('0');}}>
      <option value="CREATE">Propose registration (not an active master)</option>
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
     <p className="masters-help">SUBMIT saves a protected pending request, not a Master.
      Employee approval and APPLY need a different qualified human; Item, Supplier, Warehouse
      and Location APPLY remain unqualified. After approval, re-read the master LIST.</p>
    </form>
   </section>
  </div>
  <details className="panel" aria-label="OWNER access proposal readiness">
   <summary>OWNER route-access proposals — source integrated, IAM authority HOLD</summary>
   <OwnerAccessProposalEditor
    actor={null}
    legalEntityId={scope.legalEntityId}
    siteId={scope.siteId}
    warehouseId={scope.warehouseId}
    policyGeneration={0}
    onPropose={()=>{setStatus('IAM proposal not submitted: protected authority not installed.');}}
   />
  </details>
  <div role="status" aria-live="polite" className="masters-result">{status}</div>
 </main>;
}

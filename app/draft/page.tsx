'use client';
import Link from 'next/link';
import {useRef,useState,type ChangeEvent,type FormEvent} from 'react';
import {DRAFT_CONTRACT,DRAFT_KINDS,type DraftKind,type DraftRecord,
 type DraftSave,type DraftScope} from '../../lib/hft/draft/draft-contract.ts';
import {importHeaders,fieldGuide,blankImportCsv,previewP3ImportCsv,
 exportP3Csv,type TransferPreview} from '../../lib/hft/masters/p3-csv-transfer.ts';
import {blankP3Xlsx,sampleP3Xlsx,fictionalP3SampleRow,
 previewP3ImportXlsx,exportP3Xlsx,XLSX_MIME}
 from '../../lib/hft/masters/p3-xlsx-transfer.ts';

const kinds:readonly DraftKind[]=DRAFT_KINDS;
const fieldNames:Readonly<Record<DraftKind,readonly string[]>>={
 LEGAL_ENTITY:['legalName'],SITE:['siteName'],
 EMPLOYEE:['fullName','department','designation','siteId'],
 ITEM:['uom','controlType'],SUPPLIER:['legalName'],
 WAREHOUSE:['name','siteId'],LOCATION:['parentLocationId']
};
const blankScope={legalEntityId:'',siteId:'',warehouseId:''};
type Reply={state?:string;code?:string;record?:DraftRecord;
 records?:DraftRecord[];results?:{row:number;recordId:string;state:string;
 code?:string;revision?:number}[];confirmed?:number};
type Preview=Readonly<TransferPreview&{filename:string;format:'CSV'|'XLSX';
 scopeKey:string}>;
function download(name:string,content:string|Uint8Array,mime:string){
 const data=typeof content==='string'?new Blob([content],{type:mime}):
  new Blob([content.slice().buffer as ArrayBuffer],{type:mime});
 const url=URL.createObjectURL(data),a=document.createElement('a');
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 URL.revokeObjectURL(url);
}
function csv(rows:readonly (readonly string[])[]){
 const escaped=(x:string)=>/[",\r\n]/.test(x)?'"'+x.replaceAll('"','""')+'"':x;
 return '\ufeff'+rows.map(r=>r.map(escaped).join(',')).join('\r\n')+'\r\n';
}
function isMissingSession(code:string|undefined){
 return code==='DRAFT077_SIGNED_SESSION_REQUIRED';
}
async function api(payload:unknown):Promise<Reply>{
 const response=await fetch('/api/hft/draft',{
  method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
 });
 const data=await response.json() as Reply;
 if(!response.ok)throw Error(data.code||'DRAFT077_REQUEST_REJECTED');
 return data;
}
function exportRow(r:DraftRecord):Record<string,unknown>{
 return {kind:r.kind,legal_entity_id:r.legal_entity_id,site_id:r.site_id,
  warehouse_id:r.warehouse_id,record_id:r.record_id,
  version:r.revision,state:'DRAFT — NOT APPROVED',values:r.values,
  reason:'',active:false};
}
export default function DraftPage(){
 const [kind,setKind]=useState<DraftKind>('EMPLOYEE');
 const [scope,setScope]=useState<DraftScope>(blankScope);
 const [recordId,setRecordId]=useState('');
 const [reason,setReason]=useState('');
 const [values,setValues]=useState<Record<string,string>>({});
 const [operation,setOperation]=useState<'CREATE'|'EDIT'>('CREATE');
 const [revision,setRevision]=useState('0');
 const [search,setSearch]=useState('');
 const [records,setRecords]=useState<DraftRecord[]>([]);
 const [busy,setBusy]=useState(false);
 const [signedIn,setSignedIn]=useState<boolean|null>(null);
 const [status,setStatus]=useState('Sign in to access retained draft records.');
 const [preview,setPreview]=useState<Preview|null>(null);
 const [batchResults,setBatchResults]=useState<NonNullable<Reply['results']>>([]);
 const epoch=useRef(0);
 const scopeKey=JSON.stringify([kind,scope]);
 const accepted=preview?.scopeKey===scopeKey?preview:null;
 const scopeReady=Object.values(scope).every(v=>/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(v));
 function reset(nextKind?:DraftKind){
  epoch.current++;setRecords([]);setPreview(null);setBatchResults([]);
  setRecordId('');setRevision('0');setValues({});setReason('');
  setOperation('CREATE');
  if(nextKind)setKind(nextKind);
 }
 function editScope(key:keyof DraftScope,next:string){
  if(busy)return;
  reset();setScope(prev=>({...prev,[key]:next.toUpperCase()}));
 }
 async function load(){
  if(!scopeReady||busy)return;
  const n=++epoch.current;setBusy(true);setRecords([]);
  setStatus('Reading retained draft records with a verified signed session.');
  try{
   const data=await api({contractVersion:DRAFT_CONTRACT,intent:'READ',
    ...scope,kind,search:search.trim()});
   if(n!==epoch.current)return;
   if(data.state!=='DRAFT_ONLY'||!Array.isArray(data.records))
    throw Error('DRAFT077_READ_NOT_VERIFIED');
   setRecords(data.records);setSignedIn(true);
   setStatus('Fresh database read: '+data.records.length+
    ' DRAFT — NOT APPROVED records. No operational Master activated.');
  }catch(error){
   if(n!==epoch.current)return;
   const code=error instanceof Error?error.message:'DRAFT077_READ_UNAVAILABLE';
   setSignedIn(!isMissingSession(code));
   setStatus(code);
  }finally{if(n===epoch.current)setBusy(false);}
 }
 function newDraft(){
  reset();setStatus('Creating a new DRAFT — NOT APPROVED record.');
 }
 function edit(r:DraftRecord){
  if(busy)return;
  if(r.kind!==kind||r.legal_entity_id!==scope.legalEntityId||
   r.site_id!==scope.siteId||r.warehouse_id!==scope.warehouseId){
   setStatus('DRAFT077_EDIT_SCOPE_DRIFT');return;
  }
  setRecordId(r.record_id);setValues({...r.values});
  setRevision(String(r.revision));setOperation('EDIT');
  setStatus('Editing draft '+r.record_id+' at revision '+r.revision+
   '. Save uses optimistic revision checks.');
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!scopeReady||busy)return;
  const n=++epoch.current;setBusy(true);setStatus('Saving provisional draft...');
  const cmd:DraftSave={contractVersion:DRAFT_CONTRACT,intent:'SAVE',
   ...scope,kind,recordId:recordId.trim(),operation,
   expectedRevision:revision,reason:reason.trim(),
   writeId:crypto.randomUUID(),source:'MANUAL',values:Object.fromEntries(
    fieldNames[kind].map(k=>[k,(values[k]||'').trim()]))};
  try{
   const result=await api(cmd);
   if(n!==epoch.current)return;
   if(result.state!=='SAVED_DRAFT_NOT_APPROVED'||!result.record)
    throw Error('DRAFT077_SAVE_READBACK_UNVERIFIED_NO_RETRY');
   setSignedIn(true);setOperation('EDIT');
   setRevision(String(result.record.revision));
   setRecords(prev=>[...prev.filter(x=>x.record_id!==result.record?.record_id),
    result.record!].sort((a,b)=>a.record_id.localeCompare(b.record_id)));
   setStatus('Committed and reopened '+result.record.record_id+
    ' at revision '+result.record.revision+' — DRAFT — NOT APPROVED.');
  }catch(error){
   if(n===epoch.current)setStatus((error instanceof Error?error.message:'SAVE_UNAVAILABLE')+
    '. Do not retry blindly; READ the record before another save.');
  }finally{if(n===epoch.current)setBusy(false);}
 }
 async function importFile(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value='';
  if(!file||!scopeReady||busy)return;
  setPreview(null);setBatchResults([]);
  const key=scopeKey;
  try{
   const x:TransferPreview=/\.xlsx$/i.test(file.name)?
    await previewP3ImportXlsx(new Uint8Array(await file.arrayBuffer()),kind,scope):
    /\.csv$/i.test(file.name)?
      previewP3ImportCsv(await file.text(),kind,scope):
      (()=>{throw Error('DRAFT077_CSV_OR_XLSX_ONLY');})();
   if(key!==JSON.stringify([kind,scope]))return;
   setPreview({...x,filename:file.name,
    format:/\.xlsx$/i.test(file.name)?'XLSX':'CSV',scopeKey:key});
   setStatus('Preview: '+x.validRows.length+' valid, '+x.issues.length+
    ' invalid. No database write has happened.');
  }catch(error){setStatus(error instanceof Error?error.message:'DRAFT077_FILE_INVALID');}
 }
 async function submitImport(){
  if(!accepted||busy||!scopeReady||accepted.validRows.length===0)return;
  const n=++epoch.current;setBusy(true);setBatchResults([]);
  const rows=accepted.validRows.map(r=>({
   sourceRow:r.sourceRow,change:{
    contractVersion:DRAFT_CONTRACT,intent:'SAVE',operation:'CREATE',
    ...scope,kind,recordId:r.recordId,expectedRevision:'0',
    reason:r.reason,writeId:crypto.randomUUID(),
    source:accepted.format,values:r.values
   }
  }));
  const invalid=accepted.issues.map(issue=>({
   row:issue.row,recordId:issue.recordId,state:'INVALID',code:issue.code
  }));
  setPreview(null); // An uncertain result must not be resubmitted.
  try{
   const response=await fetch('/api/hft/draft',{method:'POST',
    credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({contractVersion:DRAFT_CONTRACT,intent:'BATCH',
     ...scope,kind,rows})});
   const result=await response.json() as Reply;
   if(n!==epoch.current)return;
   if(!['DRAFT_BATCH_RESULT','PARTIAL_STOP_NO_RETRY'].includes(result.state||'')||
    !Array.isArray(result.results))
    throw Error(result.code||'DRAFT077_BATCH_OUTCOME_NOT_VERIFIED');
   setBatchResults([...invalid,...result.results].sort((a,b)=>a.row-b.row));
   setStatus('Batch: '+result.confirmed+' saved, '+
    (invalid.length+result.results.filter(r=>r.state!=='SAVED_DRAFT').length)+
    ' invalid/rejected.'+(result.state==='PARTIAL_STOP_NO_RETRY'?
     ' Partial/uncertain outcome; no retry until independent READ.':
     ' No draft has been approved or activated.'));
  }catch(error){
   if(n===epoch.current)setStatus(
    (error instanceof Error?error.message:'DRAFT077_BATCH_UNCERTAIN')+
    ' — reconcile a fresh READ; do not resubmit the same batch.');
  }finally{if(n===epoch.current)setBusy(false);}
 }
 async function exportSaved(format:'CSV'|'XLSX'){
  if(!scopeReady||busy)return;
  const n=++epoch.current;setBusy(true);
  try{
   const data=await api({contractVersion:DRAFT_CONTRACT,intent:'READ',
    ...scope,kind,search:''});
   if(n!==epoch.current)return;
   if(data.state!=='DRAFT_ONLY'||!Array.isArray(data.records))
    throw Error('DRAFT077_EXPORT_REQUIRES_DATABASE_READ');
   const actual=data.records.map(exportRow);
   if(format==='CSV')
    download('HFT_DRAFT_'+kind+'_RETAINED.csv',
     exportP3Csv(kind,scope,actual),'text/csv;charset=utf-8');
   else download('HFT_DRAFT_'+kind+'_RETAINED.xlsx',
     exportP3Xlsx(kind,scope,actual),XLSX_MIME);
   setStatus('Exported '+actual.length+' fresh database drafts as '+format+
    '. Not approved Masters.');
  }catch(error){if(n===epoch.current)setStatus(
   error instanceof Error?error.message:'DRAFT077_EXPORT_UNAVAILABLE');}
  finally{if(n===epoch.current)setBusy(false);}
 }
 async function signOut(){
  setBusy(true);
  try{await fetch('/api/hft/draft/signout',{method:'POST',
   credentials:'same-origin',headers:{origin:window.location.origin}});
  }finally{window.location.assign('/draft/sign-in');}
 }
 return <main className="masters-shell">
  <header className="masters-head">
   <div><p className="eyebrow">Hubblefly FacilityOS · Retained nonproduction</p>
    <h1>Draft Masters Workspace</h1>
    <p className="masters-help">Store provisional business data safely.
     This is separate from protected P3 approvals and inventory.</p></div>
   <span className="status">DRAFT — NOT APPROVED</span>
  </header>
  <div className="masters-actions">
   <Link className="mis-link" href="/">FacilityOS home</Link>
   <Link className="mis-link" href="/draft/sign-in">Corporate sign-in</Link>
   <button type="button" disabled={busy} onClick={()=>void signOut()}>Sign out</button>
  </div>
  <section className="panel">
   <h2>Provisional signed scope</h2>
   <p className="masters-help">Enter the real scope granted to your login.
    These identifiers are provisional draft references, not approved corporate
    entities or certified warehouse bins. The API enforces your signed scope.</p>
   <div className="masters-scope">
    {(['legalEntityId','siteId','warehouseId'] as const).map(field=>
     <label key={field}>{field}<input required value={scope[field]}
      disabled={busy} onChange={e=>editScope(field,e.target.value)}/></label>)}
   </div>
  </section>
  <section className="panel" style={{marginTop:16}}>
   <h2>Manual CREATE / EDIT</h2>
   <div className="masters-actions">
    <label>Draft type <select value={kind} disabled={busy}
     onChange={e=>reset(e.target.value as DraftKind)}>
     {kinds.map(k=><option key={k} value={k}>{k.replaceAll('_',' ')}</option>)}
    </select></label>
    <button type="button" disabled={busy} onClick={newDraft}>New draft</button>
   </div>
   <form className="masters-form" onSubmit={e=>void save(e)}>
    <label>Record ID<input required value={recordId} disabled={busy||operation==='EDIT'}
      onChange={e=>setRecordId(e.target.value.toUpperCase())}
      placeholder="Exact record identifier"/></label>
    <label>Operation<input readOnly value={operation}/></label>
    <label>Expected revision<input readOnly value={revision}/></label>
    {fieldNames[kind].map(field=><label key={field}>
      {field} {field==='parentLocationId'?'(Optional)':'(Required)'}
      {field==='controlType'?
       <select value={values[field]||'NONE'} disabled={busy}
        onChange={e=>setValues(old=>({...old,[field]:e.target.value}))}>
        <option>NONE</option><option>BATCH</option><option>SERIAL</option>
       </select>:
       <input required={field!=='parentLocationId'} value={values[field]||''}
        disabled={busy} onChange={e=>setValues(old=>({...old,[field]:e.target.value}))}/>}
     </label>)}
    <label>Change reason (TEMP, not a Master attribute)
     <textarea required minLength={8} maxLength={300} value={reason}
      disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
    <button className="primary-button" type="submit"
     disabled={!scopeReady||busy}>{busy?'Checking…':
      operation==='EDIT'?'Save revised draft':'Create draft record'}</button>
   </form>
  </section>
  <section className="panel" style={{marginTop:16}}>
   <h2>Search and reopen saved drafts</h2>
   <div className="masters-actions">
    <label>Record search<input value={search} disabled={busy}
     onChange={e=>setSearch(e.target.value)}/></label>
    <button type="button" disabled={!scopeReady||busy}
     onClick={()=>void load()}>Fresh database READ</button>
   </div>
   <div className="masters-table-wrap"><table className="data-table">
    <thead><tr><th>ID</th><th>Status</th><th>Revision</th>
     <th>Updated by</th><th>Action</th></tr></thead>
    <tbody>{records.map(r=><tr key={r.record_id}>
     <td>{r.record_id}</td><td>DRAFT — NOT APPROVED</td>
     <td>{r.revision}</td><td>{r.updated_by}</td>
     <td><button disabled={busy} onClick={()=>edit(r)}>Reopen / EDIT</button></td>
    </tr>)}</tbody>
   </table></div>
  </section>
  <section className="panel" style={{marginTop:16}}>
   <h2>CSV and Excel import / export</h2>
   <p className="masters-help">Preview is local; SAVE uses the restricted draft
    database API. Maximum 20 import rows. Invalid and duplicate rows are
    reported separately. Fictional samples cannot pass validation.</p>
   <div className="masters-actions">
    <button disabled={busy} onClick={()=>download('HFT_DRAFT_'+kind+'_BLANK.csv',
     blankImportCsv(kind),'text/csv;charset=utf-8')}>Blank CSV template</button>
    <button disabled={busy} onClick={()=>download('HFT_DRAFT_'+kind+'_BLANK.xlsx',
     blankP3Xlsx(kind),XLSX_MIME)}>Blank XLSX template</button>
    <button disabled={busy} onClick={()=>download('HFT_DRAFT_'+kind+'_FIELDS.csv',
     csv([['field','classification','explanation'],
      ...fieldGuide(kind).map(x=>[x.field,x.marker,x.note])]),
     'text/csv;charset=utf-8')}>REQUIRED / OPTIONAL / TEMP guide</button>
    <button disabled={busy} onClick={()=>download('HFT_DRAFT_'+kind+'_FICTIONAL.csv',
     csv([importHeaders(kind),fictionalP3SampleRow(kind)]),
     'text/csv;charset=utf-8')}>Fictional sample CSV</button>
    <button disabled={busy} onClick={()=>download('HFT_DRAFT_'+kind+'_FICTIONAL.xlsx',
     sampleP3Xlsx(kind),XLSX_MIME)}>Fictional sample XLSX</button>
   </div>
   <label>Choose CSV or Excel (.xlsx) to validate
    <input type="file" accept=".csv,.xlsx" disabled={busy||!scopeReady}
      onChange={e=>void importFile(e)}/></label>
   {accepted?<div className="masters-help">
     <strong>{accepted.filename}: {accepted.totalRows} rows,
      {' '}{accepted.validRows.length} valid,
      {' '}{accepted.issues.length} errors.</strong>
     <div className="masters-table-wrap"><table className="data-table">
      <thead><tr><th>Line</th><th>ID</th><th>Preview</th></tr></thead>
      <tbody>{accepted.validRows.map(r=><tr key={r.sourceRow}>
       <td>{r.sourceRow}</td><td>{r.recordId}</td><td>DRAFT only</td></tr>)}
       {accepted.issues.map((e,i)=><tr key={'err'+i}>
        <td>{e.row}</td><td>{e.recordId}</td><td>{e.code}</td></tr>)}
      </tbody></table></div>
     <button className="primary-button" disabled={busy||!accepted.validRows.length}
      onClick={()=>void submitImport()}>Save valid draft rows once</button>
    </div>:null}
   {batchResults.length?<div className="masters-table-wrap"><table className="data-table">
    <thead><tr><th>Row</th><th>Record</th><th>Result</th></tr></thead>
    <tbody>{batchResults.map((x,i)=><tr key={i}>
     <td>{x.row}</td><td>{x.recordId}</td>
     <td>{x.state}{x.code?' — '+x.code:''}</td></tr>)}</tbody>
   </table></div>:null}
   <div className="masters-actions">
    <button disabled={!scopeReady||busy} onClick={()=>void exportSaved('CSV')}>
     Export actual saved drafts CSV</button>
    <button disabled={!scopeReady||busy} onClick={()=>void exportSaved('XLSX')}>
     Export actual saved drafts Excel</button>
   </div>
  </section>
  <p className="masters-help">All records remain DRAFT — NOT APPROVED.
   No P3 request, corporate approval, item-version certification, stock balance,
   RECEIVE or ledger entry is created here.</p>
  {signedIn===false?<p className="masters-help">
   Your session is not authorized. <Link href="/draft/sign-in">Sign in</Link>.</p>:null}
  <div role="status" aria-live="polite" className="masters-result">{status}</div>
 </main>;
}

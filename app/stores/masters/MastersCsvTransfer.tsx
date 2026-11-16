'use client';
import {useState,type ChangeEvent} from 'react';
import type {MasterKind} from '../../../lib/hft/masters/p3-contract.ts';
import {blankImportCsv,exportP3Csv,fieldGuide,importHeaders,
 MAX_CSV_IMPORT_BYTES,previewP3ImportCsv,
 type TransferScope,type TransferPreview} from '../../../lib/hft/masters/p3-csv-transfer.ts';
import {blankP3Xlsx,sampleP3Xlsx,fictionalP3SampleRow,
 exportP3Xlsx,previewP3ImportXlsx,MAX_XLSX_INPUT,XLSX_MIME}
 from '../../../lib/hft/masters/p3-xlsx-transfer.ts';

type Reply=Readonly<{state?:string;code?:string;records?:readonly Record<string,unknown>[]}>;
type Props=Readonly<{kind:MasterKind;scope:TransferScope;onBusyChange:(busy:boolean)=>void}>;
type Preview=Readonly<TransferPreview&{format:'CSV'|'XLSX';filename:string;scopeKey:string}>;
const scopeIdentity=(kind:MasterKind,scope:TransferScope)=>
 JSON.stringify([kind,scope.legalEntityId,scope.siteId,scope.warehouseId]);
async function protectedCall(payload:unknown):Promise<Reply>{
 const response=await fetch('/api/hft/masters',{method:'POST',credentials:'same-origin',
  headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify(payload)});
 const data=await response.json() as Reply;
 if(!response.ok)throw Error(data.code||'P3_TRANSFER_FAILED');
 return data;
}
function downloadFile(filename:string,contents:string|Uint8Array,mime:string):void{
 let data:Blob;
 if(typeof contents==='string')data=new Blob([contents],{type:mime});
 else {
  const buffer=new ArrayBuffer(contents.byteLength);
  new Uint8Array(buffer).set(contents);
  data=new Blob([buffer],{type:mime});
 }
 const url=URL.createObjectURL(data),anchor=document.createElement('a');
 anchor.href=url;anchor.download=filename;
 document.body.appendChild(anchor);anchor.click();anchor.remove();
 URL.revokeObjectURL(url);
}
const quote=(value:string)=>/[",\r\n]/.test(value)?
 '"'+value.replaceAll('"','""')+'"':value;
function csvRows(rows:readonly (readonly string[])[]):string{
 return '\ufeff'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
}
export default function MastersCsvTransfer({kind,scope,onBusyChange}:Props){
 const [preview,setPreview]=useState<Preview|null>(null);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState(
  'Select CSV or .xlsx to validate and preview. Nothing saves until protected submission.');
 const ready=Boolean(scope.legalEntityId&&scope.siteId&&scope.warehouseId);
 const currentKey=scopeIdentity(kind,scope);
 const validPreview=preview?.scopeKey===currentKey?preview:null;
 const maySubmit=Boolean(validPreview&&validPreview.validRows.length>0&&
  validPreview.issues.length===0&&!busy&&ready);
 function handleBusy(next:boolean){setBusy(next);onBusyChange(next);}
 async function openFile(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];
  event.target.value='';
  setPreview(null);
  if(!file)return;
  const selected=scopeIdentity(kind,scope);
  try{
   let result:TransferPreview,format:'CSV'|'XLSX';
   if(/\.xlsx$/i.test(file.name)){
    if(file.size>MAX_XLSX_INPUT)throw Error('XLSX_FILE_TOO_LARGE');
    result=await previewP3ImportXlsx(
     new Uint8Array(await file.arrayBuffer()),kind,scope);
    format='XLSX';
   }else if(/\.csv$/i.test(file.name)){
    if(file.size>MAX_CSV_IMPORT_BYTES)throw Error('CSV_FILE_TOO_LARGE');
    result=previewP3ImportCsv(await file.text(),kind,scope);
    format='CSV';
   }else throw Error('ONLY_UTF8_CSV_OR_XLSX_SUPPORTED');
   setPreview({...result,format,filename:file.name,scopeKey:selected});
   setStatus(result.issues.length?
    'Found '+result.issues.length+' row errors. Correct the file and validate again; no rows saved.':
    result.validRows.length+' '+format+' rows validated. Preview before saving as PENDING_APPROVAL.');
  }catch(error){
   setStatus(error instanceof Error?error.message:'MASTER_IMPORT_FILE_INVALID');
  }
 }
 async function submitRows(){
  if(!maySubmit||!validPreview)return;
  handleBusy(true);
  const batch=validPreview.validRows;
  let confirmed=0;
  try{
   // Fresh scoped signed reads are a defensive duplicate preflight; the
   // protected PostgreSQL writer remains final authority for race/revision.
   const [savedMasters,requests]=await Promise.all([
    protectedCall({intent:'LIST',kind,...scope,search:''}),
    protectedCall({intent:'REQUESTS',kind,...scope,search:''})
   ]);
   if(savedMasters.state!=='AVAILABLE'||requests.state!=='AVAILABLE'||
      !Array.isArray(savedMasters.records)||!Array.isArray(requests.records))
    throw Error('MASTER_DUPLICATE_PREFLIGHT_NOT_AUTHENTICATED');
   const existing=new Set(savedMasters.records.map(x=>String(x.record_id)));
   const pending=new Set(requests.records.filter(x=>x.state==='PENDING_APPROVAL')
    .map(x=>String(x.record_id)));
   for(const row of batch)
    if(existing.has(row.recordId)||pending.has(row.recordId))
     throw Error('IMPORT_RECORD_ALREADY_EXISTS_OR_PENDING:'+row.recordId);
   for(const row of batch){
    const requestId=crypto.randomUUID();
    const result=await protectedCall({intent:'SUBMIT',change:{
     contractVersion:'HFT-R1-P3-MASTER-V1',requestId,
     kind,operation:'CREATE',...scope,recordId:row.recordId,
     expectedVersion:'0',reason:row.reason,values:row.values}});
    const verified=result.records?.some(x=>
     x.request_id===requestId&&x.record_id===row.recordId&&
     x.state==='PENDING_APPROVAL');
    if(result.state!=='PENDING_APPROVAL'||!verified)
     throw Error('IMPORT_PROTECTED_COMMIT_READBACK_UNCERTAIN_NO_RETRY');
    confirmed++;
    setStatus(confirmed+'/'+batch.length+' protected PENDING_APPROVAL requests confirmed.');
   }
   setPreview(null);
   setStatus('Committed '+confirmed+' protected pending requests. No active Masters created. '+
    'Use a fresh signed Pending requests read to reopen them.');
  }catch(error){
   // Never silently replay successful or uncertain writes.
   setPreview(null);
   setStatus('Stopped with '+confirmed+' confirmed rows. '+
    (error instanceof Error?error.message:'PROTECTED_IMPORT_FAILED')+
    '. Reconcile signed REQUESTS and database revisions before new submission. No automatic retry.');
  }finally{handleBusy(false);}
 }
 async function exportView(view:'LIST'|'REQUESTS',format:'CSV'|'XLSX'){
  if(busy||!ready)return;
  handleBusy(true);
  setStatus('Requesting fresh signed '+view+' readback from protected PostgreSQL.');
  try{
   const result=await protectedCall({intent:view,kind,...scope,search:''});
   if(result.state!=='AVAILABLE'||!Array.isArray(result.records))
    throw Error('EXPORT_AUTHENTICATED_DATABASE_RESPONSE_REQUIRED');
   if(format==='CSV')
    downloadFile('HFT_'+kind+'_'+view+'_READBACK.csv',
     exportP3Csv(kind,scope,result.records),'text/csv;charset=utf-8');
   else
    downloadFile('HFT_'+kind+'_'+view+'_READBACK.xlsx',
     exportP3Xlsx(kind,scope,result.records),XLSX_MIME);
   setStatus('Exported '+result.records.length+' scoped '+view+
    ' records from a fresh protected read. PENDING_APPROVAL is not ACTIVE. '+
    'The authenticated API returns at most 50 records per request.');
  }catch(error){
   setStatus(error instanceof Error?error.message:'PROTECTED_EXPORT_FAILED');
  }finally{handleBusy(false);}
 }
 return <section className="panel" aria-label="Masters CSV and Excel transfer">
  <div className="panel-heading">
   <div><p className="eyebrow">Authenticated data portability</p>
    <h2>Import & Export — CSV / Excel</h2></div>
   <span className="status">Protected P3 pending requests</span>
  </div>
  <p className="masters-help">Import is limited to 20 CREATE rows per file.
   Every row is validated and previewed before saving. Database save requires
   an authorized user, real active entity/site/warehouse and protected P3 installation.
   Import NEVER approves or activates a Master.</p>
  <div className="masters-actions">
   <button type="button" disabled={busy}
    onClick={()=>downloadFile('HFT_'+kind+'_BLANK.csv',
     blankImportCsv(kind),'text/csv;charset=utf-8')}>Blank CSV template</button>
   <button type="button" disabled={busy}
    onClick={()=>downloadFile('HFT_'+kind+'_BLANK.xlsx',
     blankP3Xlsx(kind),XLSX_MIME)}>Blank Excel template</button>
   <button type="button" disabled={busy}
    onClick={()=>downloadFile('HFT_'+kind+'_FIELDS_REQUIRED_OPTIONAL_TEMP.csv',
     csvRows([['field','classification','validation'],
      ...fieldGuide(kind).map(f=>[f.field,f.marker,f.note])]),
     'text/csv;charset=utf-8')}>Required / Optional / Temp field guide</button>
  </div>
  <div className="masters-actions">
   <button type="button" disabled={busy}
    onClick={()=>downloadFile('HFT_'+kind+'_FICTIONAL_NOT_FOR_IMPORT.csv',
     csvRows([importHeaders(kind),fictionalP3SampleRow(kind)]),
     'text/csv;charset=utf-8')}>Fictional sample CSV</button>
   <button type="button" disabled={busy}
    onClick={()=>downloadFile('HFT_'+kind+'_FICTIONAL_NOT_FOR_IMPORT.xlsx',
     sampleP3Xlsx(kind),XLSX_MIME)}>Fictional sample Excel</button>
  </div>
  <label className="masters-field">Validate real CSV or Excel (.xlsx) for {kind}
   <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    disabled={busy||!ready} onChange={event=>{void openFile(event);}}/>
  </label>
  {validPreview?<div className="masters-help" aria-label="Validated import preview">
   <strong>{validPreview.filename}: {validPreview.totalRows} input rows,
    {' '}{validPreview.validRows.length} valid, {validPreview.issues.length} errors.</strong>
   {validPreview.validRows.length>0?<div className="masters-table-wrap">
    <table className="data-table"><thead><tr><th>Row</th><th>Record ID</th>
     <th>Intended operation</th><th>After submission</th></tr></thead>
     <tbody>{validPreview.validRows.map(row=><tr key={'row-'+row.sourceRow}>
      <td>{row.sourceRow}</td><td>{row.recordId}</td><td>CREATE request</td>
      <td>PENDING_APPROVAL only</td>
     </tr>)}</tbody></table>
   </div>:null}
   {validPreview.issues.length>0?<div className="masters-table-wrap">
    <table className="data-table" aria-label="Import row errors"><thead><tr>
     <th>Row</th><th>Record ID</th><th>Validation error</th></tr></thead>
     <tbody>{validPreview.issues.map((issue,i)=><tr key={issue.row+'-'+i}>
      <td>{issue.row}</td><td>{issue.recordId||'—'}</td><td>{issue.code}</td>
     </tr>)}</tbody></table>
   </div>:null}
   <button type="button" className="primary-button" disabled={!maySubmit}
    onClick={()=>{void submitRows();}}>Save valid batch as pending requests</button>
   {validPreview.issues.length>0?
    <p>No rows can be submitted until ALL errors are corrected and revalidated.</p>:null}
  </div>:null}
  <div className="masters-actions">
   <button type="button" disabled={busy||!ready}
    onClick={()=>{void exportView('LIST','CSV');}}>Export saved Masters CSV</button>
   <button type="button" disabled={busy||!ready}
    onClick={()=>{void exportView('LIST','XLSX');}}>Export saved Masters Excel</button>
   <button type="button" disabled={busy||!ready}
    onClick={()=>{void exportView('REQUESTS','CSV');}}>Export requests CSV</button>
   <button type="button" disabled={busy||!ready}
    onClick={()=>{void exportView('REQUESTS','XLSX');}}>Export requests Excel</button>
  </div>
  <p className="masters-help">Every export uses a fresh authenticated database
   LIST or REQUESTS response; an Excel file is not generated from staged input.
   __state, __version and __requestId are read-only export metadata.
   Remove them before importing. Fictional sample IDs begin EXAMPLE_ and are rejected.</p>
  <p role="status" aria-live="polite" className="masters-help">{status}</p>
 </section>;
}

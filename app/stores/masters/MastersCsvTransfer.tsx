'use client';
import {useState,type ChangeEvent} from 'react';
import type {MasterKind} from '../../../lib/hft/masters/p3-contract.ts';
import {blankImportCsv,exportP3Csv,headerRequirements,importHeaders,
 MAX_CSV_IMPORT_BYTES,parseP3ImportCsv,type TransferScope,type TransferChange}
 from '../../../lib/hft/masters/p3-csv-transfer.ts';

type Reply=Readonly<{state?:string;code?:string;records?:readonly Record<string,unknown>[]}>;
type Props=Readonly<{kind:MasterKind;scope:TransferScope;onBusyChange:(busy:boolean)=>void}>;
async function protectedCall(payload:unknown):Promise<Reply>{
 const response=await fetch('/api/hft/masters',{method:'POST',credentials:'same-origin',
  headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify(payload)});
 const data=await response.json() as Reply;
 if(!response.ok)throw Error(data.code||'P3_TRANSFER_FAILED');
 return data;
}
function downloadCsv(filename:string,data:string):void{
 const file=new Blob([data],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(file),anchor=document.createElement('a');
 anchor.href=url;anchor.download=filename;
 document.body.appendChild(anchor);anchor.click();anchor.remove();
 URL.revokeObjectURL(url);
}
export default function MastersCsvTransfer({kind,scope,onBusyChange}:Props){
 const [staged,setStaged]=useState<readonly TransferChange[]>([]);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState('Import validates before any protected request. Export uses fresh signed database readback.');
 const ready=Boolean(scope.legalEntityId&&scope.siteId&&scope.warehouseId);
 async function openFile(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];setStaged([]);
  if(!file)return;
  if(file.size>MAX_CSV_IMPORT_BYTES){setStatus('CSV_FILE_TOO_LARGE');return;}
  try{
   const parsed=parseP3ImportCsv(await file.text(),kind,scope);
   setStaged(parsed);
   setStatus(parsed.length+' real rows validated. Nothing saved yet. Review identifiers before submitting.');
  }catch(error){setStatus(error instanceof Error?error.message:'CSV_IMPORT_INVALID');}
  finally{event.target.value='';}
 }
 async function submitRows(){
  if(busy||!ready||!staged.length)return;
  setBusy(true);onBusyChange(true);let done=0;
  try{
   for(const row of staged){
    const requestId=crypto.randomUUID();
    const result=await protectedCall({intent:'SUBMIT',change:{
     contractVersion:'HFT-R1-P3-MASTER-V1',requestId,
     kind,operation:'CREATE',...scope,recordId:row.recordId,
     expectedVersion:'0',reason:row.reason,values:row.values}});
    const verified=result.records?.some(x=>x.request_id===requestId&&x.state==='PENDING_APPROVAL');
    if(result.state!=='PENDING_APPROVAL'||!verified)
     throw Error('CSV_IMPORT_READBACK_UNCERTAIN_NO_RETRY');
    done++;setStatus(done+'/'+staged.length+' independently confirmed pending requests.');
   }
   setStaged([]);
   setStatus('Saved '+done+' protected PENDING_APPROVAL requests. No active Masters were created. Use Pending requests for a fresh LIST.');
  }catch(error){
   setStaged([]);
   setStatus('Stopped after '+done+' confirmed rows. '+(error instanceof Error?error.message:'CSV_IMPORT_FAILED')+
    '. Reconcile protected REQUESTS before any new upload; never blindly retry.');
  }finally{setBusy(false);onBusyChange(false);}
 }
 async function exportView(view:'LIST'|'REQUESTS'){
  if(busy||!ready)return;
  setBusy(true);onBusyChange(true);
  setStatus('Requesting fresh authenticated '+view+' data from PostgreSQL.');
  try{
   const result=await protectedCall({intent:view,kind,...scope,search:''});
   if(result.state!=='AVAILABLE'||!Array.isArray(result.records))
    throw Error('CSV_EXPORT_SIGNED_DATABASE_RESPONSE_REQUIRED');
   const csv=exportP3Csv(kind,scope,result.records);
   downloadCsv('HFT_'+kind+'_'+view+'_READBACK.csv',csv);
   setStatus('Exported '+result.records.length+' scoped database records. __state/__version/__requestId are export metadata; remove before reimport. API returns at most 50 records.');
  }catch(error){setStatus(error instanceof Error?error.message:'CSV_EXPORT_FAILED');}
  finally{setBusy(false);onBusyChange(false);}
 }
 return <section className="panel" aria-label="Masters CSV import and export">
  <div className="panel-heading"><div><p className="eyebrow">Data portability</p>
   <h2>CSV Import / Export</h2></div>
   <span className="status">P3 pending requests only</span></div>
  <p className="masters-help">Import accepts up to 20 CREATE rows using exact headers, one protected request at a time.
   It never activates a master or bypasses approvals. An existing authorized entity, site and active warehouse are required.</p>
  <div className="masters-actions">
   <button type="button" disabled={busy} onClick={()=>downloadCsv('HFT_'+kind+'_BLANK.csv',blankImportCsv(kind))}>
    Download blank CSV</button>
   <button type="button" disabled={busy} onClick={()=>{
    const headers=importHeaders(kind),markers=headerRequirements(kind);
    downloadCsv('HFT_'+kind+'_MARKED_REFERENCE_NOT_FOR_UPLOAD.csv',
     '\ufeff'+headers.join(',')+'\r\n'+markers.join(',')+'\r\n');
   }}>Download marked field guide</button>
  </div>
  <label className="masters-field">Choose CSV to validate (Excel users: Save As UTF-8 CSV)
   <input type="file" accept=".csv,text/csv" disabled={busy||!ready}
    onChange={event=>{void openFile(event);}}/>
  </label>
  {staged.length>0?<div className="masters-help"><strong>{staged.length} rows ready — no database writes yet</strong>
   <p>Preview IDs: {staged.slice(0,5).map(row=>row.recordId).join(', ')}{staged.length>5?' …':''}</p>
   <button type="button" className="primary-button" disabled={busy||!ready}
    onClick={()=>{void submitRows();}}>Submit as pending requests</button>
  </div>:null}
  <div className="masters-actions">
   <button type="button" disabled={busy||!ready} onClick={()=>{void exportView('LIST');}}>
    Export master LIST</button>
   <button type="button" disabled={busy||!ready} onClick={()=>{void exportView('REQUESTS');}}>
    Export pending requests</button>
  </div>
  <p className="masters-help">Exports require fresh authenticated database responses and include status/revision metadata.
   An export is NOT approval or a stock export. Never upload marked reference rows.</p>
  <p className="masters-help" role="status" aria-live="polite">{status}</p>
 </section>;
}

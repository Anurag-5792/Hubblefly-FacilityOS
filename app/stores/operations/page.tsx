'use client';
import Link from 'next/link';
import {useState,type FormEvent} from 'react';
import styles from './operations.module.css';

type Kind='IN'|'OUT'|'COUNT'|'TRANSFER';
type FormData={
 legalEntityId:string;siteId:string;warehouseId:string;itemCode:string;
 productVersion:string;controlType:'NONE'|'BATCH'|'SERIAL';quantity:string;
 uom:string;serialNo:string;batchNo:string;leafLocationId:string;
 grnId:string;receiptKey:string;supplierId:string;invoiceNumber:string;
 qcState:'PENDING'|'ACCEPTED'|'REJECTED';qcEvidenceId:string;
 employeeId:string;workOrderId:string;issueDocumentId:string;fragmentId:string;
 purpose:string;sessionId:string;stockEpoch:string;lineId:string;
 condition:'GOOD'|'DAMAGED'|'QUARANTINE';
 inventoryState:'LOOSE'|'INSTALLED_WIP'|'QUARANTINE'|'OTHER';evidenceId:string;
 sourceLeafId:string;destinationLeafId:string;transferDocumentId:string;reason:string;
};
const initial:FormData={legalEntityId:'',siteId:'',warehouseId:'',itemCode:'',
 productVersion:'',controlType:'NONE',quantity:'',uom:'',serialNo:'',batchNo:'',
 leafLocationId:'',grnId:'',receiptKey:'',supplierId:'',invoiceNumber:'',
 qcState:'PENDING',qcEvidenceId:'',employeeId:'',workOrderId:'',issueDocumentId:'',
 fragmentId:'',purpose:'',sessionId:'',stockEpoch:'',lineId:'',condition:'GOOD',
 inventoryState:'LOOSE',evidenceId:'',sourceLeafId:'',destinationLeafId:'',transferDocumentId:'',reason:''};
const captions:Record<Kind,{title:string;summary:string}>={
 IN:{title:'Receive material (IN)',summary:'Invoice/GRN, QC and destination bin evidence'},
 OUT:{title:'Issue material (OUT)',summary:'Employee, source bin and custody evidence'},
 COUNT:{title:'Physical count',summary:'Exact count session and item/bin observation'},
 TRANSFER:{title:'Location transfer',summary:'Source and destination bins; no silent history edits'},
};
const fields:Record<Kind,readonly (keyof FormData)[]>={
 IN:['leafLocationId','supplierId','invoiceNumber','grnId','receiptKey','qcState','qcEvidenceId'],
 OUT:['leafLocationId','employeeId','workOrderId','issueDocumentId','fragmentId','purpose'],
 COUNT:['leafLocationId','sessionId','stockEpoch','lineId','condition','inventoryState','evidenceId'],
 TRANSFER:['sourceLeafId','destinationLeafId','transferDocumentId','reason'],
};
const names:Partial<Record<keyof FormData,string>>={
 legalEntityId:'Legal entity',siteId:'Site',warehouseId:'Warehouse',itemCode:'Item code',
 productVersion:'Product version',controlType:'Tracking',quantity:'Quantity',uom:'Unit',
 serialNo:'Serial number',batchNo:'Batch/lot',leafLocationId:'Leaf bin/location ID',
 grnId:'GRN ID',receiptKey:'Receipt identity',supplierId:'Supplier ID',
 invoiceNumber:'Supplier invoice',qcState:'QC state',qcEvidenceId:'QC evidence reference',
 employeeId:'Receiving employee ID',workOrderId:'Work order (optional)',
 issueDocumentId:'Material issue document',fragmentId:'Issue fragment ID',
 purpose:'Material issue purpose',sessionId:'Count session',stockEpoch:'Count epoch',
 lineId:'Count line ID',condition:'Observed condition',inventoryState:'Stock category',
 evidenceId:'Count evidence reference',sourceLeafId:'Source leaf bin',
 destinationLeafId:'Destination leaf bin',transferDocumentId:'Movement document',reason:'Movement reason'};
type Reply={state?:string;code?:string;requestId?:string;stockChanged?:boolean;durable?:boolean;
 locationVerified?:boolean;businessAuthorityVerified?:boolean;quantity?:string};
export default function StoresOperationsPage(){
 const [kind,setKind]=useState<Kind>('IN');
 const [form,setForm]=useState<FormData>(initial);
 const [busy,setBusy]=useState(false);
 const [intent,setIntent]=useState<'PREPARE'|'POST'>('PREPARE');
 const [last,setLast]=useState<Reply|null>(null);
 const [feedback,setFeedback]=useState('No validated request. No stock or count data have been saved.');
 function update<K extends keyof FormData>(key:K,value:FormData[K]){
  setForm(current=>({...current,[key]:value}));setLast(null);
 }
 function switchKind(next:Kind){setKind(next);setLast(null);
  setFeedback('Mode changed. No pending data have been saved or posted.');}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setLast(null);
  setFeedback(intent==='POST'?'Requesting protected database posting; no success until durable proof is returned.':
   'Verifying signed session and structural request. No stock posting occurs.');
  const common={contractVersion:'HFT-R1-STORES-P0-PREPARE-V1',requestId:crypto.randomUUID(),
   kind,legalEntityId:form.legalEntityId.trim(),siteId:form.siteId.trim(),
   warehouseId:form.warehouseId.trim(),itemCode:form.itemCode.trim(),
   productVersion:form.productVersion.trim(),controlType:form.controlType,
   quantity:form.quantity.trim(),uom:form.uom.trim(),serialNo:form.serialNo.trim(),
   batchNo:form.batchNo.trim()};
  const additional=Object.fromEntries(fields[kind].map(key=>[key,form[key].trim()]));
  try{
   const res=await fetch(intent==='POST'?'/api/hft/stores/submit':'/api/hft/stores/prepare',{
    method:'POST',credentials:'same-origin',
    cache:'no-store',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...common,...additional})});
   const output=await res.json() as Reply;
   if(!res.ok)throw new Error(output.code||'SOURCE_UNAVAILABLE');
   if(intent==='POST'){
    const postKind=kind==='IN'||kind==='OUT';
    const actual=postKind&&output.state==='POSTED_VERIFIED'&&
     output.durable===true&&output.stockChanged===true&&
     output.requestId===common.requestId;
    const observed=kind==='COUNT'&&output.state==='COUNT_OBSERVATION_COMMITTED'&&
     output.durable===true&&output.stockChanged===false&&
     output.requestId===common.requestId;
    if(!actual&&!observed)throw new Error('PROTECTED_DATABASE_PROOF_REQUIRED');
    setLast(output);
    setFeedback(actual?'Protected stock posting reported committed. Independently verify balance and custody readback.':
     'Physical count observation committed. No stock adjustment was made.');
   }else{
    if(output.state!=='VALIDATED_NOT_POSTED'||output.stockChanged!==false||
       output.durable!==false||output.locationVerified!==false||
       output.businessAuthorityVerified!==false)
      throw new Error('UNQUALIFIED_RESPONSE_REJECTED');
    setLast(output);
    setFeedback('Structure checked only. NOT SAVED. NOT POSTED.');
   }
  }catch(err){setFeedback(err instanceof Error?err.message:'VALIDATION_UNAVAILABLE');}
  finally{setBusy(false);}
 }
 const field=(key:keyof FormData)=>{
  if(key==='qcState')return <label key={key}>{names[key]}<select value={form.qcState} onChange={e=>update('qcState',e.target.value as FormData['qcState'])}>
   <option>PENDING</option><option>ACCEPTED</option><option>REJECTED</option></select></label>;
  if(key==='condition')return <label key={key}>{names[key]}<select value={form.condition} onChange={e=>update('condition',e.target.value as FormData['condition'])}>
   <option>GOOD</option><option>DAMAGED</option><option>QUARANTINE</option></select></label>;
  if(key==='inventoryState')return <label key={key}>{names[key]}<select value={form.inventoryState} onChange={e=>update('inventoryState',e.target.value as FormData['inventoryState'])}>
   <option>LOOSE</option><option>INSTALLED_WIP</option><option>QUARANTINE</option><option>OTHER</option></select></label>;
  const optional=key==='workOrderId'||key==='qcEvidenceId';
  return <label key={key}>{names[key]??key}<input value={form[key]} required={!optional}
   onChange={e=>update(key,e.target.value as FormData[typeof key])}
   placeholder={key==='leafLocationId'?'Actual bin/container ID, not rack only':undefined}/></label>;
 };
 return <main className="masters-shell">
  <header className="masters-head"><div>
   <Link href="/stores" className="mis-link">Stores / Operations</Link>
   <p className="eyebrow">Hubblefly FacilityOS · P0 source candidate</p>
   <h1>Stores receiving, issuing and counting</h1>
   <p>Actual warehouse, rack, level, position, stack slot and bin are verified only by the qualified location registry.</p>
  </div><Link className="masters-back" href="/stores/masters">Masters</Link></header>
  <section className={styles.warning} role="status">
   <strong>Protected database posting requires independently qualified SQL and genuine human approvals.</strong>
   <p>Validation never changes stock. Protected submission uses signed server identity and fails closed until qualified PostgreSQL authority is installed; it cannot create its own approval or Hold clearance. Do not treat a rejected request as a receipt or issue record.</p>
  </section>
  <nav className={styles.tabs} aria-label="Stores operation">
   {(['IN','OUT','COUNT','TRANSFER'] as const).map(x=><button type="button" key={x}
    aria-pressed={kind===x} onClick={()=>switchKind(x)} className={kind===x?styles.selected:undefined}>
     {captions[x].title}</button>)}
  </nav>
  <form onSubmit={e=>void submit(e)} className={styles.form}>
   <section className="panel"><h2>Authority scope</h2><div className={styles.fields}>
    {(['legalEntityId','siteId','warehouseId'] as const).map(field)}
   </div><p className={styles.caption}>Selecting a scope does not grant access; HFT signed identity must match it.</p></section>
   <section className="panel"><h2>Item identity</h2><div className={styles.fields}>
    {(['itemCode','productVersion','uom','quantity'] as const).map(field)}
    <label>Traceability<select value={form.controlType} onChange={e=>update('controlType',e.target.value as FormData['controlType'])}>
      <option value="NONE">Unserialized</option><option value="BATCH">Batch</option><option value="SERIAL">Serial</option></select></label>
    {form.controlType==='SERIAL'?field('serialNo'):null}
    {form.controlType==='BATCH'?field('batchNo'):null}
   </div><p className={styles.caption}>Use the actual product version, not its database revision. Item-version photographs remain a separate verified requirement.</p></section>
   <section className="panel"><h2>{captions[kind].title}</h2><p>{captions[kind].summary}</p>
    <div className={styles.fields}>{fields[kind].map(field)}</div>
    <p className={styles.caption}>A leaf-bin ID is not proof of its rack-to-bin hierarchy. Counts cannot alter stock; transfers require protected authorization. Work-order-only issues require additional backend qualification.</p>
   </section>
   <label>Submission intent
    <select value={intent} onChange={e=>{setIntent(e.target.value as 'PREPARE'|'POST');setLast(null);}}>
     <option value="PREPARE">Validate only — no persistence</option>
     <option value="POST">Request protected database transaction</option>
    </select>
   </label>
   <button className="primary-button" type="submit" disabled={busy||intent==='POST'&&kind==='TRANSFER'}>
    {busy?'Checking…':intent==='POST'?'Request protected transaction':'Validate only — do not post'}
   </button>
   {intent==='POST'&&kind==='TRANSFER'?<p role="alert">Transfer remains blocked until the single P2 protected writer supports authorized atomic relocation.</p>:null}
  </form>
  <section aria-live="polite" className={styles.result}>
   <h2>Result</h2><p>{feedback}</p>
   {last?<p>Request type: {last.state} · Quantity: {last.quantity??form.quantity} ·
     Stored: {last.durable===true?'YES':'NO'} ·
     Stock moved: {last.stockChanged===true?'YES':'NO'}</p>:null}
  </section>
 </main>;
}

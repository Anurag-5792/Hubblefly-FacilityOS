'use client';
import Link from 'next/link';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {parseOperatorContext,operatorPending,operatorOtherPending,writeOperatorPending,clearOperatorPending,type OperatorContext,type PendingOperatorRequest} from '../../../lib/hft/roles/hosted-operator-client.ts';
import styles from './operations.module.css';

type Kind='IN'|'OUT'|'COUNT'|'TRANSFER'|'RETURN';
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
 returnDocumentId:string;returnLineKey:string;originalIssueId:string;
 inspectionEvidenceId:string;inspectedCondition:'GOOD'|'DAMAGED'|'QUARANTINE';
};
const initial:FormData={legalEntityId:'',siteId:'',warehouseId:'',itemCode:'',
 productVersion:'',controlType:'NONE',quantity:'',uom:'',serialNo:'',batchNo:'',
 leafLocationId:'',grnId:'',receiptKey:'',supplierId:'',invoiceNumber:'',
 qcState:'PENDING',qcEvidenceId:'',employeeId:'',workOrderId:'',issueDocumentId:'',
 fragmentId:'',purpose:'',sessionId:'',stockEpoch:'',lineId:'',condition:'GOOD',
 inventoryState:'LOOSE',evidenceId:'',sourceLeafId:'',destinationLeafId:'',transferDocumentId:'',reason:'',returnDocumentId:'',returnLineKey:'',
 originalIssueId:'',inspectionEvidenceId:'',inspectedCondition:'GOOD'};
const captions:Record<Kind,{title:string;summary:string}>={
 IN:{title:'Receive material (IN)',summary:'Invoice/GRN, QC and destination bin evidence'},
 OUT:{title:'Issue material (OUT)',summary:'Employee, source bin and custody evidence'},
 COUNT:{title:'Physical count',summary:'Exact count session and item/bin observation'},
 TRANSFER:{title:'Location transfer',summary:'Source and destination bins; no silent history edits'},
 RETURN:{title:'Employee material return',summary:'Original issue, custody and independent inspection references; preparation only'},
};
const fields:Record<Kind,readonly (keyof FormData)[]>={
 IN:['leafLocationId','supplierId','invoiceNumber','grnId','receiptKey','qcState','qcEvidenceId'],
 OUT:['leafLocationId','employeeId','workOrderId','issueDocumentId','fragmentId','purpose'],
 COUNT:['leafLocationId','sessionId','stockEpoch','lineId','condition','inventoryState','evidenceId'],
 TRANSFER:['sourceLeafId','destinationLeafId','transferDocumentId','reason'],
 RETURN:['leafLocationId','employeeId','returnDocumentId','returnLineKey',
  'originalIssueId','inspectionEvidenceId','inspectedCondition'],
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
 destinationLeafId:'Destination leaf bin',transferDocumentId:'Movement document',reason:'Movement reason',
 returnDocumentId:'Return document',returnLineKey:'Return line key',
 originalIssueId:'Original issue command',inspectionEvidenceId:'Independent inspection evidence',
 inspectedCondition:'Inspected condition'};
type StockReadRow={legalEntityId:string;siteId:string;warehouseId:string;
 itemCode:string;productVersion:string;leafLocationId:string;quantity:string;
 stockState:string;employeeId:string;humanAcknowledgement:string;
 movementId:string;serialNo:string;batchNo:string};
type StockReadReply={state?:string;code?:string;intent?:string;rows?:StockReadRow[];
 durable?:boolean;synthetic?:boolean;sourceEpoch?:string;nextCursor?:string};
type Reply={state?:string;code?:string;requestId?:string;stockChanged?:boolean;durable?:boolean;
 locationVerified?:boolean;businessAuthorityVerified?:boolean;quantity?:string;
 binBalance?:string;movementCount?:number;sourceEpoch?:string;
 automaticRetryAllowed?:boolean};
export default function StoresOperationsPage(){
 const [kind,setKind]=useState<Kind>('IN');
 const [context,setContext]=useState<OperatorContext|null>(null),[pending,setPending]=useState<PendingOperatorRequest|null>(null),[trackingBlocked,setTrackingBlocked]=useState(false);
 const accessEpoch=useRef(0),activeContext=useRef(''),posting=useRef(false);
 const [form,setForm]=useState<FormData>(initial);
 const [busy,setBusy]=useState(false);
 const [intent]=useState<'PREPARE'|'POST'>('POST');
 const [last,setLast]=useState<Reply|null>(null);
 const [readIntent,setReadIntent]=useState<'BALANCES'|'MOVEMENTS'|'CUSTODY'>('BALANCES');
 const [readBusy,setReadBusy]=useState(false);
 const [readResult,setReadResult]=useState<StockReadReply|null>(null);
 const [readError,setReadError]=useState('No authoritative database read performed.');
 const [feedback,setFeedback]=useState('No validated request. No stock or count data have been saved.');
 const selected=context?.capabilities.find(c=>c.scope.legalEntityId===form.legalEntityId&&c.scope.siteId===form.siteId&&c.scope.warehouseId===form.warehouseId);
 function clearAccess(){accessEpoch.current++;activeContext.current='';setContext(null);setPending(null);setTrackingBlocked(false);setForm({...initial});setLast(null);setReadResult(null);setReadError('No authenticated read available.');setBusy(false);setReadBusy(false);}
 useEffect(()=>{
  const ctl=new AbortController(),epoch=++accessEpoch.current;
  void fetch('/api/hft/settings/roles',{method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'OPERATOR_CONTEXT'}),signal:ctl.signal})
   .then(async r=>{if(!r.ok)throw Error('OPERATOR_ACCESS_REQUIRED');return parseOperatorContext(await r.json());})
   .then(c=>{if(ctl.signal.aborted||epoch!==accessEpoch.current)return;
    const first=c.capabilities.find(x=>x.stockRead||x.receive);if(!first)throw Error('OPERATOR_STORES_DENIED');
    activeContext.current=c.contextId;setContext(c);setForm({...initial,...first.scope});
    try{setPending(operatorPending(sessionStorage,'receive',c.contextId));setTrackingBlocked(operatorOtherPending(sessionStorage,'receive',c.contextId));}catch{setTrackingBlocked(true);}
    setFeedback('Signed canonical Stores access verified. Use only admitted invoice, GRN, QC and location references.');
   }).catch(()=>{if(!ctl.signal.aborted&&epoch===accessEpoch.current)setFeedback('Sign in with an admitted Stores account. No ledger data loaded.');});
  return()=>{ctl.abort();accessEpoch.current++;};
 },[]);
 useEffect(()=>{if(!context)return;const timer=setTimeout(()=>{clearAccess();setFeedback('Session expired. Original request evidence retained.');},Math.max(0,context.expiresAt*1000-Date.now()));return()=>clearTimeout(timer);},[context]);
 async function signOut(){clearAccess();try{const r=await fetch('/api/hft/live-masters/signout',{method:'POST',credentials:'same-origin',cache:'no-store'});if(!r.ok||(await r.json()).state!=='SIGNED_OUT')throw Error('SIGNOUT_UNCONFIRMED');setFeedback('Signed out. Original request evidence retained.');}catch{setFeedback('Sign-out could not be confirmed. Close this tab or sign in again.');}}
 function update<K extends keyof FormData>(key:K,value:FormData[K]){
  setForm(current=>({...current,[key]:value}));setLast(null);
 }
 function switchKind(next:Kind){setKind(next);setLast(null);
  setFeedback('Mode changed. No pending data have been saved or posted.');}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!context||!selected?.receive||kind!=='IN'||intent!=='POST'||pending||trackingBlocked||posting.current||context.expiresAt<=Date.now()/1000)return;
  const epoch=accessEpoch.current,ctx=context.contextId;posting.current=true;setBusy(true);setLast(null);
  setFeedback(intent==='POST'?'Requesting protected database posting; no success until durable proof is returned.':
   'Verifying signed session and structural request. No stock posting occurs.');
  const common={contractVersion:kind==='RETURN'?'HFT-R1-OPS-A2-RETURN-PREPARE-V1':'HFT-R1-STORES-P0-PREPARE-V1',requestId:crypto.randomUUID(),
   kind,legalEntityId:form.legalEntityId.trim(),siteId:form.siteId.trim(),
   warehouseId:form.warehouseId.trim(),itemCode:form.itemCode.trim(),
   productVersion:form.productVersion.trim(),controlType:form.controlType,
   quantity:form.quantity.trim(),uom:form.uom.trim(),serialNo:form.serialNo.trim(),
   batchNo:form.batchNo.trim()};
  const additional=Object.fromEntries(fields[kind].map(key=>[key,form[key].trim()]));
  const original={requestId:common.requestId,scope:{legalEntityId:common.legalEntityId,siteId:common.siteId,warehouseId:common.warehouseId}};
  try{writeOperatorPending(sessionStorage,'receive',ctx,original);setPending(original);}
  catch{setTrackingBlocked(true);setFeedback('Request tracking unavailable or an original receipt remains held. No receipt submitted.');posting.current=false;setBusy(false);return;}
  try{
   const res=await fetch('/api/hft/stores/receive',{
    method:'POST',credentials:'same-origin',
    cache:'no-store',headers:{'Content-Type':'application/json','X-HFT-Operator-Context':ctx},
    body:JSON.stringify({...common,...additional})});
   if(epoch!==accessEpoch.current||ctx!==activeContext.current)return;
   if(res.status===401||res.status===403){clearAccess();setFeedback('Access ended. Original receipt reference retained; do not retry.');return;}
   const output=await res.json() as Reply;
   if(epoch!==accessEpoch.current||ctx!==activeContext.current)return;
   if(!res.ok){
    if(res.status===422&&['OPS_A2_OPERATOR_RECEIVE_BODY_INVALID','OPS_A2_RECEIVE_SCOPE_OR_ORIGINAL_QC_REQUIRED'].includes(output.code||'')){
     clearOperatorPending(sessionStorage,'receive',ctx,original);setPending(null);setFeedback('Receipt validation rejected before posting. Correct the fields.');return;
    }
    throw Error(output.code||'SOURCE_UNAVAILABLE');
   }
   if(intent==='POST'){
    const postKind=kind==='IN'||kind==='OUT';
    const actual=postKind&&output.state==='POSTED_VERIFIED'&&
     output.durable===true&&output.stockChanged===true&&
     output.requestId===common.requestId;
    const observed=kind==='COUNT'&&output.state==='COUNT_OBSERVATION_COMMITTED'&&
     output.durable===true&&output.stockChanged===false&&
     output.requestId===common.requestId;
    if(!actual&&!observed)throw new Error('PROTECTED_DATABASE_PROOF_REQUIRED');
    clearOperatorPending(sessionStorage,'receive',ctx,original);setPending(null);setLast(output);
    setFeedback(actual?
     ('RECEIVE committed and independently reread: BIN '+form.leafLocationId+
      ', quantity '+String(output.binBalance??'unavailable')+
      ', verified movements '+String(output.movementCount??'unavailable')+
      '. Reopen the authoritative readback for independent confirmation.'):
     'Physical count observation committed. No stock adjustment was made.');
   }else{
    if(output.state!=='VALIDATED_NOT_POSTED'||output.stockChanged!==false||
       output.durable!==false||output.locationVerified!==false||
       output.businessAuthorityVerified!==false)
      throw new Error('UNQUALIFIED_RESPONSE_REJECTED');
    setLast(output);
    setFeedback('Structure checked only. NOT SAVED. NOT POSTED.');
   }
  }catch{if(epoch===accessEpoch.current&&ctx===activeContext.current)setFeedback('Receipt outcome unconfirmed. Keep the original request reference for authorized reconciliation; do not retry.');}
  finally{posting.current=false;if(epoch===accessEpoch.current)setBusy(false);}
 }
 async function loadAuthoritativeRead(){
  if(!context||!selected?.stockRead||readBusy||context.expiresAt<=Date.now()/1000)return;
  const epoch=accessEpoch.current,ctx=context.contextId;
  setReadBusy(true);setReadResult(null);setReadError('Requesting scoped PostgreSQL readback.');
  try{
   const request={contractVersion:'HFT-R1-P0-READ-V1',intent:readIntent,
    legalEntityId:form.legalEntityId.trim(),siteId:form.siteId.trim(),
    warehouseId:form.warehouseId.trim(),itemCode:form.itemCode.trim(),
    productVersion:form.productVersion.trim(),
    leafLocationId:form.leafLocationId.trim(),
    employeeId:readIntent==='CUSTODY'?form.employeeId.trim():'',
    cursor:'',limit:25};
   const res=await fetch('/api/hft/stores/read',{method:'POST',
    credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json','X-HFT-Operator-Context':ctx},body:JSON.stringify(request)});
   if(epoch!==accessEpoch.current||ctx!==activeContext.current)return;
   if(res.status===401||res.status===403){clearAccess();setFeedback('Access ended. Sign in again.');return;}
   const answer=await res.json() as StockReadReply;
   if(epoch!==accessEpoch.current||ctx!==activeContext.current)return;
   if(!res.ok)throw new Error(answer.code||'READBACK_UNAVAILABLE');
   if(answer.state!=='AUTHORITATIVE_READ'||answer.durable!==true||
     answer.synthetic!==false||answer.intent!==readIntent||!Array.isArray(answer.rows)||
     answer.rows.length>25)
    throw new Error('AUTHORITATIVE_READBACK_NOT_VERIFIED');
   setReadResult(answer);setReadError('');
  }catch(error){if(epoch===accessEpoch.current)setReadError(error instanceof Error?error.message:'READBACK_UNAVAILABLE');}
  finally{if(epoch===accessEpoch.current)setReadBusy(false);}
 }
 const field=(key:keyof FormData)=>{
  if(key==='qcState')return <label key={key}>{names[key]}<select value={form.qcState} onChange={e=>update('qcState',e.target.value as FormData['qcState'])}>
   <option>PENDING</option><option>ACCEPTED</option><option>REJECTED</option></select></label>;
  if(key==='inspectedCondition')return <label key={key}>{names[key]}<select value={form.inspectedCondition} onChange={e=>update('inspectedCondition',e.target.value as FormData['inspectedCondition'])}>
   <option>GOOD</option><option>DAMAGED</option><option>QUARANTINE</option></select></label>;
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
   <p className="eyebrow">Hubblefly FacilityOS · Stores control</p>
   <h1>Stores receiving and stock lookup</h1>
   <p>Actual warehouse, rack, level, position, stack slot and bin are verified only by the qualified location registry.</p>
  </div><div><Link className="masters-back" href="/settings/users-roles">Users &amp; Roles</Link>{context?<button type="button" onClick={()=>void signOut()}>Sign out</button>:<a className="primary-button" href="/api/hft/live-masters/auth/start?return=stores">Corporate Google sign-in</a>}</div></header>
  <section className={styles.warning} role="status">
   <strong>Protected database posting requires independently qualified SQL and genuine human approvals.</strong>
   <p>Validation never changes stock. Protected submission uses signed server identity and fails closed until qualified PostgreSQL authority is installed; it cannot create its own approval or Hold clearance. Do not treat a rejected request as a receipt or issue record.</p>
  </section>
  <nav className={styles.tabs} aria-label="Stores operation">
   {(['IN','OUT','COUNT','TRANSFER','RETURN'] as const).map(x=><button type="button" key={x} disabled={x!=='IN'||busy||!!pending}
    aria-pressed={kind===x} onClick={()=>switchKind(x)} className={kind===x?styles.selected:undefined}>
     {captions[x].title}</button>)}
  </nav>
  <form onSubmit={e=>void submit(e)} className={styles.form}>
   <section className="panel"><h2>Authority scope</h2><div className={styles.fields}>
    <label>Assigned warehouse<select disabled={!context||busy||readBusy||!!pending} value={form.warehouseId} onChange={e=>{const next=context?.capabilities.find(x=>x.scope.warehouseId===e.target.value&&(x.receive||x.stockRead));if(next){setForm({...initial,...next.scope});setLast(null);setReadResult(null);}}}>
     {!context&&<option value="">Sign in to see assigned scope</option>}{context?.capabilities.filter(x=>x.stockRead||x.receive).map(x=><option key={x.scope.warehouseId} value={x.scope.warehouseId}>{x.scope.warehouseId}</option>)}</select></label>
    <label>Company<input readOnly value={form.legalEntityId}/></label><label>Site<input readOnly value={form.siteId}/></label>
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
   <p className={styles.caption}>Only qualified RECEIVE is available in this hosted mode. Other transaction types remain held.</p>
   <button className="primary-button" type="submit" disabled={busy||!selected?.receive||!!pending||trackingBlocked||kind!=='IN'}>
    {busy?'Checking…':intent==='POST'?'Request protected transaction':'Validate only — do not post'}
   </button>
   {intent==='POST'&&(kind==='TRANSFER'||kind==='RETURN')?<p role="alert">Transfer and RETURN posting remain blocked until the independently qualified protected writer and source authority are installed.</p>:null}
  </form>
  {pending&&<p role="alert">Original receipt request: <code>{pending.requestId}</code>. No further receipt may be submitted until authorized reconciliation.</p>}
  {trackingBlocked&&<p role="alert">Prior or unavailable request tracking prevents receipt submission. Contact the authorized administrator.</p>}
  <section aria-live="polite" className={styles.result}>
   <h2>Result</h2><p>{feedback}</p>
   {last?<p>Request type: {last.state} · Quantity: {last.quantity??form.quantity} ·
     Stored: {last.durable===true?'YES':'NO'} ·
     Stock moved: {last.stockChanged===true?'YES':'NO'}
     {last.state==='POSTED_VERIFIED'?(' · BIN balance: '+String(last.binBalance)+
      ' · Immutable movements: '+String(last.movementCount)+
      ' · Epoch: '+String(last.sourceEpoch)):''}</p>:null}
  </section>
  <section className="panel" aria-label="Authoritative PostgreSQL readback">
   <h2>Verified Stores readback</h2>
   <p>Reads actual scoped balances, movements or custody through the authenticated protected API. Never uses preview totals.</p>
   <label>Read type <select value={readIntent} onChange={e=>{
    setReadIntent(e.target.value as typeof readIntent);setReadResult(null);
   }}><option>BALANCES</option><option>MOVEMENTS</option><option>CUSTODY</option></select></label>
   <button type="button" disabled={readBusy||!selected?.stockRead} onClick={()=>void loadAuthoritativeRead()}>
    {readBusy?'Reading…':'Read protected PostgreSQL records'}
   </button>
   <p role="status" aria-live="polite">{readError}</p>
   {readResult?<div>
    <p>Verified rows: {readResult.rows?.length??0} · Epoch: {readResult.sourceEpoch}</p>
    <ul>{readResult.rows?.map((x,i)=><li key={x.movementId||x.itemCode+'-'+i}>
     {x.itemCode} / {x.productVersion} · {x.leafLocationId} · Quantity {x.quantity} ·
     {x.stockState} {x.employeeId?'· Employee '+x.employeeId:''}
     {x.humanAcknowledgement==='ACK_PENDING'?' · ACK PENDING':''}
    </li>)}</ul>
    {readResult.nextCursor?<p>More records exist; this view is limited to 25 rows per request.</p>:null}
   </div>:null}
  </section>
 </main>;
}

'use client';
import {useState,type FormEvent} from 'react';
type Row=Readonly<Record<string,unknown>>;
type ReadResponse=Readonly<{state?:string;code?:string;records?:readonly Row[]}>;
type DecisionResponse=Readonly<{state?:string;code?:string;active?:boolean;version?:string}>;
/** Display data only when returned by the DB-verified scoped read function. */
export default function EmployeeApprovals(){
 const [legalEntityId,setEntity]=useState(''),[siteId,setSite]=useState(''),
  [warehouseId,setWarehouse]=useState('');
 const [requests,setRequests]=useState<readonly Row[]>([]),[selected,setSelected]=useState<Row|null>(null);
 const [decision,setDecision]=useState<'APPROVED'|'DENIED'>('APPROVED');
 const [evidence,setEvidence]=useState(''),[reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('No verified approval queue loaded.');
 const scope={legalEntityId:legalEntityId.trim(),siteId:siteId.trim(),warehouseId:warehouseId.trim()};
 async function getQueue(){
  setBusy(true);setSelected(null);setRequests([]);setMessage('Checking signed session and qualified independent human.');
  try{
   const response=await fetch('/api/hft/masters',{method:'POST',
    headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',
    body:JSON.stringify({intent:'REVIEW_QUEUE',kind:'EMPLOYEE',...scope,search:''})});
   const data=await response.json() as ReadResponse;
   if(!response.ok)throw new Error(data.code||'P3_EMPLOYEE_REVIEW_NOT_AUTHORIZED');
   if(data.state!=='AVAILABLE'||!Array.isArray(data.records))
    throw new Error('P3_VERIFIED_APPROVAL_QUEUE_INVALID');
   setRequests(data.records);
   setMessage(data.records.length?'Eligible pending requests returned.':'No eligible pending Employee requests.');
  }catch(error){setMessage(error instanceof Error?error.message:'Review unavailable');}
  finally{setBusy(false);}
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!selected)return;
  setBusy(true);setMessage('Checking exact source, human separation and current policy in PostgreSQL.');
  try{
   const response=await fetch('/api/hft/masters/decision',{method:'POST',
    headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',
    body:JSON.stringify({
     decisionVersion:'HFT-R1-P3-EMPLOYEE-DECISION-V1',
     requestId:String(selected.request_id),requestPayloadSha256:String(selected.payload_sha256),
     recordId:String(selected.record_id),expectedVersion:String(selected.expected_version),
     policyRevision:String(selected.policy_revision),decision,
     evidenceSha256:evidence.trim(),reason:reason.trim(),...scope
    })});
   const data=await response.json() as DecisionResponse;
   if(!response.ok)throw new Error(data.code||'P3_EMPLOYEE_DECISION_UNAVAILABLE');
   if(data.state!=='APPLIED'&&data.state!=='DENIED')
    throw new Error('P3_EMPLOYEE_DECISION_NOT_VERIFIED');
   setRequests(old=>old.filter(r=>r.request_id!==selected.request_id));
   setSelected(null);setEvidence('');setReason('');
   setMessage(data.state==='DENIED'?
    'Independent denial recorded. No Employee Master change applied.':
    'Approved Employee change applied at revision '+String(data.version)+
    ' with employee '+(data.active?'ACTIVE':'INACTIVE')+'. Verify with a new scoped master read.');
  }catch(error){setMessage(error instanceof Error?error.message:'Decision unavailable');}
  finally{setBusy(false);}
 }
 return <main className="masters-shell">
  <header className="masters-head"><div>
   <a className="mis-link" href="/stores/masters">Employee & Stores Masters</a>
   <p className="eyebrow">Source-only · Nonproduction · No live posting</p>
   <h1>Independent Employee Decisions</h1>
   <p>Only a currently qualified separate human can see and decide eligible Employee changes.
    The shared database login does not grant authority, and a second account cannot
    be used to approve your own request.</p></div></header>
  <section className="panel">
   <h2>Authorized scope</h2><div className="masters-scope">
    <label>Legal entity<input required value={legalEntityId} onChange={e=>setEntity(e.target.value)}/></label>
    <label>Site<input required value={siteId} onChange={e=>setSite(e.target.value)}/></label>
    <label>Warehouse<input required value={warehouseId} onChange={e=>setWarehouse(e.target.value)}/></label>
   </div><p className="masters-help">These are selectors, not credentials. Both the verified session and
    persisted human qualification are checked by the protected database reader.</p>
   <div className="masters-actions"><button type="button" disabled={busy}
    onClick={()=>void getQueue()}>Load eligible pending requests</button></div>
  </section>
  <section className="panel" style={{marginTop:16}}>
   <h2>Independent review queue</h2>
   <div className="masters-table-wrap"><table className="data-table">
    <thead><tr><th>Employee</th><th>Action</th><th>Requester</th><th>Revision</th><th>Decision</th></tr></thead>
    <tbody>{requests.map(r=><tr key={String(r.request_id)}>
     <td>{String(r.record_id)}</td><td>{String(r.operation)}</td>
     <td>{String(r.requester_subject)}</td><td>{String(r.expected_version)}</td>
     <td><button type="button" disabled={busy} onClick={()=>{setSelected(r);setEvidence('');setReason('');}}>
       Review request</button></td></tr>)}</tbody>
   </table></div>
   {!requests.length?<p className="masters-help">No verified eligible requests to display.</p>:null}
  </section>
  {selected?<section className="panel" style={{marginTop:16}}>
   <p className="eyebrow">Decision requires independent evidence</p>
   <h2>{String(selected.operation)} — {String(selected.record_id)}</h2>
   <p className="masters-help">Request: {String(selected.request_id)}.
    Source revision: {String(selected.expected_version)}.
    Policy revision: {String(selected.policy_revision)}.</p>
   <p className="masters-help">Reason: {String(selected.reason)}</p>
   <form className="masters-form" onSubmit={e=>void submit(e)}>
    <label>Decision<select value={decision} onChange={e=>setDecision(e.target.value as 'APPROVED'|'DENIED')}>
     <option value="APPROVED">Approve and apply exact Employee revision</option>
     <option value="DENIED">Deny — do not mutate Employee Master</option>
    </select></label>
    <label>Trusted decision evidence SHA-256
     <input required minLength={64} maxLength={64} value={evidence}
      onChange={e=>setEvidence(e.target.value)}
      placeholder="Approved evidence artifact digest — no fabricated evidence"/></label>
    <label>Independent reason<textarea required minLength={8} maxLength={300}
     value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <button className="primary-button" type="submit" disabled={busy}>
     {busy?'Verifying authority…':'Submit signed decision'}</button>
   </form></section>:null}
  <div role="status" aria-live="polite" className="masters-result">{message}</div>
 </main>;
}

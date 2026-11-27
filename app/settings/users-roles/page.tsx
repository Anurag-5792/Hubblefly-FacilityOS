'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {ROLE_CATALOG,CRUD_MODULES,CRUD_ACTIONS,modulePermission,moduleSet,permissionsFor,roleSet,rolesAt,sameScope,type CrudPermission,type Assignment,type AuditEvent,type Employee,type RoleId,type Scope} from '../../../lib/hft/roles/role-assignment.ts';
import styles from './role-assignment.module.css';
import {operatorPending,operatorOtherPending,writeOperatorPending,clearOperatorPending} from '../../../lib/hft/roles/hosted-operator-client.ts';
type View={state:'READ_VERIFIED';employee:Employee;assignment:Assignment;history:AuditEvent[];status:string;
 grantableRoles:RoleId[];nextBeforeRevision:number|null;effectivePermissions:string[];canConfigureModules:boolean;canDelegateAdministration:boolean};
type Bootstrap={state:'CONNECTED';scopes:Scope[];actorEmployeeId:string;contextId?:string;expiresAt?:number};
type Pending={requestId:string;scope:Scope};
const endpoint='/api/hft/settings/roles';
const errorText=(code:string)=>({
 HOSTED_OPERATOR_SESSION_REQUIRED:'Sign in with your admitted corporate account.',
 HOSTED_OPERATOR_CONTEXT_CHANGED:'Your account changed. Sign in again to continue.',
 ROLE_CANONICAL_IDENTITY_CHANGED_DENIED:'Your canonical employee binding changed. Sign in again.',
 ROLE_BACKEND_NOT_ADMITTED:'The role backend is not connected. Employee search and saving are unavailable. No access has changed.',
 ROLE_IDENTITY_OR_BACKEND_UNAVAILABLE:'A signed session and admitted role backend are required. No access has changed.',
 ROLE_SELF_CHANGE_DENIED:'You cannot change your own access. Another authorized role administrator must do this.',
 ROLE_INCOMPATIBLE_DUTIES:'A Stores Operator or In-Charge cannot also be the checker or QC inspector in the same scope.',
 ROLE_REVISION_CONFLICT:'This assignment changed. Refresh it before making another change.',
 ROLE_ACTIVE_EMPLOYEE_CHANGED:'The employee is no longer active or their record changed. Search again.',
 ROLE_LAST_OWNER_DENIED:'This change would remove the last continuing Owner Admin for this scope.',
 ROLE_ADMIN_DELEGATION_DENIED:'Only an Owner Admin can assign or remove administrative roles.',
 ROLE_ADMIN_DELEGATION_OWNER_ONLY:'Only the verified Owner Admin can explicitly delegate role administration.',
 ROLE_MODULE_CONFIGURATION_OWNER_ONLY:'Only the verified Owner Admin can change module CRUD permissions.',
 ROLE_INVALID_MODULE_PERMISSIONS:'Select only permitted module CRUD actions.',
 ROLE_BACKDATING_DENIED:'The start date is in the past. Use Starts now or a future date.',
} as Record<string,string>)[code]??'The request was rejected or could not be verified. No successful assignment is claimed.';
class RoleRequestRejected extends Error {}
async function call(body:unknown,signal?:AbortSignal,contextId?:string):Promise<Record<string,unknown>>{
 const r=await fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json',...(contextId?{'X-HFT-Operator-Context':contextId}:{})},body:JSON.stringify(body),signal});
 const data=await r.json() as Record<string,unknown>;
 if(data.state==='UNCONFIRMED')return data;
 if(!r.ok){if(r.status>=400&&r.status<500&&data.state==='UNAVAILABLE')throw new RoleRequestRejected(String(data.code));
  throw Error(String(data.code??'ROLE_OPERATION_UNAVAILABLE'));}
 return data;
}
const localTime=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const label=(r:RoleId)=>ROLE_CATALOG.find(c=>c.id===r)?.label??r;
export default function RoleAssignmentPage(){
 const [boot,setBoot]=useState<Bootstrap|null>(null),[scope,setScope]=useState<Scope|null>(null);
 const [query,setQuery]=useState(''),[employees,setEmployees]=useState<Employee[]>([]),[view,setView]=useState<View|null>(null);
 const [message,setMessage]=useState('Checking signed session and role backend…'),[busy,setBusy]=useState(false);
 const [open,setOpen]=useState(false),[roles,setRoles]=useState<RoleId[]>([]),[chosen,setChosen]=useState<RoleId>('VIEWER');
 const [moduleGrants,setModuleGrants]=useState<CrudPermission[]>([]),[delegateAdmin,setDelegateAdmin]=useState(false);
 const [startsNow,setStartsNow]=useState(true),[start,setStart]=useState(localTime),[end,setEnd]=useState(''),[reason,setReason]=useState('');
 const [pending,setPending]=useState<Pending|null>(null),[preview,setPreview]=useState<RoleId>('STORES_OPERATOR');
 const epoch=useRef(0),abort=useRef<AbortController|null>(null),dialog=useRef<HTMLDialogElement|null>(null);
 const contextRef=useRef('');const [trackingBlocked,setTrackingBlocked]=useState(false);const mutationBusy=useRef(false);
 function forgetAccess(){epoch.current++;abort.current?.abort();contextRef.current='';setBoot(null);setScope(null);setPending(null);setTrackingBlocked(false);setEmployees([]);setQuery('');setView(null);setOpen(false);setRoles([]);setModuleGrants([]);setDelegateAdmin(false);setReason('');setBusy(false);}
 async function signOut(){if(busy)return;forgetAccess();try{const response=await fetch('/api/hft/live-masters/signout',{method:'POST',credentials:'same-origin',cache:'no-store'});if(!response.ok||(await response.json()).state!=='SIGNED_OUT')throw Error('SIGNOUT_UNCONFIRMED');setMessage('Signed out. Sign in again to continue.');}catch{setMessage('Sign-out unconfirmed. Close this tab or sign in again.');}}
 function lostAccess(e:unknown){return e instanceof RoleRequestRejected&&/SESSION_REQUIRED|CONTEXT_CHANGED|IDENTITY_CHANGED_DENIED|ACTOR_OR_SCOPE_DENIED|ROLE_PERMISSION_DENIED|ROLE_MANAGEMENT_DENIED/.test(e.message);}
 function showError(e:unknown){if(lostAccess(e))forgetAccess();setMessage(errorText(e instanceof Error?e.message:''));}
 function nextRequest(){abort.current?.abort();abort.current=new AbortController();return {n:++epoch.current,signal:abort.current.signal};}
 useEffect(()=>{const controller=new AbortController();
  call({action:'BOOTSTRAP'},controller.signal).then(data=>{
   if(data.state!=='CONNECTED'||!Array.isArray(data.scopes)||!data.scopes.length)throw Error('ROLE_BACKEND_NOT_ADMITTED');
   const b=data as unknown as Bootstrap;if(b.contextId!==undefined&&(!/^[a-f0-9]{64}$/.test(b.contextId)||!Number.isSafeInteger(b.expiresAt)||Number(b.expiresAt)<=Date.now()/1000))throw Error('HOSTED_OPERATOR_CONTEXT_CHANGED');
   contextRef.current=b.contextId||'';if(b.contextId){try{setPending(operatorPending(sessionStorage,'role',b.contextId));setTrackingBlocked(operatorOtherPending(sessionStorage,'role',b.contextId));}catch{setTrackingBlocked(true);}}
   setBoot(b);setScope(b.scopes[0]);setMessage('Connected. Search for an existing active employee.');
  }).catch(e=>{if(!controller.signal.aborted)setMessage(errorText(e instanceof Error?e.message:''));});
  return ()=>{controller.abort();abort.current?.abort();};
 },[]);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 useEffect(()=>{if(!boot?.expiresAt)return;const t=setTimeout(()=>{forgetAccess();setMessage('Session expired. Sign in again. Preserve any unresolved request reference.');},Math.max(0,boot.expiresAt*1000-Date.now()));return()=>clearTimeout(t);},[boot]);
 function changeScope(next:Scope){nextRequest();setScope(next);setEmployees([]);setQuery('');setView(null);setOpen(false);setBusy(false);setMessage('Scope changed. Search again to verify the employee and assignments.');}
 async function search(){if(!scope||query.trim().length<2)return;const {n,signal}=nextRequest();setBusy(true);setView(null);setEmployees([]);
  try{const data=await call({action:'SEARCH',scope,query},signal,contextRef.current);if(n!==epoch.current)return;
   if(data.state!=='RESULTS'||!Array.isArray(data.employees))throw Error('ROLE_OPERATION_UNAVAILABLE');
   setEmployees(data.employees as Employee[]);setMessage('Showing up to 30 active, identity-linked employees. Refine your search for more.');
  }catch(e){if(n===epoch.current&&!signal.aborted)showError(e);}
  finally{if(n===epoch.current)setBusy(false);}
 }
 async function selectEmployee(employeeId:string){if(!scope)return;const {n,signal}=nextRequest();setBusy(true);setView(null);
  try{const data=await call({action:'VIEW',scope,employeeId,beforeRevision:Number.MAX_SAFE_INTEGER},signal,contextRef.current);
   if(n!==epoch.current)return;const v=data as unknown as View;
   if(v.state!=='READ_VERIFIED'||v.employee.employeeId!==employeeId||!sameScope(v.assignment.scope,scope))throw Error('ROLE_OPERATION_UNAVAILABLE');
   setView(v);setMessage('Assignment and history read from the server.');
  }catch(e){if(n===epoch.current&&!signal.aborted)showError(e);}
  finally{if(n===epoch.current)setBusy(false);}
 }
 function edit(){if(!view)return;const current=rolesAt(view.assignment,new Date().toISOString());
  const period=view.assignment.periods.find(p=>p.from<=new Date().toISOString()&&(!p.to||new Date().toISOString()<p.to));
  setRoles([...current]);setModuleGrants([...(period?.modulePermissions??[])]);setDelegateAdmin(period?.administrationDelegated===true);
  setChosen('VIEWER');setStartsNow(true);setStart(localTime());setEnd('');setReason('');setOpen(true);}
 function addRole(){try{setRoles(roleSet([...roles,chosen]));}catch(e){setMessage(errorText(e instanceof Error?e.message:''));}}
 function toggleCrud(permission:CrudPermission){
  if(!view?.canConfigureModules)return;
  setModuleGrants(v=>moduleSet(v.includes(permission)?v.filter(p=>p!==permission):[...v,permission]));
 }
 async function save(revoke=false){if(!view||!scope||pending||trackingBlocked||mutationBusy.current)return;
  const requestId=crypto.randomUUID();const now=new Date().toISOString();
  let effectiveFrom:string,effectiveTo:string|null;
  try{effectiveFrom=startsNow?now:new Date(start).toISOString();effectiveTo=end&&!revoke?new Date(end).toISOString():null;
   if(!revoke)roleSet(roles);if(reason.trim().length<8)throw Error('ROLE_REASON_REQUIRED');}
  catch(e){setMessage(errorText(e instanceof Error?e.message:''));return;}
  const action=revoke?'REVOKE':view.assignment.periods.some(p=>!p.to||p.to>effectiveFrom)?'CHANGE':'ASSIGN';
  const operationEpoch=epoch.current,context=contextRef.current,original={requestId,scope};
  try{if(context)writeOperatorPending(sessionStorage,'role',context,original);}catch{setTrackingBlocked(true);setMessage('Original request tracking unavailable. No role change submitted.');return;}
  mutationBusy.current=true;setBusy(true);setPending(original);
  try{const result=await call({requestId,action,employeeId:view.employee.employeeId,employeeVersion:view.employee.version,
   scope,roles:revoke?[]:roles,expectedRevision:view.assignment.revision,effectiveFrom,effectiveTo,reason,
   ...(!revoke&&view.canConfigureModules?{modulePermissions:moduleGrants}:{}),
   ...(!revoke&&view.canDelegateAdministration?{delegateAdministration:delegateAdmin}: {})},undefined,contextRef.current);
   if(operationEpoch!==epoch.current||context!==contextRef.current)return;
   if(result.state!=='SAVED_VERIFIED'||result.requestId!==requestId){setMessage('Save outcome is unconfirmed. Do not submit another change. Check the original request below.');return;}
   if(context)clearOperatorPending(sessionStorage,'role',context,original);
   setPending(null);setOpen(false);await selectEmployee(view.employee.employeeId);
   setMessage(`Saved and independently read back. Current status: ${String(result.status)}. Audit revision: ${String(result.revision)}.`);
  }catch(e){
   if(operationEpoch!==epoch.current||context!==contextRef.current)return;
   if(e instanceof RoleRequestRejected){if(lostAccess(e)){forgetAccess();setMessage(errorText(e.message));return;}if(context){try{clearOperatorPending(sessionStorage,'role',context,original);}catch{setTrackingBlocked(true);return;}}setPending(null);setMessage(errorText(e.message));return;}
   // A network error may follow a committed write. Reconcile, never retry.
   setMessage(`${errorText(e instanceof Error?e.message:'')} Check the original save request before submitting again.`);
  }finally{mutationBusy.current=false;setBusy(false);}
 }
 async function reconcile(){if(!pending||!boot)return;setBusy(true);
  const operationEpoch=epoch.current,context=contextRef.current;
  try{const data=await call({action:'RECONCILE',...pending},undefined,context);
   if(operationEpoch!==epoch.current||context!==contextRef.current)return;
   if(data.state==='SAVED_VERIFIED'&&data.requestId===pending.requestId){if(context)clearOperatorPending(sessionStorage,'role',context,pending);setPending(null);setOpen(false);
    if(view)await selectEmployee(view.employee.employeeId);setMessage(`Save verified by independent readback. Current status: ${String(data.status)}.`);}
   else setMessage('Still unconfirmed. Keep this request ID for internal investigation; do not re-submit.');
  }catch(e){if(operationEpoch===epoch.current&&context===contextRef.current){if(lostAccess(e))forgetAccess();setMessage('Readback unavailable. No success is claimed and no write was retried.');}}finally{setBusy(false);}
 }
 async function moreHistory(){if(!view||!scope||!view.nextBeforeRevision)return;setBusy(true);const {n,signal}=nextRequest();
  try{const data=await call({action:'VIEW',scope,employeeId:view.employee.employeeId,beforeRevision:view.nextBeforeRevision},signal,contextRef.current);
   if(n===epoch.current&&data.state==='READ_VERIFIED'){const v=data as unknown as View;
    setView({...v,history:[...view.history,...v.history].filter((e,i,a)=>a.findIndex(x=>x.requestId===e.requestId)===i)});}}
  catch(e){if(!signal.aborted)setMessage(errorText(e instanceof Error?e.message:''));}finally{if(n===epoch.current)setBusy(false);}
 }
 const self=view?.employee.employeeId===boot?.actorEmployeeId;
 const entities=[...new Set(boot?.scopes.map(s=>s.legalEntityId)??[])];
 const sites=[...new Set(boot?.scopes.filter(s=>s.legalEntityId===scope?.legalEntityId).map(s=>s.siteId)??[])];
 const warehouses=boot?.scopes.filter(s=>s.legalEntityId===scope?.legalEntityId&&s.siteId===scope?.siteId)??[];
 return <main className="masters-shell">
  <header className="masters-head"><div><p className="eyebrow">Settings / Users &amp; Roles / Role Assignment</p>
   <h1>Users &amp; Roles</h1><p>Select an employee. Choose roles and scope. Review permissions before saving.</p></div>
   <div><Link className="masters-back" href="/settings">Back to Settings</Link>{boot?<button type="button" disabled={busy} onClick={()=>void signOut()}>Sign out</button>:<a className="primary-button" href="/api/hft/live-masters/auth/start?return=roles">Corporate Google sign-in</a>}</div></header>
  <div className={styles.notice} role="status" aria-live="polite"><strong>{boot?'Role source connected':'Backend not connected'}</strong><p>{message}</p>
   <small>Business roles do not grant database privileges or override stock approvals.</small></div>
  {trackingBlocked&&<p role="alert">An unresolved request or unavailable browser tracking blocks role changes. Preserve the original request for administrator review.</p>}
  {pending&&<section className={styles.notice}><strong>Unconfirmed save</strong><p>Original request: <code>{pending.requestId}</code></p>
   <button disabled={busy||!boot} onClick={()=>void reconcile()}>Check save outcome — no retry</button></section>}
  <section className="panel"><h2>Assignment scope</h2><div className={styles.scope}>
   <label>Legal entity<select aria-label="Legal entity" disabled={!boot||busy||!!pending} value={scope?.legalEntityId??''} onChange={e=>{const s=boot?.scopes.find(s=>s.legalEntityId===e.target.value);if(s)changeScope(s);}}>
    {!boot&&<option value="">Verified scopes unavailable</option>}{entities.map(e=><option key={e}>{e}</option>)}</select></label>
   <label>Site<select aria-label="Site" disabled={!boot||busy||!!pending} value={scope?.siteId??''} onChange={e=>{const s=boot?.scopes.find(s=>s.legalEntityId===scope?.legalEntityId&&s.siteId===e.target.value);if(s)changeScope(s);}}>
    {!boot&&<option value="">Select an admitted scope</option>}{sites.map(s=><option key={s}>{s}</option>)}</select></label>
   <label>Warehouse<select aria-label="Warehouse" disabled={!boot||busy||!!pending} value={scope?.warehouseId??''} onChange={e=>{const s=warehouses.find(s=>s.warehouseId===e.target.value);if(s)changeScope(s);}}>
    {!boot&&<option value="">Select an admitted scope</option>}{warehouses.map(s=><option key={s.warehouseId}>{s.warehouseId}</option>)}</select></label>
  </div></section>
  <div className={styles.columns}><section className="panel"><h2>Find an employee</h2>
   <form className={styles.search} onSubmit={e=>{e.preventDefault();void search();}}>
    <label htmlFor="employee-search">Employee name or ID</label><input id="employee-search" value={query} maxLength={80} disabled={!boot||!!pending}
     onChange={e=>{nextRequest();setBusy(false);setQuery(e.target.value);setEmployees([]);setView(null);}} placeholder="Search active employees"/>
    <button disabled={!boot||busy||query.trim().length<2||!!pending}>Search</button></form>
   <div className={styles.employees}>{employees.map(e=><button key={e.employeeId} disabled={busy||!!pending} onClick={()=>void selectEmployee(e.employeeId)}>
    <strong>{e.fullName}</strong><span>{e.employeeId} · Active</span></button>)}</div>
   {!employees.length&&<p className="masters-help">No employee is selected. Only active employees linked to authenticated identities can receive roles.</p>}
  </section><section className="panel"><div className="panel-heading"><h2>Existing assignments</h2><span className="status">{view?.status??'Not loaded'}</span></div>
   {view?<><h3>{view.employee.fullName}</h3><p>{view.employee.employeeId} · Revision {view.assignment.revision}</p>
    {view.assignment.periods.map((p,i)=><div key={i} className={styles.period}><strong>{p.roles.map(label).join(', ')}</strong>
     <small>{new Date(p.from).toLocaleString()} → {p.to?new Date(p.to).toLocaleString():'No end date'}</small>
     <small>Module CRUD: {(p.modulePermissions??[]).join(', ')||'None'} · Role administration delegation: {p.administrationDelegated?'Explicitly delegated':'Not delegated'}</small></div>)}
    {!view.assignment.periods.length&&<p>No current or scheduled roles.</p>}
    <button className="primary-button" onClick={edit} disabled={busy||!!pending||trackingBlocked||self||!view.employee.active}>Assign or change roles</button>
    {self&&<p className="masters-help">Self-change is blocked. Use another authorized administrator.</p>}
    <p className="masters-help">Revocation is available in the assignment window. Future replacements preserve current access until their start date.</p>
   </>:<p className="masters-help">Select an employee to load saved roles, dates and status. This screen never substitutes sample assignments.</p>}
  </section></div>
  <section className="panel" style={{marginTop:16}}><h2>Permission preview</h2>
   <label className={styles.field}>Role<select value={preview} onChange={e=>setPreview(e.target.value as RoleId)}>{ROLE_CATALOG.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
   <div className={styles.chips}>{permissionsFor([preview]).map(p=><code key={p}>{p}</code>)}</div>
   {view&&<><h3>Actual effective permissions for selected employee</h3><div className={styles.chips}>{view.effectivePermissions.map(p=><code key={p}>{p}</code>)}</div></>}
   <p className="masters-help">These are this module’s application permission definitions, not a claim of current access. Existing protected stock controls remain mandatory; live enforcement awaits backend activation.</p>
  </section>
  <section className="panel" style={{marginTop:16}}><h2>Assignment history</h2>
   <div className="masters-table-wrap"><table className="data-table"><thead><tr><th>Revision</th><th>Action</th><th>Actor</th><th>Recorded</th><th>Reason</th></tr></thead>
    <tbody>{view?.history.map(h=><tr key={h.requestId}><td>{h.after.revision}</td><td>{h.action}</td><td>{h.actorEmployeeId} / {h.actorSubject}</td><td>{new Date(h.recordedAt).toLocaleString()}</td><td>{h.reason}</td></tr>)}</tbody></table></div>
   {!view?.history.length&&<p className="masters-help">No verified history loaded.</p>}{view?.nextBeforeRevision&&<button disabled={busy} onClick={()=>void moreHistory()}>Load older history</button>}
  </section>
  <dialog ref={dialog} className={styles.dialog} onCancel={e=>{if(busy||pending)e.preventDefault();else setOpen(false);}}>
   <form onSubmit={e=>{e.preventDefault();void save();}}><header className={styles.dialogHead}><h2>Role Assignment</h2>
    <button type="button" onClick={()=>setOpen(false)} disabled={busy}>Close</button></header>
    <p><strong>{view?.employee.fullName}</strong> · {view?.employee.employeeId}</p><p className="masters-help">{scope?.legalEntityId} / {scope?.siteId} / {scope?.warehouseId}</p>
    <fieldset disabled={busy||!!pending||trackingBlocked}><legend>Choose compatible roles</legend>
     <div className={styles.add}><label>Role<select value={chosen} onChange={e=>setChosen(e.target.value as RoleId)}>{ROLE_CATALOG.filter(r=>view?.grantableRoles.includes(r.id)).map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
      <button type="button" onClick={addRole} disabled={roles.includes(chosen)}>Add role</button></div>
     <div className={styles.chips}>{roles.map(r=><button type="button" key={r} onClick={()=>setRoles(roles.filter(x=>x!==r))}>{label(r)} ×</button>)}</div>
     <h3>Permissions for this selection</h3><div className={styles.chips}>{permissionsFor(roles).map(p=><code key={p}>{p}</code>)}</div>
     <h3>Module Create / Read / Update / Delete</h3>
     <p className="masters-help">Only Owner Admin may alter these scoped application permissions. Delete never permits removal of immutable stock, transactions or audit records.</p>
     <div className="masters-table-wrap"><table className="data-table"><thead><tr><th>Module</th>{CRUD_ACTIONS.map(a=><th key={a}>{a.toUpperCase()}</th>)}</tr></thead>
     <tbody>{CRUD_MODULES.map(m=><tr key={m.id}><th>{m.label}</th>{CRUD_ACTIONS.map(a=>{const permission=modulePermission(m.id,a);return <td key={permission}>
      <input type="checkbox" aria-label={`${m.label} ${a}`} checked={moduleGrants.includes(permission)} disabled={!view?.canConfigureModules||busy||!!pending}
       onChange={()=>toggleCrud(permission)}/></td>;})}</tr>)}</tbody></table></div>
     <label className={styles.check}><input type="checkbox" checked={delegateAdmin} disabled={!view?.canDelegateAdministration||!roles.includes('ROLE_ADMINISTRATOR')||busy||!!pending}
      onChange={e=>setDelegateAdmin(e.target.checked)}/>Explicitly delegate role administration (owner decision, audited and revocable)</label>
     <p className="masters-help">Effective module grants: {moduleGrants.length?moduleGrants.join(', '):'None'}.</p>
     <label className={styles.check}><input type="checkbox" checked={startsNow} onChange={e=>setStartsNow(e.target.checked)}/>Starts now</label>
     {!startsNow&&<label className={styles.field}>Effective from (your local time)<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} required/></label>}
     <label className={styles.field}>Effective until (optional, your local time)<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></label>
     <label className={styles.field}>Reason (at least 8 characters)<textarea value={reason} minLength={8} maxLength={500} required onChange={e=>setReason(e.target.value)}/></label>
    </fieldset>
    <p className="masters-help">This replaces the selected employee’s role set in this exact scope. Revocation cancels all grants scheduled after the effective date. No self-escalation or same-transaction approval conflicts are allowed.</p>
    <div className={styles.footer}><button type="button" className={styles.danger} disabled={busy||!!pending||trackingBlocked||!view?.assignment.periods.length||reason.trim().length<8}
     onClick={()=>{if(window.confirm('Revoke this employee’s roles in the selected scope from the effective date?'))void save(true);}}>Revoke roles</button>
     <button className="primary-button" disabled={busy||!!pending||trackingBlocked||!roles.length||reason.trim().length<8}>Save assignment</button></div>
    <p role="status">{busy?'Verifying server save and readback…':message}</p>
    {pending&&<button type="button" disabled={busy} onClick={()=>void reconcile()}>Check original save outcome</button>}
   </form>
  </dialog>
 </main>;
}

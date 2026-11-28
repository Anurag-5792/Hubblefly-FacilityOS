'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
type Context={state:'PENDING_ROLE'|'ROLE_ASSIGNED';employeeId:string;fullName:string;email:string;legalEntityId:string;siteId:string;expiresAt:number;registrationWarehouses:string[];scopes:{warehouseId:string;permissions:string[]}[]};
type Target={employeeId:string;fullName:string;email:string|null;version:number;bound:boolean};
async function request(body:unknown){
 const response=await fetch('/api/hft/employee-account',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw Error(data.code??'HF101_SOURCE_UNAVAILABLE');return data;
}
export default function EmployeeAccount(){
 const [context,setContext]=useState<Context|null>(null),[message,setMessage]=useState('Checking employee access…'),[busy,setBusy]=useState(false);
 const [warehouse,setWarehouse]=useState(''),[employee,setEmployee]=useState(''),[target,setTarget]=useState<Target|null>(null),[email,setEmail]=useState(''),[reason,setReason]=useState('');
 function clear(){setContext(null);setTarget(null);setEmail('');setReason('');setWarehouse('');setEmployee('');}
 async function refresh(){setBusy(true);clear();try{const c=await request({action:'CONTEXT'}) as Context;
  if(!['PENDING_ROLE','ROLE_ASSIGNED'].includes(c.state)||!Array.isArray(c.scopes)||!Array.isArray(c.registrationWarehouses)||c.expiresAt<=Date.now()/1000)throw Error('HF101_CONTEXT_INVALID');
  setContext(c);setWarehouse(c.registrationWarehouses[0]??'');setMessage(c.state==='PENDING_ROLE'?'Signed in. Awaiting role assignment.':'Signed in. Current role permissions verified.');
 }catch{setMessage('Sign in with your registered email. An active, verified employee account and admitted database are required.');}finally{setBusy(false);}}
 useEffect(()=>{void refresh();},[]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!context)return;const timer=setTimeout(()=>{clear();setMessage('Session expired. Sign in again.');},Math.max(0,context.expiresAt*1000-Date.now()));return()=>clearTimeout(timer);},[context]);
 async function lookup(){setTarget(null);setEmail('');setReason('');setBusy(true);try{const data=await request({action:'TARGET',employeeId:employee.trim(),warehouseId:warehouse});
  setTarget(data.target);setEmail(data.target.email??'');setMessage('Employee registration read from the canonical source.');
 }catch{setMessage('Employee or scope not admitted. Verify the canonical employee/person binding and your current access.');}finally{setBusy(false);}}
 async function save(){if(!target||!context)return;setBusy(true);try{const data=await request({action:'REGISTER',employeeId:target.employeeId,warehouseId:warehouse,email:email.trim(),version:target.version,reason});
  if(data.state!=='SAVED_VERIFIED')throw Error('HF101_COMMIT_UNCONFIRMED');setTarget(data.target);setEmail(data.target.email??'');setReason('');setMessage('Employee email saved and independently read back. No role was granted.');
 }catch{setTarget(null);setEmail('');setReason('');setMessage('Registration rejected or unconfirmed. Reload the employee before any further change.');}finally{setBusy(false);}}
 async function signOut(){setBusy(true);clear();try{const r=await fetch('/api/hft/live-masters/signout',{method:'POST',credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('SIGNOUT');setMessage('Signed out.');}catch{setMessage('Sign-out unconfirmed. Close this tab.');}finally{setBusy(false);}}
 return <main className="content-grid"><header className="masters-head"><div><p className="eyebrow">Hubblefly FacilityOS</p><h1>Employee account</h1><p>Registered email and current employee access.</p></div><Link href="/">Application dashboard</Link></header>
 <section className="panel"><p role="status">{message}</p>{!context?<a className="primary-button" href="/api/hft/live-masters/auth/start?return=employee">Sign in with Google</a>:<><h2>{context.fullName}</h2><p>{context.employeeId} · {context.email}</p><p>{context.legalEntityId} / {context.siteId}</p><button disabled={busy} onClick={()=>void refresh()}>Refresh access</button> <button disabled={busy} onClick={()=>void signOut()}>Sign out</button></>}</section>
 {context&&<section className="panel"><h2>My access</h2>{context.state==='PENDING_ROLE'?<p>No roles assigned. You can view your account only.</p>:<>{context.scopes.map(s=><div key={s.warehouseId}><strong>{s.warehouseId}</strong><p>{s.permissions.join(', ')}</p></div>)}
 {context.scopes.some(s=>s.permissions.includes('roles.read'))&&<Link href="/settings/users-roles">Open Users &amp; Roles</Link>}<p>Stock posting and other business modules require separate operational admission.</p></>}</section>}
 {context&&context.registrationWarehouses.length>0&&<section className="panel"><h2>Employee email registration</h2><p>Owner Admin only. Select an existing active canonical employee. Registration does not grant a business role.</p>
 <form onSubmit={e=>{e.preventDefault();void lookup();}}><label>Administration warehouse <select value={warehouse} disabled={busy} onChange={e=>{setWarehouse(e.target.value);setTarget(null);}}>{context.registrationWarehouses.map(w=><option key={w}>{w}</option>)}</select></label> <label>Employee ID <input value={employee} required maxLength={128} disabled={busy} onChange={e=>{setEmployee(e.target.value);setTarget(null);}}/></label> <button disabled={busy}>Find employee</button></form>
 {target&&<form onSubmit={e=>{e.preventDefault();void save();}}><h3>{target.fullName} ({target.employeeId})</h3><p>{target.bound?'Provider identity already bound; email changes preserve that subject.':'Provider identity will bind after verified first sign-in.'}</p><label>Registered email <input type="email" required maxLength={254} value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/></label> <label>Reason <input required minLength={8} maxLength={500} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label> <button disabled={busy||reason.trim().length<8}>Save email</button></form>}</section>}
 </main>;
}

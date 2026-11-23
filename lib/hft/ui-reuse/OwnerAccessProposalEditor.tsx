'use client';
/** HFT-native UI-only OWNER route proposal. There is no installed IAM writer.
 * Never ingest donor Clerk/MongoDB permissions or create a real grant.
 */
import {useState,type FormEvent} from 'react';
import {C047_EXISTING_ROUTES,mayDisplayRoute,type UiPrincipal}
 from './route-registry.ts';
import {proposeRouteAccess,type ScopedAccessProposal}
 from './access-proposal-model.ts';
import styles from './reuse-prep.module.css';

export function OwnerAccessProposalEditor(props:Readonly<{
 actor:UiPrincipal|null;
 legalEntityId:string;siteId:string;warehouseId:string;
 policyGeneration:number;
 onPropose:(draft:ScopedAccessProposal)=>void;
}>){
 const [target,setTarget]=useState('');
 const [reason,setReason]=useState('');
 const [selected,setSelected]=useState<readonly string[]>([]);
 const [feedback,setFeedback]=useState('PROPOSED_NOT_APPLIED — no user permission has changed.');
 const eligible=Boolean(props.actor?.active&&
  props.actor.systemRoles.includes('OWNER_SUPERADMIN')&&
  props.actor.policyGeneration===props.policyGeneration&&
  props.actor.grantableScopes?.some(scope=>scope.legalEntityId===props.legalEntityId&&
    scope.siteId===props.siteId&&scope.warehouseId===props.warehouseId));
 const available=C047_EXISTING_ROUTES.filter(x=>
  mayDisplayRoute(props.actor,x.path));
 function toggle(permission:string){
  setSelected(current=>current.includes(permission)?
   current.filter(p=>p!==permission):[...current,permission]);
 }
 function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  try{
   const result=proposeRouteAccess({actor:props.actor,targetSubject:target.trim(),
    legalEntityId:props.legalEntityId,siteId:props.siteId,
    warehouseId:props.warehouseId,routePermissions:selected,
    reason:reason.trim(),expectedPolicyGeneration:props.policyGeneration});
   props.onPropose(result); // Caller may retain only as a non-effective draft.
   setFeedback('PROPOSED_NOT_APPLIED — independent governance approval is required.');
  }catch{
   setFeedback('PROPOSAL_DENIED — scope, identity, policy or permission invalid.');
  }
 }
 return <section className={styles.panel} aria-label="OWNER route access proposal">
  <div className={styles.header}><div>
   <p className={styles.eyebrow}>OWNER / SUPERADMIN · source-only</p>
   <h2>Route access proposal</h2>
   <p>OWNER may discover registered pages. Posting, approval and IAM grants are separate authorities.</p>
  </div><span className={styles.neutralStatus}>NO EFFECTIVE GRANTS</span></div>
  {!eligible?<p role="alert" className={styles.note}>
   Verified OWNER policy and assignable scope are not available.
   Route assignment is blocked; no grant or approval can be issued here.
  </p>:<form className={styles.form} onSubmit={submit}>
   <div className={styles.filters}>
    <label>Target verified user subject<input required value={target}
     onChange={e=>setTarget(e.target.value)} placeholder="Existing person-linked subject"/></label>
    <label>Business reason<input required minLength={8} maxLength={300}
     value={reason} onChange={e=>setReason(e.target.value)}/></label>
   </div>
   <p className={styles.note}>Proposed scope: {props.legalEntityId} /
    {props.siteId} / {props.warehouseId}; policy generation {props.policyGeneration}.
    These fields are never proof of authority.</p>
   <fieldset className={styles.fieldset}><legend>Registered route-view permissions only</legend>
    {available.map(route=><label className={styles.permissionRow} key={route.id}>
     <input type="checkbox" checked={selected.includes(route.viewPermission)}
      onChange={()=>toggle(route.viewPermission)}/>
     <span><strong>{route.name}</strong><small>{route.path} · {route.viewPermission}</small></span>
    </label>)}
   </fieldset>
   <button type="submit">Prepare proposal — do not apply</button>
  </form>}
  <p role="status" className={styles.note}>{feedback}</p>
  <p className={styles.footnote}>No new admin route or IAM API exists.
   Self-grant, cross-scope access, unknown permissions and stale policies are denied
   in the draft model. Final authority remains server/database controlled,
   independently approved and immutably audited once qualified.
   This UI cannot authorize stock, Holds, Gate R, Gate A or production.</p>
 </section>;
}

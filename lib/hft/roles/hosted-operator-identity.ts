/** HF094: managed provider/employee/person roster, distinct from Masters fixtures.
 * Roster is independently admitted configuration, never an application-role grant.
 */
import {createHash} from 'node:crypto';
import type {OperatorEnv} from './hosted-operator-profile.ts';
export type OperatorActor=Readonly<{identityClass:'CANONICAL_EMPLOYEE';subject:string;
 providerSubject:string;employeeId:string;personId:string;legalEntityId:string;siteId:string;warehouseIds:string[]}>;
export type OperatorRoster=Readonly<Record<string,OperatorActor>>;
const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const email=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const reserved=/(^|[._:-])(qual077|r1q|fixture|synthetic|sample|test)([._:-]|$)/i;
const validId=(v:unknown):v is string=>typeof v==='string'&&id.test(v)&&!reserved.test(v);
function object(v:unknown):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('HOSTED_OPERATOR_ROSTER_INVALID');
 return v as Record<string,unknown>;
}
export function operatorRoster(e:OperatorEnv):OperatorRoster{
 const raw=e.HFT_HOSTED_OPERATOR_ACTORS_JSON||'';
 if(raw.length>65536)throw Error('HOSTED_OPERATOR_ROSTER_INVALID');
 const entries=Object.entries(object(JSON.parse(raw)));
 if(entries.length<1||entries.length>40)throw Error('HOSTED_OPERATOR_ROSTER_INVALID');
 const subjects=new Set<string>(),providers=new Set<string>(),people=new Set<string>(),employees=new Set<string>();
 const result:Record<string,OperatorActor>=Object.create(null);
 for(const [mail,value] of entries){
  const a=object(value);
  if(!email.test(mail)||mail!==mail.toLowerCase()||mail.length>254||Object.keys(a).length!==8||
   a.identityClass!=='CANONICAL_EMPLOYEE'||!validId(a.subject)||!validId(a.employeeId)||!validId(a.personId)||
   !validId(a.legalEntityId)||!validId(a.siteId)||typeof a.providerSubject!=='string'||
   !/^[\x21-\x7e]{1,256}$/.test(a.providerSubject)||reserved.test(a.providerSubject)||
   !Array.isArray(a.warehouseIds)||a.warehouseIds.length<1||a.warehouseIds.length>32||
   !a.warehouseIds.every(validId)||new Set(a.warehouseIds).size!==a.warehouseIds.length||
   subjects.has(a.subject)||providers.has(a.providerSubject)||people.has(a.personId)||
   employees.has(a.legalEntityId+'\0'+a.employeeId))throw Error('HOSTED_OPERATOR_ROSTER_INVALID');
  subjects.add(a.subject);providers.add(a.providerSubject);people.add(a.personId);employees.add(a.legalEntityId+'\0'+a.employeeId);
  result[mail]={identityClass:'CANONICAL_EMPLOYEE',subject:a.subject,providerSubject:a.providerSubject,
   employeeId:a.employeeId,personId:a.personId,legalEntityId:a.legalEntityId,siteId:a.siteId,warehouseIds:[...a.warehouseIds]};
 }
 return result;
}
export function operatorBinding(mail:string,a:OperatorActor):string{
 return createHash('sha256').update(JSON.stringify(['HFT-HOSTED-OPERATOR-BINDING-V1',mail,a.subject,
 a.providerSubject,a.employeeId,a.personId,a.legalEntityId,a.siteId,[...a.warehouseIds].sort()])).digest('hex');
}
export function hostedActorForClaims(e:OperatorEnv,c:Record<string,unknown>):OperatorActor{
 const entry=Object.entries(operatorRoster(e)).find(([,a])=>a.subject===c.sub);
 if(!entry)throw Error('HOSTED_OPERATOR_SESSION_ACTOR_NOT_ADMITTED');
 const [mail,a]=entry;
 if(c.operatorBinding!==operatorBinding(mail,a)||c.legalEntityId!==a.legalEntityId||c.siteId!==a.siteId||
  !Array.isArray(c.warehouseIds)||JSON.stringify([...c.warehouseIds].sort())!==JSON.stringify([...a.warehouseIds].sort()))
  throw Error('HOSTED_OPERATOR_SESSION_BINDING_CHANGED');
 return a;
}
export function assertCanonicalOperator(a:OperatorActor,p:{subject:string;employeeId:string;personId:string},
 scopes:readonly {legalEntityId:string;siteId:string;warehouseId:string}[]):void{
 if(p.subject!==a.subject||p.employeeId!==a.employeeId||p.personId!==a.personId||
  !a.warehouseIds.every(w=>scopes.some(s=>s.legalEntityId===a.legalEntityId&&s.siteId===a.siteId&&s.warehouseId===w)))
  throw Error('HOSTED_OPERATOR_CANONICAL_IDENTITY_DENIED');
}

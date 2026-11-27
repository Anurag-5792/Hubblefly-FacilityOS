/** Future read adapter: explicit management admission is separate from stock.read.
 * No browser-supplied stock, BOM or authority; no writer or new ledger.
 * Do not wire to intake candidates or expose until actual source is qualified.
 */
import {buildPlan,bomEffective,validateSnapshot,type PlanRequest,type Snapshot} from './build-plan.ts';
import {object,exactKeys,scopeFrom,sameScope,type Scope} from '../roles/role-assignment.ts';
import {requireCurrentBusinessPermission,type RoleStore,type SessionIdentity} from '../roles/role-service.ts';
export interface PlanningSource {
 // Return a full, consistent, independently admitted canonical read snapshot,
 // not a page of intake rows. This adapter is not yet installed.
 read(scope:Scope):Promise<Snapshot>;
}
export type PlanningDeps=Readonly<{
 authenticate(request:Request):Promise<SessionIdentity>;
 roles:RoleStore;
 // Must be an independent current scoped management authorization. It must
 // not infer admission from owner-only intake or from the browser.
 requireManagementRead(session:SessionIdentity,scope:Scope):Promise<void>;
 source:PlanningSource;
}>;
export async function executePlanningRead(request:Request,raw:unknown,deps:PlanningDeps){
 const session=await deps.authenticate(request);
 const p=object(raw);exactKeys(p,['intent','scope','scenario']);
 const scope=scopeFrom(p.scope);
 if(p.intent!=='CATALOG'&&p.intent!=='PLAN')throw Error('PLAN_INTENT_INVALID');
 if(p.intent==='CATALOG'&&p.scenario!==null)throw Error('PLAN_CATALOG_FIELDS');
 const authorize=async()=>{
  if(session.expiresAt<=Date.now()/1000)throw Error('PLAN_SESSION_EXPIRED');
  await deps.requireManagementRead(session,scope);
  await requireCurrentBusinessPermission(deps.roles,session,scope,'stock.read');
 };
 await authorize();
 const snapshot=await deps.source.read(scope);
 if(snapshot.authoritative!==true||!sameScope(snapshot.scope,scope))throw Error('PLAN_SOURCE_SCOPE_DENIED');
 validateSnapshot(snapshot);
 const result=p.intent==='CATALOG'?{
  state:'CATALOG' as const,scope,asOf:snapshot.asOf,sourceEpoch:snapshot.sourceEpoch,complete:snapshot.complete,
  models:snapshot.models.map(m=>({id:m.id,name:m.name,version:m.version,active:m.active,bomReady:bomEffective(m.bom,snapshot.asOf)})),
  common:snapshot.items.filter(i=>i.verified&&i.active&&i.applicableModels&&i.applicableModels.length>1)
   .map(i=>({itemCode:i.itemCode,productVersion:i.productVersion,uom:i.uom,name:i.name}))
 }:(()=>{
  const s=object(p.scenario);exactKeys(s,['condition','mode','priorities','protect','ignore']);
  if(!Array.isArray(s.priorities)||!Array.isArray(s.protect)||!Array.isArray(s.ignore))throw Error('PLAN_SCENARIO_FIELDS');
  for(const x of s.priorities)exactKeys(object(x),['modelId','cap']);
  for(const x of s.protect)exactKeys(object(x),['modelId','quantity']);
  for(const x of s.ignore)exactKeys(object(x),['itemCode','productVersion','uom']);
  return buildPlan(snapshot,{scope,...s} as PlanRequest);
 })();
 // No result escapes after scope, session or permission loss during the read.
 await authorize();
 return result;
}

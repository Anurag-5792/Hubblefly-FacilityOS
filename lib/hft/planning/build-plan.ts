/** Issue 19: deterministic material planning. Server-supplied authorized snapshot only.
 * Quantities use the canonical six-decimal micro-unit representation. Never posts,
 * reserves, imports, converts UOM, or issues business identifiers.
 */
import {parseQuantity,formatQuantity} from '../domain/quantity.ts';
import {sameScope,type Scope} from '../roles/role-assignment.ts';

export type ItemRef=Readonly<{itemCode:string;productVersion:string;uom:string}>;
export type Line=Readonly<ItemRef&{quantity:string}>;
export type Bom=Readonly<{revisionId:string;state:'APPROVED'|'DRAFT'|'RETIRED';complete:boolean;
 effectiveFrom:string;effectiveTo:string|null;lines:readonly Line[]}>;
export type Model=Readonly<{id:string;name:string;version:string;active:boolean;bom:Bom|null}>;
export type Material=Readonly<ItemRef&{name:string;active:boolean;verified:boolean;
 applicableModels:readonly string[]|null;usedEligibleModels:readonly string[]|null;
 newOnHand:string|null;usedOnHand:string|null;newFree:string|null;usedFree:string|null;
 held:string|null;unknown:string|null;
 // Confirmed eligible existing reservations already excluded from free balance.
 reservations:readonly {modelId:string;newQuantity:string;usedQuantity:string}[]|null;
 assembly:Bom|null}>;
export type Snapshot=Readonly<{scope:Scope;asOf:string;sourceEpoch:string;provenance:string;
 authoritative:true;complete:boolean;models:readonly Model[];items:readonly Material[]}>;
export type PlanRequest=Readonly<{scope:Scope;condition:'NEW_ONLY'|'NEW_AND_ELIGIBLE_USED';
 mode:'FULL'|'CORE';priorities:readonly {modelId:string;cap:number|null}[];
 protect:readonly {modelId:string;quantity:number}[];ignore:readonly ItemRef[]}>;
type Qty=bigint;
type Pool={new:Qty;used:Qty};
type Detail={required:Qty;drawn:Qty;built:Qty;protected:Qty;reserved:Qty;shortage:Qty;ignored:Qty};
type Trial={pool:Map<string,Pool>;rows:Map<string,Detail>;issues:Set<string>;budget:number};
const ZERO=0n,MICRO=1_000_000n,MAX=9_223_372_036_854_775_807n;
const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const validId=(x:string)=>typeof x==='string'&&id.test(x);
const fail=(s:string):never=>{throw Error(s)};
export const materialKey=(x:ItemRef)=>JSON.stringify([x.itemCode,x.productVersion,x.uom]);
function checkRef(r:ItemRef){if(!validId(r.itemCode)||!validId(r.productVersion)||!validId(r.uom))fail('PLAN_REFERENCE_INVALID');}
function qty(v:string|null):Qty|null{return v===null?null:parseQuantity(v);}
function time(s:string){return typeof s==='string'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;}
function unique(values:readonly string[]){return new Set(values).size===values.length;}
function whole(n:number){if(!Number.isSafeInteger(n)||n<0)fail('PLAN_WHOLE_QUANTITY_REQUIRED');return BigInt(n);}
function add(a:Qty,b:Qty){const v=a+b;if(v>MAX)fail('PLAN_QUANTITY_RANGE_EXCEEDED');return v;}
function multiply(a:Qty,b:Qty){const n=a*b;if(n%MICRO!==0n)fail('PLAN_UOM_PRECISION_UNRESOLVED');const v=n/MICRO;if(v>MAX)fail('PLAN_QUANTITY_RANGE_EXCEEDED');return v;}
function checkLines(lines:readonly Line[]){
 if(!Array.isArray(lines)||lines.length>2000||!unique(lines.map(materialKey)))fail('PLAN_DUPLICATE_OR_OVERSIZE_BOM');
 for(const l of lines){checkRef(l);if(parseQuantity(l.quantity)<=0n)fail('PLAN_POSITIVE_BOM_QUANTITY_REQUIRED');}
}
export function bomEffective(b:Bom|null,at:string):b is Bom{
 return !!b&&b.state==='APPROVED'&&b.complete===true&&validId(b.revisionId)&&time(b.effectiveFrom)&&
 (b.effectiveTo===null||(time(b.effectiveTo)&&b.effectiveTo>b.effectiveFrom))&&b.effectiveFrom<=at&&
 (b.effectiveTo===null||at<b.effectiveTo)&&Array.isArray(b.lines)&&b.lines.length>0;
}
export function validateSnapshot(s:Snapshot){
 if(s.authoritative!==true||typeof s.complete!=='boolean'||!time(s.asOf)||!validId(s.sourceEpoch)||
 !s.provenance||!s.scope||!Array.isArray(s.models)||!Array.isArray(s.items)||s.models.length>100||s.items.length>20000)
  fail('PLAN_AUTHORITATIVE_SNAPSHOT_REQUIRED');
 if(!unique(s.models.map(m=>m.id))||!unique(s.items.map(materialKey)))fail('PLAN_DUPLICATE_SOURCE_IDENTITY');
 const modelIds=new Set(s.models.map(m=>m.id));
 for(const m of s.models){if(!validId(m.id)||!validId(m.version)||!m.name||typeof m.active!=='boolean')fail('PLAN_MODEL_INVALID');if(m.bom)checkLines(m.bom.lines);}
 for(const i of s.items){
  checkRef(i);if(!i.name||typeof i.active!=='boolean'||typeof i.verified!=='boolean')fail('PLAN_MATERIAL_INVALID');
  for(const a of [i.applicableModels,i.usedEligibleModels])if(a!==null&&(!Array.isArray(a)||!unique(a)||a.some(x=>!modelIds.has(x))))fail('PLAN_APPLICABILITY_INVALID');
  if(i.usedEligibleModels&&i.applicableModels&&i.usedEligibleModels.some(x=>!i.applicableModels!.includes(x)))fail('PLAN_USED_SUITABILITY_INVALID');
  const nf=qty(i.newFree),uf=qty(i.usedFree),nh=qty(i.newOnHand),uh=qty(i.usedOnHand);
  qty(i.held);qty(i.unknown);
  if((nf!==null&&nh!==null&&nf>nh)||(uf!==null&&uh!==null&&uf>uh))fail('PLAN_FREE_EXCEEDS_ON_HAND');
  if(i.reservations!==null){
   if(!Array.isArray(i.reservations)||!unique(i.reservations.map(x=>x.modelId)))fail('PLAN_DUPLICATE_RESERVATION');
   let nr=ZERO,ur=ZERO;for(const r of i.reservations){
    if(!modelIds.has(r.modelId)||!i.applicableModels?.includes(r.modelId))fail('PLAN_RESERVATION_MODEL_INVALID');
    nr=add(nr,parseQuantity(r.newQuantity));ur=add(ur,parseQuantity(r.usedQuantity));
   }
   if((nh!==null&&nf!==null&&nr>nh-nf)||(uh!==null&&uf!==null&&ur>uh-uf))fail('PLAN_RESERVATION_EXCEEDS_NONFREE');
  }
  if(i.assembly)checkLines(i.assembly.lines);
 }
}
function detail(t:Trial,k:string){let d=t.rows.get(k);if(!d){d={required:ZERO,drawn:ZERO,built:ZERO,protected:ZERO,reserved:ZERO,shortage:ZERO,ignored:ZERO};t.rows.set(k,d);}return d;}
const min=(a:Qty,b:Qty)=>a<b?a:b;
function clonePool(p:Map<string,Pool>){return new Map([...p].map(([k,v])=>[k,{...v}]));}
function emptyTrial(pool:Map<string,Pool>):Trial{return {pool:clonePool(pool),rows:new Map(),issues:new Set(),budget:100000};}
function take(t:Trial,items:Map<string,Material>,line:Line,need:Qty,modelId:string,at:string,
 condition:PlanRequest['condition'],ignored:Set<string>,protect:boolean,reserved:Map<string,Pool>,stack:readonly string[]){
 if(need===0n)return;
 if(--t.budget<0||stack.length>32)fail('PLAN_GRAPH_COMPLEXITY_LIMIT');
 const k=materialKey(line),i=items.get(k),d=detail(t,k);
 if(!i||!i.active||!i.verified||!i.applicableModels?.includes(modelId)){t.issues.add('UNRESOLVED_MATERIAL:'+k);return;}
 if(stack.includes(k)){t.issues.add('BOM_CYCLE:'+k);return;}
 d.required=add(d.required,need);
 if(ignored.has(k)&&!protect){d.ignored=add(d.ignored,need);return;}
 const nf=qty(i.newFree),nh=qty(i.newOnHand),uf=qty(i.usedFree),uh=qty(i.usedOnHand);
 const usedMode=condition==='NEW_AND_ELIGIBLE_USED';
 if(nf===null||nh===null||(usedMode&&(uf===null||uh===null||i.usedEligibleModels===null))){
  t.issues.add('UNRESOLVED_ELIGIBILITY_OR_BALANCE:'+k);return;
 }
 const usedOK=usedMode&&i.usedEligibleModels!.includes(modelId);
 // Reserved stock is NOT free for selected models. Protect-other-model demand
 // credits only its verified already-reserved quantity once, without releasing excess.
 let remain=need;
 if(protect){
  if(i.reservations===null){t.issues.add('UNRESOLVED_RESERVATION:'+k);return;}
  let r=reserved.get(k);
  if(!r){const row=i.reservations.find(x=>x.modelId===modelId);r={new:row?parseQuantity(row.newQuantity):ZERO,used:row?parseQuantity(row.usedQuantity):ZERO};reserved.set(k,r);}
  const u=usedOK?min(remain,r.used):ZERO;r.used-=u;remain-=u;
  const n=min(remain,r.new);r.new-=n;remain-=n;d.reserved=add(d.reserved,u+n);
 }
 const p=t.pool.get(k)!;
 // Consume model-suitable used stock first to preserve more flexible new stock.
 const used=usedOK?min(remain,p.used):ZERO;p.used-=used;remain-=used;
 const fresh=min(remain,p.new);p.new-=fresh;remain-=fresh;
 d.drawn=add(d.drawn,fresh+used);
 if(protect)d.protected=add(d.protected,fresh+used);
 if(remain===0n)return;
 if(i.assembly){
  if(!bomEffective(i.assembly,at)){t.issues.add('UNRESOLVED_SFG_BOM:'+k);return;}
  const before=t.issues.size,shortBefore=[...t.rows.values()].reduce((n,d)=>n+d.shortage,0n);
  // A buildable assembly's existing free stock is consumed first; only shortage
  // expands into child requirements. Shared children draw from the same pool.
  for(const child of i.assembly.lines){
   const childNeed=multiply(remain,parseQuantity(child.quantity));
   take(t,items,child,childNeed,modelId,at,condition,ignored,protect,reserved,[...stack,k]);
  }
  if(t.issues.size===before&&[...t.rows.values()].reduce((n,row)=>n+row.shortage,0n)===shortBefore)d.built=add(d.built,remain);
  else d.shortage=add(d.shortage,remain);
 }else d.shortage=add(d.shortage,remain);
}
function evaluate(pool:Map<string,Pool>,model:Model,n:Qty,items:Map<string,Material>,snapshot:Snapshot,
 request:PlanRequest,ignore:Set<string>,protect=false):Trial{
 const t=emptyTrial(pool);
 if(!model.active||!bomEffective(model.bom,snapshot.asOf)){t.issues.add('UNRESOLVED_BOM:'+model.id);return t;}
 const reserved=new Map<string,Pool>();
 for(const l of model.bom.lines)take(t,items,l,multiply(n*MICRO,parseQuantity(l.quantity)),model.id,snapshot.asOf,
 request.condition,ignore,protect,reserved,[]);
 return t;
}
function feasible(t:Trial){return !t.issues.size&&[...t.rows.values()].every(d=>d.shortage===ZERO);}
function hasAssessed(t:Trial){return [...t.rows.values()].some(d=>d.required>d.ignored);}
function capacity(pool:Map<string,Pool>,model:Model,cap:number|null,items:Map<string,Material>,s:Snapshot,r:PlanRequest,ignore:Set<string>){
 const one=evaluate(pool,model,1n,items,s,r,ignore);
 if(one.issues.size||!hasAssessed(one))return {count:null,trial:one,limiting:one,reason:one.issues.size?'UNRESOLVED_INPUT':'NO_ASSESSED_REQUIREMENTS'};
 if(cap===0)return {count:0n,trial:evaluate(pool,model,0n,items,s,r,ignore),limiting:one,reason:null};
 // Monotone feasibility under deterministic stock-first nested BOM draw.
 // An enormous or precision-invalid evaluation is never treated as reliable.
 let low=0n,high=1n;const ceiling=cap===null?BigInt(Number.MAX_SAFE_INTEGER):whole(cap);
 while(high<ceiling&&feasible(evaluate(pool,model,high,items,s,r,ignore))){
  low=high;high=min(high*2n,ceiling);
 }
 let upper=evaluate(pool,model,high,items,s,r,ignore);
 if(upper.issues.size)return {count:null,trial:upper,limiting:upper,reason:'UNRESOLVED_INPUT'};
 if(feasible(upper)){
  if(cap===null)return {count:null,trial:upper,limiting:upper,reason:'UNBOUNDED_OR_RANGE_EXCEEDED'};
  return {count:high,trial:upper,limiting:upper,reason:null};
 }
 while(high-low>1n){
  const mid=(low+high)/2n,probe=evaluate(pool,model,mid,items,s,r,ignore);
  if(probe.issues.size)return {count:null,trial:probe,limiting:probe,reason:'UNRESOLVED_INPUT'};
  if(feasible(probe))low=mid;else high=mid;
 }
 const done=evaluate(pool,model,low,items,s,r,ignore);
 upper=evaluate(pool,model,high,items,s,r,ignore);
 return {count:low,trial:done,limiting:upper,reason:null};
}
function mergeRows(into:Map<string,Detail>,from:Map<string,Detail>){
 for(const [k,v] of from){const d=into.get(k);if(!d){into.set(k,{...v});continue;}
  for(const field of Object.keys(d) as (keyof Detail)[])d[field]=add(d[field],v[field]);}
}
function renderRows(rows:Map<string,Detail>,items:Map<string,Material>,pool:Map<string,Pool>){
 return [...rows].sort(([a],[b])=>a.localeCompare(b)).map(([key,d])=>{
  const i=items.get(key),p=pool.get(key);
  return {key,itemCode:i?.itemCode??null,productVersion:i?.productVersion??null,uom:i?.uom??null,name:i?.name??'Unmapped material',
   applicableModels:i?.applicableModels??null,newOnHand:i?.newOnHand??null,usedOnHand:i?.usedOnHand??null,held:i?.held??null,unknown:i?.unknown??null,
   eligibleNewFree:i?.newFree??null,usedFreeBeforeSuitability:i?.usedFree??null,remainingNew:p&&i?.newFree!==null?formatQuantity(p.new):null,
   remainingUsedBeforeSuitability:p&&i?.usedFree!==null?formatQuantity(p.used):null,
   ...Object.fromEntries(Object.entries(d).map(([f,v])=>[f,formatQuantity(v)])) as Record<keyof Detail,string>};
 });
}
/** No source fallback. Caller must resolve a verified, complete, authorized scope first. */
function calculatePlan(s:Snapshot,r:PlanRequest){
 validateSnapshot(s);
 if(!sameScope(s.scope,r.scope))fail('PLAN_SCOPE_MISMATCH');
 if(!['NEW_ONLY','NEW_AND_ELIGIBLE_USED'].includes(r.condition)||!['FULL','CORE'].includes(r.mode)||
 !Array.isArray(r.priorities)||!Array.isArray(r.protect)||!Array.isArray(r.ignore))fail('PLAN_REQUEST_INVALID');
 if(!r.priorities.length||r.priorities.length>100||r.protect.length>100||r.ignore.length>20000||
 !unique([...r.priorities.map(x=>x.modelId),...r.protect.map(x=>x.modelId)]))fail('PLAN_PRIORITY_OR_PROTECT_CONFLICT');
 const models=new Map(s.models.map(m=>[m.id,m])),items=new Map(s.items.map(i=>[materialKey(i),i]));
 for(const x of r.priorities){if(!models.has(x.modelId))fail('PLAN_MODEL_NOT_MAPPED');if(x.cap!==null)whole(x.cap);}
 for(const x of r.protect){if(!models.has(x.modelId))fail('PLAN_MODEL_NOT_MAPPED');whole(x.quantity);}
 const ignore=new Set(r.ignore.map(materialKey));
 if(ignore.size!==r.ignore.length||(r.mode==='FULL'&&ignore.size))fail('PLAN_IGNORE_INVALID');
 for(const x of r.ignore){checkRef(x);const i=items.get(materialKey(x));if(!i?.verified||!i.applicableModels||i.applicableModels.length<2)fail('PLAN_IGNORE_NOT_VERIFIED_COMMON');}
 if(r.mode==='CORE'&&!ignore.size)fail('PLAN_CORE_IGNORE_SELECTION_REQUIRED');
 const pool=new Map(s.items.map(i=>[materialKey(i),{new:qty(i.newFree)??ZERO,used:qty(i.usedFree)??ZERO}]));
 const issues=new Set<string>(),protectedRows=new Map<string,Detail>();
 let working=pool;
 if(!s.complete)issues.add('AUTHORIZED_SNAPSHOT_INCOMPLETE');
 // Protect demand is an additional what-if, never counted in selected allocation.
 // The explicit ordered protect list is a user-provided priority.
 for(const p of r.protect){
  const t=evaluate(working,models.get(p.modelId)!,whole(p.quantity),items,s,r,new Set(),true);
  working=t.pool;mergeRows(protectedRows,t.rows);t.issues.forEach(i=>issues.add(i));
 }
 const afterProtect=clonePool(working),requiredRows=new Map<string,Detail>();
 let requiredPool=clonePool(afterProtect);
 for(const p of r.priorities){
  try{const t=evaluate(requiredPool,models.get(p.modelId)!,whole(p.cap??1),items,s,r,ignore);requiredPool=t.pool;mergeRows(requiredRows,t.rows);t.issues.forEach(i=>issues.add(i));}
  catch(e){issues.add(e instanceof Error?e.message:'PLAN_REQUIREMENT_FAILED');}
 }
 const allocations:{modelId:string;name:string;independent:number|null;allocated:number|null;reason:string|null;bindingItems:ReturnType<typeof renderRows>}[]=[],rows=new Map<string,Detail>();
 let total=ZERO;
 for(const p of r.priorities){
  const model=models.get(p.modelId)!;
  let independent:ReturnType<typeof capacity>,combined:ReturnType<typeof capacity>;
  try{
   independent=capacity(afterProtect,model,null,items,s,r,ignore);
   combined=capacity(working,model,p.cap,items,s,r,ignore);
  }catch(e){issues.add(e instanceof Error?e.message:'PLAN_EVALUATION_FAILED');allocations.push({modelId:model.id,name:model.name,independent:null,allocated:null,reason:'UNRESOLVED_INPUT',bindingItems:[]});continue;}
  if(independent.count===null){independent.trial.issues.forEach(i=>issues.add(i));issues.add(independent.reason??'UNRESOLVED_INPUT');}
  if(combined.count===null){combined.trial.issues.forEach(i=>issues.add(i));issues.add(combined.reason??'UNRESOLVED_INPUT');}
  else{working=combined.trial.pool;total+=combined.count;mergeRows(rows,combined.trial.rows);}
  allocations.push({modelId:model.id,name:model.name,independent:independent.count===null?null:Number(independent.count),
   allocated:combined.count===null?null:Number(combined.count),reason:combined.reason,
   bindingItems:renderRows(new Map([...combined.limiting.rows].filter(([,d])=>d.shortage>ZERO)),items,combined.limiting.pool)});
 }
 const reliable=!issues.size&&total<=BigInt(Number.MAX_SAFE_INTEGER);
 return {state:reliable?'ASSESSED' as const:'NOT_ASSESSABLE' as const,mode:r.mode,
  label:r.mode==='CORE'?'Conditional core build potential':'Full material-supported build plan',
  objective:'Priority order: maximize each model before the next',scope:s.scope,asOf:s.asOf,sourceEpoch:s.sourceEpoch,provenance:s.provenance,
  combinedTotal:reliable?Number(total):null,models:reliable?allocations:allocations.map(a=>({...a,allocated:null,independent:null})),
  issues:[...issues].sort(),materials:renderRows(rows,items,working),requirements:renderRows(requiredRows,items,requiredPool),protectedMaterials:renderRows(protectedRows,items,afterProtect),
  ignoredItems:r.ignore,advice:'Read-only what-if; independent capacities overlap. Not a reservation, manufacturing or quality approval.'};
}
export function buildPlan(s:Snapshot,r:PlanRequest){
 const result=calculatePlan(s,r);
 const full=r.mode==='CORE'?calculatePlan(s,{...r,mode:'FULL',ignore:[]}):result;
 return {...result,fullComparison:{combinedTotal:full.combinedTotal,models:full.models.map(m=>({modelId:m.modelId,allocated:m.allocated})),state:full.state}};
}
export type BuildResult=ReturnType<typeof buildPlan>;

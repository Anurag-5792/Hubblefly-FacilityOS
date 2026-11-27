/** HF098: approved, effective BOM demand independent of any stock admission.
 * Gross SFG explosion assumes all assemblies must be built; it is neither a
 * net shortage nor buildable capacity. Existing full stock planner unchanged.
 */
import {formatQuantity} from '../domain/quantity.ts';
import {sameScope,type Scope} from '../roles/role-assignment.ts';
const MAX=9223372036854775807n,MICRO=1000000n;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hex=/^[0-9a-f]{64}$/;
const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const fail=(code:string):never=>{throw Error(code)};
const obj=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:fail('MIS_SOURCE_OBJECT_REQUIRED');
const str=(x:unknown,max=160):string=>typeof x==='string'&&x.trim().length>0&&x.length<=max?x:fail('MIS_SOURCE_TEXT_INVALID');
const matched=(x:unknown,r:RegExp)=>{const s=str(x,128);return r.test(s)?s:fail('MIS_SOURCE_ID_INVALID')};
const digest=(x:unknown)=>{const s=matched(x,hex);return s==='0'.repeat(64)?fail('MIS_SOURCE_EVIDENCE_INVALID'):s};
const timestamp=(x:unknown)=>{const s=str(x,64);return Number.isFinite(Date.parse(s))?s:fail('MIS_SOURCE_TIME_INVALID')};
const array=(x:unknown,max:number):unknown[]=>Array.isArray(x)&&x.length<=max?x:fail('MIS_SOURCE_CENSUS_LIMIT');
const exact=(x:Record<string,unknown>,keys:readonly string[])=>{if(Object.keys(x).length!==keys.length||keys.some(k=>!Object.hasOwn(x,k)))fail('MIS_SOURCE_FIELDS_INVALID')};
const positive=(v:unknown)=>{if(typeof v!=='string'||!/^[1-9]\d{0,18}$/.test(v))fail('MIS_SOURCE_QUANTITY_INVALID');const n=BigInt(v as string);return n<=MAX?n:fail('MIS_SOURCE_QUANTITY_OVERFLOW')};
const key=(l:{itemCode:string;productVersion:string;uom:string})=>JSON.stringify([l.itemCode,l.productVersion,l.uom]);
const plus=(a:bigint,b:bigint)=>a+b<=MAX?a+b:fail('MIS_REQUIREMENT_OVERFLOW');
function times(a:bigint,b:bigint){const n=a*b;if(n%MICRO!==0n||n/MICRO>MAX)fail('MIS_REQUIREMENT_PRECISION_OR_RANGE');return n/MICRO;}
export type ScopeName={companyName:string;siteName:string;warehouseName:string};
export type EffectiveModel={id:string;name:string;variant:string;revisionId:string;revision:number;evidenceSha256:string;effectiveFrom:string;effectiveTo:string|null};
export type RequirementsCatalog={state:'CATALOG';scope:Scope;scopeName:ScopeName;asOf:string;models:EffectiveModel[];sourceEpoch:string;stockAdmitted:false};
export type RequirementsRow={itemCode:string;productVersion:string;uom:string;required:string;available:null;shortage:null;childRevisionId:string|null};
export type RequirementsResult={state:'REQUIREMENTS_VERIFIED';scope:Scope;scopeName:ScopeName;asOf:string;sourceEpoch:string;
 model:EffectiveModel;units:number;direct:RequirementsRow[];grossLeaf:RequirementsRow[];assemblies:RequirementsRow[];
 capacity:null;coverage:null;stockAdmitted:false;readiness:'NOT_ASSESSABLE';label:string};
type Line={itemCode:string;productVersion:string;uom:string;quantity:bigint;childRevisionId:string|null};
type Node={revisionId:string;bomId:string;kind:'DRONE'|'SFG';itemCode:string|null;versionCode:string|null;evidenceSha256:string;lines:Line[]};
function source(raw:unknown,scope:Scope,mode:'CATALOG'|'REQUIREMENTS_SOURCE'){
 const x=obj(raw);exact(x,['state','scope','scopeName','asOf','models','rootRevisionId','nodes','stockAdmitted','sourceEpoch']);
 const actual=obj(x.scope);exact(actual,['legalEntityId','siteId','warehouseId']);
 const s={legalEntityId:matched(actual.legalEntityId,id),siteId:matched(actual.siteId,id),warehouseId:matched(actual.warehouseId,id)};
 if(x.state!==mode||x.stockAdmitted!==false||!sameScope(s,scope))fail('MIS_SOURCE_SCOPE_OR_MODE_DENIED');
 const sn=obj(x.scopeName);exact(sn,['companyName','siteName','warehouseName']);
 const scopeName={companyName:str(sn.companyName),siteName:str(sn.siteName),warehouseName:str(sn.warehouseName)};
 const asOf=timestamp(x.asOf),sourceEpoch=digest(x.sourceEpoch);
 const models=array(x.models,100).map(m=>{
  const v=obj(m);exact(v,['id','name','variant','revisionId','revision','evidenceSha256','effectiveFrom','effectiveTo']);
  const from=timestamp(v.effectiveFrom),to=v.effectiveTo===null?null:timestamp(v.effectiveTo);
  if(!Number.isSafeInteger(v.revision)||(v.revision as number)<1||Date.parse(from)>Date.parse(asOf)||(to!==null&&(Date.parse(to)<=Date.parse(asOf)||Date.parse(to)<=Date.parse(from))))fail('MIS_MODEL_NOT_EFFECTIVE');
  return {id:matched(v.id,uuid),name:str(v.name),variant:str(v.variant),revisionId:matched(v.revisionId,uuid),revision:v.revision as number,
   evidenceSha256:digest(v.evidenceSha256),effectiveFrom:from,effectiveTo:to};
 });
 if(new Set(models.map(m=>m.id)).size!==models.length||new Set(models.map(m=>m.revisionId)).size!==models.length)fail('MIS_MODEL_CENSUS_DUPLICATE');
 return {scope:s,scopeName,asOf,sourceEpoch,models,x};
}
export function parseRequirementsCatalog(raw:unknown,scope:Scope):RequirementsCatalog{
 const v=source(raw,scope,'CATALOG');
 if(v.x.rootRevisionId!==null||v.x.nodes!==null)fail('MIS_CATALOG_UNEXPECTED_GRAPH');
 return {state:'CATALOG',scope:v.scope,scopeName:v.scopeName,asOf:v.asOf,sourceEpoch:v.sourceEpoch,models:v.models,stockAdmitted:false};
}
export function calculateRequirements(raw:unknown,scope:Scope,modelId:string,units:number):RequirementsResult{
 if(!Number.isSafeInteger(units)||units<1||units>100000)fail('MIS_BUILD_UNITS_INVALID');
 const v=source(raw,scope,'REQUIREMENTS_SOURCE'),model=v.models.find(m=>m.id===modelId);
 if(!model||model.revisionId!==v.x.rootRevisionId)throw Error('MIS_MODEL_REVISION_DENIED');
 const nodes=new Map<string,Node>();let lineCount=0;
 for(const n of array(v.x.nodes,2000)){
  const x=obj(n);exact(x,['revisionId','bomId','kind','itemCode','versionCode','evidenceSha256','verified','lines']);
  if(x.verified!==true||!['DRONE','SFG'].includes(x.kind as string))fail('MIS_GRAPH_NODE_UNVERIFIED');
  const k=matched(x.revisionId,uuid);if(nodes.has(k))fail('MIS_DUPLICATE_GRAPH_REVISION');
  const kind=x.kind as Node['kind'];
  const itemCode=kind==='SFG'?matched(x.itemCode,id):null,versionCode=kind==='SFG'?matched(x.versionCode,id):null;
  if(kind==='DRONE'&&(x.itemCode!==null||x.versionCode!==null))fail('MIS_GRAPH_ROOT_INVALID');
  const lines=array(x.lines,2000).map(l=>{
   const a=obj(l);exact(a,['itemCode','productVersion','uom','quantityMicro','childRevisionId','verified']);
   if(a.verified!==true)fail('MIS_GRAPH_LINE_UNVERIFIED');
   return {itemCode:matched(a.itemCode,id),productVersion:matched(a.productVersion,id),uom:matched(a.uom,id),
    quantity:positive(a.quantityMicro),childRevisionId:a.childRevisionId===null?null:matched(a.childRevisionId,uuid)};
  });
  lineCount+=lines.length;
  if(!lines.length||lineCount>10000||new Set(lines.map(key)).size!==lines.length)fail('MIS_GRAPH_LINE_CENSUS_INVALID');
  nodes.set(k,{revisionId:k,bomId:matched(x.bomId,uuid),kind,itemCode,versionCode,evidenceSha256:digest(x.evidenceSha256),lines});
 }
 const root=nodes.get(model.revisionId);
 if(!root||root.kind!=='DRONE'||root.evidenceSha256!==model.evidenceSha256)throw Error('MIS_APPROVED_ROOT_MISMATCH');
 type Agg={line:Line;quantity:bigint};
 const direct=new Map<string,Agg>(),leaves=new Map<string,Agg>(),assemblies=new Map<string,Agg>();
 const visited=new Set<string>();let budget=100000;
 function accumulate(map:Map<string,Agg>,l:Line,q:bigint){
  const k=key(l),a=map.get(k);
  if(a&&a.line.childRevisionId!==l.childRevisionId)fail('MIS_CONFLICTING_SFG_REVISION');
  map.set(k,{line:l,quantity:a?plus(a.quantity,q):q});
 }
 function walk(n:Node,count:bigint,chain:readonly string[]){
  if(chain.includes(n.bomId)||chain.length>=32||--budget<0)fail('MIS_BOM_CYCLE_OR_COMPLEXITY');
  visited.add(n.revisionId);
  for(const l of n.lines){
   if(--budget<0)fail('MIS_BOM_CYCLE_OR_COMPLEXITY');
   const q=times(count,l.quantity);
   if(!chain.length)accumulate(direct,l,q);
   if(l.childRevisionId){
    const child=nodes.get(l.childRevisionId);
    if(!child||child.kind!=='SFG'||child.itemCode!==l.itemCode||child.versionCode!==l.productVersion)throw Error('MIS_SFG_REFERENCE_MISMATCH');
    accumulate(assemblies,l,q);walk(child,q,[...chain,n.bomId]);
   }else accumulate(leaves,l,q);
  }
 }
 walk(root,BigInt(units)*MICRO,[]);
 if(visited.size!==nodes.size)fail('MIS_GRAPH_UNREACHABLE_NODE');
 const rows=(m:Map<string,Agg>):RequirementsRow[]=>[...m].sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>({itemCode:v.line.itemCode,productVersion:v.line.productVersion,uom:v.line.uom,
  required:formatQuantity(v.quantity),available:null,shortage:null,childRevisionId:v.line.childRevisionId}));
 return {state:'REQUIREMENTS_VERIFIED',scope:v.scope,scopeName:v.scopeName,asOf:v.asOf,sourceEpoch:v.sourceEpoch,model,units,
  direct:rows(direct),grossLeaf:rows(leaves),assemblies:rows(assemblies),capacity:null,coverage:null,stockAdmitted:false,
  readiness:'NOT_ASSESSABLE',label:'Approved BOM gross requirements; eligible stock, shortages and build capacity are not assessed.'};
}

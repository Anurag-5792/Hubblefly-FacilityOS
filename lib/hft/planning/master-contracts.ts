/** Issue 19 engineering contract only. No new live identifier namespace,
 * role grant or persistence is created here. All authority and canonical
 * identity references must come from admitted server-side adapters.
 */
import {parseQuantity} from '../domain/quantity.ts';
import {sameScope,type Scope,type Principal} from '../roles/role-assignment.ts';
import {materialKey,type ItemRef,type Line} from './build-plan.ts';
export type CanonicalItem=Readonly<ItemRef&{scope:Scope;active:boolean;approvedVersion:boolean;categoryId:string;
 name:string;aliases:readonly string[];manufacturer:string|null;partNumber:string|null}>;
export type Category=Readonly<{id:string;label:string;active:boolean;verified:boolean}>;
export type Classification=Readonly<{state:'EXISTING_MATCH'|'SUGGEST_CATEGORY'|'CONFLICT'|'NEEDS_SELECTION';itemCode:string|null;categoryId:string|null;evidence:readonly string[]}>;
const normal=(s:string)=>s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const reject=(s:string):never=>{throw Error(s)};
/** Exact manufacturer/part, known code/alias and description evidence; never
 * assigns a code or category on similarity alone. Conflicts require review. */
export function classifyItem(input:{codeOrAlias:string;name:string;manufacturer:string;partNumber:string},
 items:readonly CanonicalItem[],categories:readonly Category[],scope:Scope):Classification{
 const rows=items.filter(x=>sameScope(x.scope,scope));
 const allowed=new Set(categories.filter(c=>c.active&&c.verified).map(c=>c.id));
 const query=normal(input.codeOrAlias),name=normal(input.name),manufacturer=normal(input.manufacturer),part=normal(input.partNumber);
 const hits=rows.filter(i=>(query&&[i.itemCode,...i.aliases].some(a=>normal(a)===query))||
  (manufacturer&&part&&i.manufacturer!==null&&i.partNumber!==null&&normal(i.manufacturer)===manufacturer&&normal(i.partNumber)===part));
 const identities=[...new Set(hits.map(i=>i.itemCode))],cats=[...new Set(hits.map(i=>i.categoryId))];
 if(identities.length>1||cats.length>1)return {state:'CONFLICT',itemCode:null,categoryId:null,evidence:['Conflicting canonical identity matches']};
 if(identities.length===1)return {state:'EXISTING_MATCH',itemCode:identities[0],categoryId:allowed.has(cats[0])?cats[0]:null,evidence:['Exact canonical code, alias or manufacturer/part match; do not issue a duplicate']};
 const descriptions=rows.filter(i=>i.active&&name&&normal(i.name)===name),descriptionCats=[...new Set(descriptions.map(i=>i.categoryId))];
 if(descriptionCats.length>1)return {state:'CONFLICT',itemCode:null,categoryId:null,evidence:['Description matches multiple governed categories']};
 if(descriptionCats.length===1&&allowed.has(descriptionCats[0]))return {state:'SUGGEST_CATEGORY',itemCode:null,categoryId:descriptionCats[0],evidence:['Exact normalized description; authorized confirmation required','Review possible duplicate identities before numbering']};
 return {state:'NEEDS_SELECTION',itemCode:null,categoryId:null,evidence:['No verified deterministic category match']};
}
export type DroneModel=Readonly<{scope:Scope;modelId:string;variantId:string;name:string;active:boolean;revision:number}>;
export type Revision=Readonly<{scope:Scope;subjectId:string;revisionId:string;priorRevisionId:string|null;revision:number;
 state:'DRAFT'|'APPROVED'|'RETIRED';effectiveFrom:string|null;effectiveTo:string|null;
 applicableModelIds:readonly string[];lines:readonly Line[]}>;
export type Sfg=Readonly<ItemRef&{scope:Scope;active:boolean;applicableModelIds:readonly string[];bom:Revision}>;
export type MasterAction='DRONE_CREATE'|'DRONE_REVISE'|'BOM_CREATE'|'BOM_REVISE'|'BOM_APPROVE'|'BOM_RETIRE'|'SFG_CREATE'|'SFG_REVISE'|'CATEGORY_CONFIRM'|'NUMBER_ISSUE';
export type MasterAuthority=Readonly<{principal:Principal;scope:Scope;actions:readonly MasterAction[]}>;
/** Authority must be returned by the admitted current scoped authorization
 * service. Never build from browser fields or infer from email/domain/role name. */
export function requireMasterAction(authority:MasterAuthority,scope:Scope,action:MasterAction,now=Date.now()){
 if(!sameScope(authority.scope,scope)||!authority.principal.scopes.some(s=>sameScope(s,scope))||
  !authority.principal.subject||!authority.principal.employeeId||!authority.principal.personId||
  authority.principal.expiresAt<=now/1000||!authority.actions.includes(action))reject('PLANNING_MASTER_ACTION_DENIED');
}
export function validateDroneModel(m:DroneModel){
 if(!m.modelId||!m.variantId||!m.name.trim()||!Number.isSafeInteger(m.revision)||m.revision<1)reject('DRONE_MODEL_INVALID');
}
export function validateRevision(r:Revision,models:readonly DroneModel[],items:readonly CanonicalItem[],assemblies:readonly Sfg[]){
 if(!r.subjectId||!r.revisionId||!Number.isSafeInteger(r.revision)||r.revision<1||
 !r.applicableModelIds.length||new Set(r.applicableModelIds).size!==r.applicableModelIds.length||
 r.applicableModelIds.some(id=>!models.some(m=>m.active&&sameScope(m.scope,r.scope)&&m.modelId===id)))reject('BOM_MODEL_APPLICABILITY_UNRESOLVED');
 const known=new Map(items.filter(i=>sameScope(i.scope,r.scope)).map(i=>[materialKey(i),i]));
 if(known.size!==items.filter(i=>sameScope(i.scope,r.scope)).length)reject('BOM_CANONICAL_IDENTITY_DUPLICATE');
 const scopedAssemblies=assemblies.filter(i=>sameScope(i.scope,r.scope));
 const nested=new Map(scopedAssemblies.map(i=>[materialKey(i),i]));
 if(nested.size!==scopedAssemblies.length)reject('BOM_SFG_IDENTITY_DUPLICATE');
 const seen=new Set<string>();let visits=0;
 function walk(rev:Revision,chain:readonly string[]){
  if(chain.length>32||++visits>100000||!rev.lines.length||rev.lines.length>2000||
   new Set(rev.lines.map(materialKey)).size!==rev.lines.length)reject('BOM_DUPLICATE_OR_COMPLEXITY_LIMIT');
  for(const l of rev.lines){
   if(parseQuantity(l.quantity)<=0n)reject('BOM_QUANTITY_INVALID');
   const k=materialKey(l),item=known.get(k);if(!item||!item.active||!item.approvedVersion)reject('BOM_CANONICAL_VERSION_OR_UOM_UNRESOLVED');
   const child=nested.get(k);
   if(child){
    if(chain.includes(k)||!child.active||!sameScope(child.bom.scope,r.scope)||r.applicableModelIds.some(id=>!child.applicableModelIds.includes(id)||!child.bom.applicableModelIds.includes(id)))reject('BOM_SFG_CYCLE_OR_APPLICABILITY_DENIED');
    if(!seen.has(k)){walk(child.bom,[...chain,k]);seen.add(k);}
   }
  }
 }
 if(r.state==='APPROVED'&&(!r.effectiveFrom||!Number.isFinite(Date.parse(r.effectiveFrom))||(r.effectiveTo!==null&&Date.parse(r.effectiveTo)<=Date.parse(r.effectiveFrom))))reject('BOM_EFFECTIVE_INTERVAL_INVALID');
 walk(r,[]);
}
/** Create a new draft revision; prior approved history is immutable. The ID
 * must already have been issued by the admitted server numbering authority. */
export function createRevisionDraft(previous:Revision,newRevisionId:string,authority:MasterAuthority):Revision{
 requireMasterAction(authority,previous.scope,'BOM_REVISE');
 if(previous.state!=='APPROVED'||!newRevisionId||newRevisionId===previous.revisionId||!Number.isSafeInteger(previous.revision+1))reject('BOM_NEW_REVISION_REQUIRED');
 return {...previous,revisionId:newRevisionId,priorRevisionId:previous.revisionId,revision:previous.revision+1,state:'DRAFT',effectiveFrom:null,effectiveTo:null,lines:previous.lines.map(l=>({...l})),applicableModelIds:[...previous.applicableModelIds]};
}
export type NumberingPolicy=Readonly<{scope:Scope;categoryId:string;namespace:string;policyRevision:string;evidenceSha256:string;approved:boolean}>;
export type IssueInput=Readonly<{scope:Scope;categoryId:string;requestId:string;description:string;policyRevision:string}>;
export type IssuedIdentity=Readonly<{requestId:string;categoryId:string;itemCode:string;policyRevision:string;auditDigest:string}>;
/** A canonical adapter must implement a single locked transaction: recheck
 * category/policy/authority/duplicate identity, return original same-request
 * result, atomically issue unique number + audit, then independent readback.
 * No MAX+1, client prefix, reuse, retry-on-unknown, or fallback allocator. */
export interface GovernedNumberingPort {
 approvedPolicy(scope:Scope,categoryId:string):Promise<NumberingPolicy|null>;
 issueAndReadback(input:IssueInput,policy:NumberingPolicy,actor:Principal):Promise<IssuedIdentity>;
}
export async function issueGovernedIdentity(input:IssueInput,authority:MasterAuthority,port:GovernedNumberingPort){
 requireMasterAction(authority,input.scope,'NUMBER_ISSUE');requireMasterAction(authority,input.scope,'CATEGORY_CONFIRM');
 if(!input.description.trim()||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.requestId))reject('NUMBERING_INPUT_INVALID');
 const policy=await port.approvedPolicy(input.scope,input.categoryId);
 if(!policy||policy.approved!==true||!sameScope(policy.scope,input.scope)||policy.categoryId!==input.categoryId||
  policy.policyRevision!==input.policyRevision||!policy.namespace||!/^[0-9a-f]{64}$/.test(policy.evidenceSha256))throw Error('NUMBERING_POLICY_NOT_ADMITTED');
 requireMasterAction(authority,input.scope,'NUMBER_ISSUE');
 const result=await port.issueAndReadback(input,policy,authority.principal);
 if(result.requestId!==input.requestId||result.categoryId!==input.categoryId||result.policyRevision!==input.policyRevision||
 !result.itemCode||!/^[0-9a-f]{64}$/.test(result.auditDigest))reject('NUMBERING_READBACK_UNCONFIRMED_NO_RETRY');
 return result;
}

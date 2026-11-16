/** Independent provisional draft-only domain. No P3 activation or stock fields. */
export const DRAFT_CONTRACT='HFT-R1-DRAFT-077-V1' as const;
export const DRAFT_STATE='DRAFT_NOT_APPROVED' as const;
export type DraftKind='LEGAL_ENTITY'|'SITE'|'EMPLOYEE'|'ITEM'|'SUPPLIER'|
 'WAREHOUSE'|'LOCATION';
export const DRAFT_KINDS:readonly DraftKind[]=[
 'LEGAL_ENTITY','SITE','EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION'
] as const;
export type DraftScope=Readonly<{legalEntityId:string;siteId:string;warehouseId:string}>;
export type DraftSave=Readonly<DraftScope&{
 contractVersion:typeof DRAFT_CONTRACT;intent:'SAVE';operation:'CREATE'|'EDIT';
 kind:DraftKind;recordId:string;expectedRevision:string;
 writeId:string;reason:string;values:Readonly<Record<string,string>>;
}>;
export type DraftRead=Readonly<DraftScope&{
 contractVersion:typeof DRAFT_CONTRACT;intent:'READ';
 kind:DraftKind;search:string;
}>;
export type DraftRecord=Readonly<{
 kind:DraftKind;legal_entity_id:string;site_id:string;warehouse_id:string;
 record_id:string;revision:number;state:typeof DRAFT_STATE;
 values:Readonly<Record<string,string>>;created_by:string;updated_by:string;
 created_at:string;updated_at:string;
}>;
const id=/^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fieldSets:Readonly<Record<DraftKind,readonly string[]>>={
 LEGAL_ENTITY:['legalName'],SITE:['siteName'],
 EMPLOYEE:['fullName','department','designation','siteId'],
 ITEM:['uom','controlType'],SUPPLIER:['legalName'],
 WAREHOUSE:['name','siteId'],LOCATION:['parentLocationId']
};
export function isDraftKind(x:unknown):x is DraftKind{
 return typeof x==='string'&&DRAFT_KINDS.some(k=>k===x);
}
function obj(x:unknown):Record<string,unknown>{
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('DRAFT077_OBJECT_REQUIRED');
 return x as Record<string,unknown>;
}
function keys(x:Record<string,unknown>,names:readonly string[]){
 if(Object.keys(x).length!==names.length||names.some(k=>!Object.hasOwn(x,k)))
  throw Error('DRAFT077_EXACT_FIELDS_REQUIRED');
}
function scope(x:Record<string,unknown>):DraftScope{
 const s={legalEntityId:x.legalEntityId,siteId:x.siteId,warehouseId:x.warehouseId};
 if(Object.values(s).some(v=>typeof v!=='string'||!id.test(v)))
  throw Error('DRAFT077_PROVISIONAL_SCOPE_INVALID');
 return s as DraftScope;
}
export function validateDraftSave(raw:unknown):DraftSave{
 const x=obj(raw);
 keys(x,['contractVersion','intent','operation','kind','legalEntityId','siteId',
  'warehouseId','recordId','expectedRevision','writeId','reason','values']);
 if(x.contractVersion!==DRAFT_CONTRACT||x.intent!=='SAVE'||
  !isDraftKind(x.kind)||!['CREATE','EDIT'].includes(String(x.operation))||
  typeof x.recordId!=='string'||!id.test(x.recordId)||
  typeof x.writeId!=='string'||!uuid.test(x.writeId)||
  typeof x.expectedRevision!=='string'||
  !/^(0|[1-9][0-9]{0,12})$/.test(x.expectedRevision)||
  (x.operation==='CREATE'&&x.expectedRevision!=='0')||
  (x.operation==='EDIT'&&x.expectedRevision==='0')||
  typeof x.reason!=='string'||x.reason.length<8||x.reason.length>300||
  x.reason.trim()!==x.reason)
  throw Error('DRAFT077_SAVE_CONTRACT_INVALID');
 const s=scope(x),v=obj(x.values),fields=fieldSets[x.kind];
 keys(v,fields);
 for(const name of fields){
  const value=v[name];
  if(typeof value!=='string'||value.length>160||
   value.trim()!==value||/[\u0000-\u001f\u007f]/.test(value)||
   (name!=='parentLocationId'&&value.length===0))
   throw Error('DRAFT077_FIELD_INVALID_'+name);
 }
 if((x.kind==='EMPLOYEE'||x.kind==='WAREHOUSE')&&v.siteId!==s.siteId)
  throw Error('DRAFT077_SITE_FIELD_SCOPE_MISMATCH');
 if(x.kind==='LEGAL_ENTITY'&&x.recordId!==s.legalEntityId)
  throw Error('DRAFT077_ENTITY_ROOT_SCOPE_MISMATCH');
 if(x.kind==='SITE'&&x.recordId!==s.siteId)
  throw Error('DRAFT077_SITE_ROOT_SCOPE_MISMATCH');
 if(x.kind==='ITEM'&&(!id.test(String(v.uom))||
  !['NONE','BATCH','SERIAL'].includes(String(v.controlType))))
  throw Error('DRAFT077_ITEM_FIELD_INVALID');
 if(x.kind==='LOCATION'&&v.parentLocationId!==''&&
  (!id.test(String(v.parentLocationId))||v.parentLocationId===x.recordId))
  throw Error('DRAFT077_LOCATION_PARENT_INVALID');
 return Object.freeze({...s,contractVersion:DRAFT_CONTRACT,intent:'SAVE',
  kind:x.kind,operation:x.operation as DraftSave['operation'],
  recordId:x.recordId,writeId:x.writeId,expectedRevision:x.expectedRevision,
  reason:x.reason,values:Object.freeze(v as Record<string,string>)});
}
export function validateDraftRead(raw:unknown):DraftRead{
 const x=obj(raw);
 keys(x,['contractVersion','intent','kind','legalEntityId','siteId',
  'warehouseId','search']);
 if(x.contractVersion!==DRAFT_CONTRACT||x.intent!=='READ'||
  !isDraftKind(x.kind)||typeof x.search!=='string'||
  x.search.length>64||!/^[A-Za-z0-9 ._-]*$/.test(x.search))
  throw Error('DRAFT077_READ_CONTRACT_INVALID');
 return Object.freeze({...scope(x),contractVersion:DRAFT_CONTRACT,
  intent:'READ',kind:x.kind,search:x.search});
}
export function validateDraftRequest(raw:unknown):DraftSave|DraftRead{
 const x=obj(raw);
 return x.intent==='SAVE'?validateDraftSave(x):validateDraftRead(x);
}
export function assertDraftRecords(raw:unknown,scope:DraftScope,kind:DraftKind):DraftRecord[]{
 const data=obj(raw);
 if(data.state!=='DRAFT_ONLY'||!Array.isArray(data.records)||data.records.length>100)
  throw Error('DRAFT077_DATABASE_READBACK_INVALID');
 const seen=new Set<string>();
 return data.records.map(item=>{
  const r=obj(item);
  if(r.kind!==kind||r.legal_entity_id!==scope.legalEntityId||
   r.site_id!==scope.siteId||r.warehouse_id!==scope.warehouseId||
   typeof r.record_id!=='string'||!id.test(r.record_id)||
   typeof r.revision!=='number'||!Number.isSafeInteger(r.revision)||r.revision<1||
   r.state!==DRAFT_STATE||seen.has(r.record_id)||
   typeof r.created_by!=='string'||typeof r.updated_by!=='string'||
   typeof r.created_at!=='string'||typeof r.updated_at!=='string')
   throw Error('DRAFT077_DATABASE_SCOPE_STATUS_OR_REVISION_DRIFT');
  seen.add(r.record_id);
  const values=obj(r.values),expected=fieldSets[kind];
  keys(values,expected);
  if(Object.values(values).some(v=>typeof v!=='string'))
   throw Error('DRAFT077_DATABASE_VALUES_INVALID');
  return r as DraftRecord;
 });
}

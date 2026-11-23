/** Production R1 master-record contract. Independent of protected P3/stock authority. */
export const LIVE_R1_VERSION='HFT-LIVE-R1-MASTERS-V1' as const;
export const LIVE_KINDS=['EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION','SITE'] as const;
export type LiveKind=typeof LIVE_KINDS[number];
export const LIVE_FIELDS:Readonly<Record<LiveKind,readonly string[]>>={
 EMPLOYEE:['fullName','department','designation'],
 ITEM:['uom','controlType'],SUPPLIER:['legalName'],
 WAREHOUSE:['name'],LOCATION:['parentLocationId'],SITE:['siteName']
};
export type LiveScope=Readonly<{legalEntityId:string;siteId:string;warehouseId:string}>;
export type LiveChange=Readonly<{contractVersion:typeof LIVE_R1_VERSION;intent:'SAVE';
 action:'CREATE'|'UPDATE'|'DELETE';kind:LiveKind;scope:LiveScope;
 recordId:string;expectedRevision:number;requestId:string;reason:string;
 values:Readonly<Record<string,string>>}>;
export type LiveQuery=Readonly<{contractVersion:typeof LIVE_R1_VERSION;
 intent:'GET'|'LIST'|'HISTORY';kind:LiveKind;scope:LiveScope;
 recordId:string;search:string}>;
export type LiveRequest=LiveChange|LiveQuery;
export type LiveRecord=Readonly<{kind:LiveKind;scope:LiveScope;recordId:string;
 revision:number;deleted:boolean;values:Readonly<Record<string,string>>;
 state:'RECORDED_UNAPPROVED';createdBy:string;updatedBy:string;
 createdAt:string;updatedAt:string}>;
const id=/^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function obj(x:unknown):Record<string,unknown>{
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('LIVE_R1_OBJECT_INVALID');
 return x as Record<string,unknown>;
}
function keys(x:Record<string,unknown>,expected:string[]){
 if(Object.keys(x).length!==expected.length||expected.some(k=>!Object.hasOwn(x,k)))
  throw Error('LIVE_R1_FIELDS_INVALID');
}
function identifier(x:unknown):string{
 if(typeof x!=='string'||!id.test(x))throw Error('LIVE_R1_IDENTIFIER_INVALID');
 return x;
}
export function validatedScope(x:unknown):LiveScope{
 const r=obj(x);keys(r,['legalEntityId','siteId','warehouseId']);
 return {legalEntityId:identifier(r.legalEntityId),siteId:identifier(r.siteId),warehouseId:identifier(r.warehouseId)};
}
export function validateLiveRequest(input:unknown):LiveRequest{
 const x=obj(input);
 if(x.contractVersion!==LIVE_R1_VERSION)throw Error('LIVE_R1_VERSION_INVALID');
 if(!LIVE_KINDS.includes(x.kind as LiveKind))throw Error('LIVE_R1_KIND_INVALID');
 const kind=x.kind as LiveKind,scope=validatedScope(x.scope);
 if(x.intent==='SAVE'){
  keys(x,['contractVersion','intent','action','kind','scope','recordId','expectedRevision','requestId','reason','values']);
  if(!['CREATE','UPDATE','DELETE'].includes(String(x.action)))throw Error('LIVE_R1_ACTION_INVALID');
  const action=x.action as LiveChange['action'];
  const recordId=identifier(x.recordId);
  if((kind==='SITE'&&recordId!==scope.siteId)||
    (kind==='WAREHOUSE'&&recordId!==scope.warehouseId))
   throw Error('LIVE_R1_SCOPE_ANCHOR_INVALID');
  if(!Number.isSafeInteger(x.expectedRevision)||(x.expectedRevision as number)<0||
    (action==='CREATE')!==(x.expectedRevision===0))throw Error('LIVE_R1_REVISION_INVALID');
  if(typeof x.requestId!=='string'||!uuid.test(x.requestId))throw Error('LIVE_R1_REQUEST_ID_INVALID');
  if(typeof x.reason!=='string'||x.reason.length<8||x.reason.length>300||x.reason!==x.reason.trim())
   throw Error('LIVE_R1_REASON_INVALID');
  const values=obj(x.values),required=action==='DELETE'?[]:[...LIVE_FIELDS[kind]];
  keys(values,required);
  for(const f of required){
   const v=values[f];
   if(typeof v!=='string'||v.length>160||v!==v.trim()||/[\u0000-\u001f\u007f]/.test(v)||
    (f!=='parentLocationId'&&v.length===0))throw Error('LIVE_R1_VALUE_INVALID');
  }
  if(kind==='ITEM'&&action!=='DELETE'&&(!id.test(String(values.uom))||
    !['NONE','BATCH','SERIAL'].includes(String(values.controlType))))
   throw Error('LIVE_R1_ITEM_INVALID');
  if(kind==='LOCATION'&&action!=='DELETE'&&values.parentLocationId!==''&&
    (!id.test(String(values.parentLocationId))||values.parentLocationId===recordId))
   throw Error('LIVE_R1_LOCATION_PARENT_INVALID');
  return {contractVersion:LIVE_R1_VERSION,intent:'SAVE',action,kind,scope,recordId,
   expectedRevision:x.expectedRevision as number,requestId:x.requestId,reason:x.reason,
   values:values as Record<string,string>};
 }
 keys(x,['contractVersion','intent','kind','scope','recordId','search']);
 if(!['GET','LIST','HISTORY'].includes(String(x.intent)))throw Error('LIVE_R1_INTENT_INVALID');
 if(typeof x.search!=='string'||x.search.length>80||!/^[A-Za-z0-9 ._-]*$/.test(x.search))
  throw Error('LIVE_R1_SEARCH_INVALID');
 if(x.intent!=='LIST'&&(!x.recordId||typeof x.recordId!=='string'||!id.test(x.recordId)))
  throw Error('LIVE_R1_IDENTIFIER_INVALID');
 if(x.intent==='LIST'&&x.recordId!=='')throw Error('LIVE_R1_QUERY_INVALID');
 return {contractVersion:LIVE_R1_VERSION,intent:x.intent as LiveQuery['intent'],kind,scope,
  recordId:x.recordId as string,search:x.search};
}

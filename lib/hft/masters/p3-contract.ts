/** P3 source-only typed master change contract. No operational stock posting. */
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {lengthPrefixedUtf8} from '../security/posting-invocation-proof.ts';
import type {VerifiedRequestOperator} from '../security/verified-request.ts';
import {assertVerifiedRequestOperator} from '../security/verified-request.ts';

export const MASTER_KINDS=['EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION'] as const;
export type MasterKind=typeof MASTER_KINDS[number];
export type MasterAction='CREATE'|'EDIT'|'ACTIVATE'|'DEACTIVATE';
export type MasterIntent='LIST'|'GET'|'REQUESTS'|'REVIEW_QUEUE'|'SUBMIT';
export type MasterScope=Readonly<{legalEntityId:string;siteId:string;warehouseId:string}>;
export type MasterChange=Readonly<MasterScope&{
 contractVersion:'HFT-R1-P3-MASTER-V1';requestId:string;kind:MasterKind;operation:MasterAction;
 recordId:string;expectedVersion:string;reason:string;values:Readonly<Record<string,string>>;
}>;
export type MasterQuery=Readonly<MasterScope&{intent:'LIST'|'GET'|'REQUESTS'|'REVIEW_QUEUE';kind:MasterKind;search:string;recordId?:string}>;
export type MasterRequest=Readonly<{intent:'SUBMIT';change:MasterChange}>|MasterQuery;
export type MasterProof=Readonly<{
 proofVersion:'HFT-R1-P3-MASTER-HMAC-V1';actorSubject:string;sessionId:string;
 payloadSha256:string;issuedAt:string;expiresAt:string;nonce:string;keyVersion:string;macSha256:string;
}>;
const id=/^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const numeric=/^(0|[1-9][0-9]*)$/;
const max=9223372036854775807n;
const fields:Readonly<Record<MasterKind,readonly string[]>>={
 EMPLOYEE:['fullName','department','designation','siteId'],
 ITEM:['uom','controlType'],SUPPLIER:['legalName'],
 WAREHOUSE:['name','siteId'],LOCATION:['parentLocationId']
};
function obj(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('P3_OBJECT_REQUIRED');
 return value as Record<string,unknown>;
}
function exact(x:Record<string,unknown>,names:readonly string[]):void{
 if(Object.keys(x).length!==names.length||names.some(k=>!Object.hasOwn(x,k)))
  throw new Error('P3_UNEXPECTED_OR_MISSING_FIELD');
}
function string(x:unknown,code:string,maxLength=160):string{
 if(typeof x!=='string'||x.length>maxLength||x!==x.trim()||!x.length)
  throw new Error(code);
 return x;
}
function ident(x:unknown,code:string):string{
 if(typeof x!=='string'||!id.test(x))throw new Error(code);
 return x;
}
function scopeOf(input:Record<string,unknown>):MasterScope {
 return {legalEntityId:ident(input.legalEntityId,'P3_ENTITY_INVALID'),
  siteId:ident(input.siteId,'P3_SITE_INVALID'),
  warehouseId:ident(input.warehouseId,'P3_WAREHOUSE_INVALID')};
}
function kindOf(v:unknown):MasterKind{
 if(!MASTER_KINDS.includes(v as MasterKind))throw new Error('P3_KIND_INVALID');
 return v as MasterKind;
}
function checkScope(kind:MasterKind,recordId:string,scope:MasterScope,values:Readonly<Record<string,string>>):void{
 if(kind==='WAREHOUSE' && recordId!==scope.warehouseId)
  throw new Error('P3_WAREHOUSE_ANCHOR_MISMATCH');
 if((kind==='EMPLOYEE'||kind==='WAREHOUSE')&&values.siteId&&values.siteId!==scope.siteId)
  throw new Error('P3_SITE_ANCHOR_MISMATCH');
 if(kind==='LOCATION'&&values.parentLocationId===recordId)
  throw new Error('P3_LOCATION_SELF_PARENT');
}
export function validateMasterChange(input:unknown):MasterChange {
 const o=obj(input);
 exact(o,['contractVersion','requestId','kind','operation','legalEntityId','siteId',
  'warehouseId','recordId','expectedVersion','reason','values']);
 if(o.contractVersion!=='HFT-R1-P3-MASTER-V1')throw new Error('P3_CONTRACT_INVALID');
 if(typeof o.requestId!=='string'||!uuid.test(o.requestId))throw new Error('P3_REQUEST_UUID_INVALID');
 const kind=kindOf(o.kind);
 if(!['CREATE','EDIT','ACTIVATE','DEACTIVATE'].includes(o.operation as string))
  throw new Error('P3_OPERATION_INVALID');
 const operation=o.operation as MasterAction, scope=scopeOf(o);
 const recordId=ident(o.recordId,'P3_RECORD_ID_INVALID');
 if(typeof o.expectedVersion!=='string'||!numeric.test(o.expectedVersion)||
    BigInt(o.expectedVersion)>max)throw new Error('P3_VERSION_INVALID');
 if((operation==='CREATE')!==(o.expectedVersion==='0'))
  throw new Error('P3_EXPECTED_REVISION_REQUIRED');
 const reason=string(o.reason,'P3_REASON_REQUIRED',300);
 if(reason.length<8)throw new Error('P3_REASON_TOO_SHORT');
 const raw=obj(o.values);
 const required=operation==='ACTIVATE'||operation==='DEACTIVATE'?[]:fields[kind];
 exact(raw,required);
 const values:Record<string,string>={};
 for(const name of required){
  const value=raw[name];
  if(name==='parentLocationId'&&value===''){values[name]='';continue;}
  if(name==='siteId'||name==='uom'||name==='parentLocationId')
    values[name]=ident(value,'P3_MASTER_REFERENCE_INVALID');
  else values[name]=string(value,'P3_MASTER_VALUE_INVALID');
 }
 if(kind==='ITEM'&&operation!=='ACTIVATE'&&operation!=='DEACTIVATE'&&
    !['NONE','BATCH','SERIAL'].includes(values.controlType))
  throw new Error('P3_CONTROL_TYPE_INVALID');
 checkScope(kind,recordId,scope,values);
 return Object.freeze({contractVersion:'HFT-R1-P3-MASTER-V1',requestId:o.requestId,
  kind,operation, ...scope,recordId,expectedVersion:o.expectedVersion,reason,
  values:Object.freeze(values)}) as MasterChange;
}
export function validateMasterRequest(input:unknown):MasterRequest{
 const o=obj(input);
 if(o.intent==='SUBMIT'){exact(o,['intent','change']);return {intent:'SUBMIT',change:validateMasterChange(o.change)};}
 if(!['LIST','GET','REQUESTS','REVIEW_QUEUE'].includes(o.intent as string))throw new Error('P3_INTENT_INVALID');
 const intent=o.intent as MasterQuery['intent'];
 const names=intent==='GET'?['intent','kind','legalEntityId','siteId','warehouseId','search','recordId']:
  ['intent','kind','legalEntityId','siteId','warehouseId','search'];
 exact(o,names);const kind=kindOf(o.kind),scope=scopeOf(o);
 const search=o.search;
 if(typeof search!=='string'||search.length>80||!/^[A-Za-z0-9 ._-]*$/.test(search))
  throw new Error('P3_SEARCH_INVALID');
 const recordId=intent==='GET'?ident(o.recordId,'P3_RECORD_ID_INVALID'):undefined;
 if(recordId&&kind==='WAREHOUSE'&&recordId!==scope.warehouseId)
  throw new Error('P3_WAREHOUSE_ANCHOR_MISMATCH');
 return {intent,kind,...scope,search, ...(recordId?{recordId}:{})};
}
export function masterFields(change:MasterChange):readonly string[]{
 const c=validateMasterChange(change);
 return [c.contractVersion,c.requestId,c.kind,c.operation,c.legalEntityId,c.siteId,
  c.warehouseId,c.recordId,c.expectedVersion,c.reason,...Object.values(c.values)];
}
export function masterPayloadSha256(change:MasterChange):string{
 return createHash('sha256').update(lengthPrefixedUtf8(masterFields(change))).digest('hex');
}
/** Only verified short-lived session identity can cause a P3 proof to be issued. */
export function issueMasterProof(change:MasterChange,operator:VerifiedRequestOperator,
 key:Uint8Array,keyVersion:number,at=Math.floor(Date.now()/1000)):MasterProof{
 const actorSubject=assertVerifiedRequestOperator(operator,change);
 if(!(key instanceof Uint8Array)||key.byteLength<32||
   !Number.isSafeInteger(keyVersion)||keyVersion<1||
   !Number.isSafeInteger(at)||at<1)throw new Error('P3_SIGNING_KEY_OR_CLOCK_UNAVAILABLE');
 const base={proofVersion:'HFT-R1-P3-MASTER-HMAC-V1' as const,actorSubject,
  sessionId:operator.sessionId,payloadSha256:masterPayloadSha256(change),
  issuedAt:String(at),expiresAt:String(at+40),nonce:randomBytes(24).toString('hex'),
  keyVersion:String(keyVersion)};
 const macFields=[base.proofVersion,base.actorSubject,base.sessionId,base.payloadSha256,
  base.issuedAt,base.expiresAt,base.nonce,base.keyVersion];
 const macSha256=createHmac('sha256',key).update(lengthPrefixedUtf8(macFields)).digest('hex');
 return Object.freeze({...base,macSha256});
}

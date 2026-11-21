/**
 * P0 Stores nonposting preparation contract.
 * Structural validation does NOT verify the physical location, source document,
 * employee, approval, opening count or database. It cannot change stock.
 * A trusted server must resolve all authoritative references before the sole
 * protected PostgreSQL writer may post any receipt, issue or transfer.
 */
import {parseQuantity,formatQuantity} from '../domain/quantity.ts';

export const P0_KINDS=['IN','OUT','COUNT','TRANSFER'] as const;
export type P0Kind=typeof P0_KINDS[number];
export type P0Scope=Readonly<{legalEntityId:string;siteId:string;warehouseId:string}>;
export type P0Control='NONE'|'BATCH'|'SERIAL';
export type P0Condition='GOOD'|'DAMAGED'|'QUARANTINE';
export type P0Item=Readonly<{
 itemCode:string;productVersion:string;controlType:P0Control;
 quantity:string;uom:string;serialNo:string;batchNo:string;
}>;
export type P0Base=P0Scope&P0Item&Readonly<{
 contractVersion:'HFT-R1-STORES-P0-PREPARE-V1';
 requestId:string;kind:P0Kind;
}>;
export type P0In=P0Base&Readonly<{
 kind:'IN';leafLocationId:string;grnId:string;receiptKey:string;
 supplierId:string;invoiceNumber:string;qcState:'PENDING'|'ACCEPTED'|'REJECTED';qcEvidenceId:string;
}>;
export type P0Out=P0Base&Readonly<{
 kind:'OUT';leafLocationId:string;employeeId:string;workOrderId:string;
 issueDocumentId:string;fragmentId:string;purpose:string;
}>;
export type P0Count=P0Base&Readonly<{
 kind:'COUNT';leafLocationId:string;sessionId:string;stockEpoch:string;
 lineId:string;condition:P0Condition;inventoryState:'LOOSE'|'INSTALLED_WIP'|'QUARANTINE'|'OTHER';
 evidenceId:string;
}>;
export type P0Transfer=P0Base&Readonly<{
 kind:'TRANSFER';sourceLeafId:string;destinationLeafId:string;
 transferDocumentId:string;reason:string;
}>;
export type P0Operation=P0In|P0Out|P0Count|P0Transfer;
export type P0Prepared=Readonly<{
 state:'VALIDATED_NOT_POSTED';kind:P0Kind;requestId:string;
 scope:P0Scope;itemCode:string;productVersion:string;quantity:string;
 sourceLocationId:string;destinationLocationId:string;
 locationVerified:false;businessAuthorityVerified:false;durable:false;stockChanged:false;
 requiredNextStep:'QUALIFIED_AUTHORITY_AND_DATABASE_POSTING'|'QUALIFIED_COUNT_EVIDENCE_PERSISTENCE';
}>;
const scopeKeys=['legalEntityId','siteId','warehouseId'] as const;
const itemKeys=['itemCode','productVersion','controlType','quantity','uom','serialNo','batchNo'] as const;
const baseKeys=['contractVersion','requestId','kind',...scopeKeys,...itemKeys] as const;
const perKind:Readonly<Record<P0Kind,readonly string[]>>={
 IN:['leafLocationId','grnId','receiptKey','supplierId','invoiceNumber','qcState','qcEvidenceId'],
 OUT:['leafLocationId','employeeId','workOrderId','issueDocumentId','fragmentId','purpose'],
 COUNT:['leafLocationId','sessionId','stockEpoch','lineId','condition','inventoryState','evidenceId'],
 TRANSFER:['sourceLeafId','destinationLeafId','transferDocumentId','reason'],
};
const id=/^[A-Z0-9][A-Z0-9._:-]{1,63}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const note=/^[^\x00-\x1f\x7f]{8,240}$/;
function object(v:unknown):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('P0_OBJECT_REQUIRED');
 return v as Record<string,unknown>;
}
function keys(v:Record<string,unknown>,expected:readonly string[]):void{
 if(Object.keys(v).length!==expected.length||expected.some(k=>!Object.hasOwn(v,k)))
  throw new Error('P0_EXACT_KEYS_REQUIRED');
}
function identifier(v:unknown,name:string,optional=false):string{
 if(typeof v!=='string'||(!optional||v!=='')&&!id.test(v))
  throw new Error('P0_'+name+'_INVALID');
 return v;
}
function textValue(v:unknown,name:string):string{
 if(typeof v!=='string'||v!==v.trim()||!note.test(v))
  throw new Error('P0_'+name+'_INVALID');
 return v;
}
function scope(raw:Record<string,unknown>):P0Scope{
 return Object.freeze({legalEntityId:identifier(raw.legalEntityId,'ENTITY'),
  siteId:identifier(raw.siteId,'SITE'),warehouseId:identifier(raw.warehouseId,'WAREHOUSE')});
}
function item(raw:Record<string,unknown>,kind:P0Kind):P0Item{
 const control=raw.controlType;
 if(control!=='NONE'&&control!=='BATCH'&&control!=='SERIAL')
  throw new Error('P0_CONTROL_TYPE_INVALID');
 const serial=identifier(raw.serialNo,'SERIAL',true);
 const batch=identifier(raw.batchNo,'BATCH',true);
 if(control==='SERIAL'&&(!serial||batch))throw new Error('P0_SERIAL_REQUIRED_BATCH_FORBIDDEN');
 if(control==='BATCH'&&(!batch||serial))throw new Error('P0_BATCH_REQUIRED_SERIAL_FORBIDDEN');
 if(control==='NONE'&&(serial||batch))throw new Error('P0_UNEXPECTED_SERIAL_OR_BATCH');
 if(typeof raw.quantity!=='string')throw new Error('P0_QUANTITY_INVALID');
 const micro=parseQuantity(raw.quantity);
 if(kind!=='COUNT'&&micro<=0n)throw new Error('P0_POST_QUANTITY_MUST_BE_POSITIVE');
 if(control==='SERIAL'&&(kind==='COUNT'?micro!==0n&&micro!==1_000_000n:micro!==1_000_000n))
  throw new Error('P0_SERIAL_UNIT_REQUIRED');
 return Object.freeze({itemCode:identifier(raw.itemCode,'ITEM'),
  productVersion:identifier(raw.productVersion,'PRODUCT_VERSION'),controlType:control,
  uom:identifier(raw.uom,'UOM'),quantity:formatQuantity(micro),serialNo:serial,batchNo:batch});
}
/**
 * Authoritative IDs and authentication MUST be verified by separately qualified
 * server/database services. Never derive actor, approval or stock state from this
 * client-controlled input.
 */
export function validateP0Operation(input:unknown):P0Operation{
 const raw=object(input),kind=raw.kind;
 if(!P0_KINDS.includes(kind as P0Kind))throw new Error('P0_KIND_INVALID');
 const selected=kind as P0Kind;
 keys(raw,[...baseKeys,...perKind[selected]]);
 if(raw.contractVersion!=='HFT-R1-STORES-P0-PREPARE-V1')throw new Error('P0_VERSION_INVALID');
 if(typeof raw.requestId!=='string'||!uuid.test(raw.requestId))throw new Error('P0_REQUEST_ID_INVALID');
 const common={contractVersion:'HFT-R1-STORES-P0-PREPARE-V1' as const,requestId:raw.requestId,
  ...scope(raw),...item(raw,selected)};
 if(selected==='IN'){
  if(!['PENDING','ACCEPTED','REJECTED'].includes(raw.qcState as string))throw new Error('P0_QC_STATE_INVALID');
  const qcState=raw.qcState as P0In['qcState'];
  const qcEvidenceId=identifier(raw.qcEvidenceId,'QC_EVIDENCE',true);
  if(qcState==='ACCEPTED'&&!qcEvidenceId)throw new Error('P0_QC_EVIDENCE_REQUIRED');
  if(typeof raw.invoiceNumber!=='string'||raw.invoiceNumber.length<1||raw.invoiceNumber.length>96||
     raw.invoiceNumber!==raw.invoiceNumber.trim()||/[\x00-\x1f]/.test(raw.invoiceNumber))
    throw new Error('P0_INVOICE_INVALID');
  return Object.freeze({...common,kind:selected,leafLocationId:identifier(raw.leafLocationId,'LEAF'),
   grnId:identifier(raw.grnId,'GRN'),receiptKey:identifier(raw.receiptKey,'RECEIPT'),
   supplierId:identifier(raw.supplierId,'SUPPLIER'),invoiceNumber:raw.invoiceNumber,
   qcState,qcEvidenceId});
 }
 if(selected==='OUT'){
  // Work-order-only recipient is not qualified by existing P2 writer: employee
  // identity is currently mandatory, even where a work order is also present.
  return Object.freeze({...common,kind:selected,leafLocationId:identifier(raw.leafLocationId,'LEAF'),
   employeeId:identifier(raw.employeeId,'EMPLOYEE'),workOrderId:identifier(raw.workOrderId,'WORK_ORDER',true),
   issueDocumentId:identifier(raw.issueDocumentId,'ISSUE_DOCUMENT'),
   fragmentId:identifier(raw.fragmentId,'FRAGMENT'),purpose:textValue(raw.purpose,'PURPOSE')});
 }
 if(selected==='COUNT'){
  if(!['GOOD','DAMAGED','QUARANTINE'].includes(raw.condition as string)||
    !['LOOSE','INSTALLED_WIP','QUARANTINE','OTHER'].includes(raw.inventoryState as string))
    throw new Error('P0_COUNT_CLASSIFICATION_INVALID');
  return Object.freeze({...common,kind:selected,leafLocationId:identifier(raw.leafLocationId,'LEAF'),
   sessionId:identifier(raw.sessionId,'COUNT_SESSION'),stockEpoch:identifier(raw.stockEpoch,'EPOCH'),
   lineId:identifier(raw.lineId,'COUNT_LINE'),condition:raw.condition as P0Condition,
   inventoryState:raw.inventoryState as P0Count['inventoryState'],evidenceId:identifier(raw.evidenceId,'COUNT_EVIDENCE')});
 }
 const from=identifier(raw.sourceLeafId,'SOURCE_LEAF'),to=identifier(raw.destinationLeafId,'DEST_LEAF');
 if(from===to)throw new Error('P0_TRANSFER_IDENTICAL_LOCATION');
 return Object.freeze({...common,kind:'TRANSFER',sourceLeafId:from,destinationLeafId:to,
  transferDocumentId:identifier(raw.transferDocumentId,'TRANSFER_DOCUMENT'),
  reason:textValue(raw.reason,'TRANSFER_REASON')});
}
export function prepareP0Nonposting(raw:unknown):P0Prepared{
 const p=validateP0Operation(raw);
 const sourceLocationId=p.kind==='OUT'?p.leafLocationId:p.kind==='TRANSFER'?p.sourceLeafId:'';
 const destinationLocationId=p.kind==='IN'||p.kind==='COUNT'?p.leafLocationId:
  p.kind==='TRANSFER'?p.destinationLeafId:'';
 return Object.freeze({state:'VALIDATED_NOT_POSTED',kind:p.kind,requestId:p.requestId,
  scope:Object.freeze({legalEntityId:p.legalEntityId,siteId:p.siteId,warehouseId:p.warehouseId}),
  itemCode:p.itemCode,productVersion:p.productVersion,quantity:p.quantity,
  sourceLocationId,destinationLocationId,
  locationVerified:false,businessAuthorityVerified:false,durable:false,stockChanged:false,
  requiredNextStep:p.kind==='COUNT'?'QUALIFIED_COUNT_EVIDENCE_PERSISTENCE':'QUALIFIED_AUTHORITY_AND_DATABASE_POSTING'});
}

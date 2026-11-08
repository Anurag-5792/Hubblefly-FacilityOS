/** OPS-A2 RETURN request: source-only validation. No posting authority. */
import {parseQuantity,formatQuantity} from '../domain/quantity.ts';
const id=/^[A-Z0-9][A-Z0-9._:-]{1,63}$/;
const uppercaseUuid=/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const OPS_A2_RETURN_REQUEST_FIELDS=['contractVersion','kind','requestId','legalEntityId','siteId','warehouseId',
 'itemCode','productVersion','controlType','quantity','uom','serialNo','batchNo',
 'leafLocationId','employeeId','returnDocumentId','returnLineKey','originalIssueId',
 'inspectionEvidenceId','inspectedCondition'] as const;
const fields=OPS_A2_RETURN_REQUEST_FIELDS;
export type OpsA2ReturnRequest=Readonly<Record<typeof fields[number],string>>;
function invalid(name:string):never{throw Error('OPS_A2_RETURN_'+name+'_INVALID');}
/** Strict client transport contract; independent typed return/inspection checks are SQL-only. */
export function validateOpsA2ReturnRequest(raw:unknown):OpsA2ReturnRequest{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid('OBJECT');
 const p=raw as Record<string,unknown>;
 if(Object.keys(p).length!==fields.length||fields.some(k=>!Object.hasOwn(p,k)))invalid('EXACT_KEYS');
 if(fields.some(k=>typeof p[k]!=='string'))invalid('FIELD_TYPE');
 const v=p as Record<typeof fields[number],string>;
 if(v.contractVersion!=='HFT-R1-OPS-A2-RETURN-PREPARE-V1'||v.kind!=='RETURN')invalid('CONTRACT');
 if(!uuid.test(v.requestId))invalid('REQUEST_ID');
 for(const key of fields){
  if(['contractVersion','kind','requestId','quantity','controlType','serialNo','batchNo','inspectedCondition'].includes(key))continue;
  if(key==='returnDocumentId'){
   if(!uppercaseUuid.test(v[key]))invalid('RETURN_DOCUMENT_ID');
  }else if(key==='originalIssueId'){
   if(!uuid.test(v[key]))invalid('ORIGINAL_ISSUE_ID');
  }else if(!id.test(v[key]))invalid(key.toUpperCase());
 }
 if(!['NONE','BATCH','SERIAL'].includes(v.controlType))invalid('CONTROL');
 if(!['GOOD','DAMAGED','QUARANTINE'].includes(v.inspectedCondition))invalid('CONDITION');
 if(v.controlType==='SERIAL'&&(!id.test(v.serialNo)||v.batchNo!=='')||
    v.controlType==='BATCH'&&(!id.test(v.batchNo)||v.serialNo!=='')||
    v.controlType==='NONE'&&(v.serialNo!==''||v.batchNo!==''))invalid('TRACEABILITY');
 let amount:bigint;
 try{amount=parseQuantity(v.quantity);}catch{invalid('QUANTITY');}
 if(amount<=0n||v.controlType==='SERIAL'&&amount!==1000000n)invalid('QUANTITY');
 return Object.freeze({...v,quantity:formatQuantity(amount)});
}
export function prepareOpsA2Return(raw:unknown){
 const request=validateOpsA2ReturnRequest(raw);
 return Object.freeze({state:'VALIDATED_NOT_POSTED' as const,kind:'RETURN' as const,
  requestId:request.requestId,quantity:request.quantity,productVersion:request.productVersion,
  locationVerified:false,businessAuthorityVerified:false,
  inspectionVerified:false,originalIssueVerified:false,stockChanged:false,durable:false,
  requiredNextStep:'QUALIFIED_RETURN_SOURCE_BINDING_AND_PROTECTED_WRITER' as const});
}

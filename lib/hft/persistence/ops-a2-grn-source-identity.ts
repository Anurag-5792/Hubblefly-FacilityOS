/** OPS-A2 offline source-contract bridge. NOT a database issuer or posting.
 * The signed P0 bytes remain uppercase UUID + original receiptKey. Only a
 * qualified typed GRN receipt may derive receiptKey:lineNo for P2.
 */
import {parseQuantity} from '../domain/quantity.ts';
import {validateP0Operation} from '../stores/p0-operations.ts';
const upperUuid=/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const lowerUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Receipt=Readonly<{
 grnId:string;legalEntityId:string;siteId:string;warehouseId:string;
 itemCode:string;productVersion:string;receiptKey:string;
 lineNo:number;supplierId:string;invoiceKey:string;invoiceVerified:boolean;
 leafLocationId:string;serialNo:string;batchNo:string;
 qcState:'ACCEPTED'|'PENDING'|'REJECTED';qcEvidenceId:string;
 acceptedQuantity:string;status:'AUTHORIZED'|'PARTIALLY_RECEIVED'|'OTHER';
}>;
export function deriveCanonicalGrnLineSynthetic(raw:unknown,typedRows:readonly Receipt[]){
 const op=validateP0Operation(raw);
 if(op.kind!=='IN'||!upperUuid.test(op.grnId)||op.qcState!=='ACCEPTED'||
  !Array.isArray(typedRows)||typedRows.length>5000)
  throw Error('OPS_A2_GRN_SIGNED_OR_TYPED_SOURCE_REQUIRED');
 const doc=op.grnId.toLowerCase();
 const matches=typedRows.filter(r=>
  lowerUuid.test(r.grnId)&&r.grnId===doc&&
  r.legalEntityId===op.legalEntityId&&r.siteId===op.siteId&&
  r.warehouseId===op.warehouseId&&r.itemCode===op.itemCode&&
  r.productVersion===op.productVersion&&
  r.receiptKey===op.receiptKey&&r.supplierId===op.supplierId&&
  r.invoiceKey===op.invoiceNumber&&r.invoiceVerified===true&&
  r.leafLocationId===op.leafLocationId&&r.serialNo===op.serialNo&&
  r.batchNo===op.batchNo&&r.qcState==='ACCEPTED'&&
  r.qcEvidenceId===op.qcEvidenceId&&
  (r.status==='AUTHORIZED'||r.status==='PARTIALLY_RECEIVED')&&
  Number.isSafeInteger(r.lineNo)&&r.lineNo>0&&
  parseQuantity(r.acceptedQuantity)>=parseQuantity(op.quantity));
 if(matches.length!==1)throw Error('OPS_A2_GRN_SOURCE_LINE_AMBIGUOUS_OR_MISSING');
 return Object.freeze({sourceDocumentId:doc,
  sourceActionKey:op.receiptKey+':'+String(matches[0].lineNo),
  signedRawGrnId:op.grnId,signedRawReceiptKey:op.receiptKey,
  independentlyVerified:false as const,
  sourceOnly:true as const});
}

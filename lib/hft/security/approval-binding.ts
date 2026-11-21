/** HFT R1 nonproduction contract for a DB-resolved, immutable approval.
 * Never treat caller-provided objects as approval or identity evidence.
 * Transactional source locking and DB grants are separately mandatory. */
import { createHash, timingSafeEqual } from 'node:crypto';
export type ApprovalAction = 'RECEIVE' | 'ISSUE' | 'RETURN';
export type ApprovalDocumentType = 'GRN' | 'ISSUE' | 'RETURN';
export type ApprovalScope = Readonly<{
  documentType:ApprovalDocumentType; action:ApprovalAction;
  documentId:string; documentRevision:number; sourceActionKey:string;
  legalEntityId:string; siteId:string; warehouseId:string; itemCode:string;
  locationId:string; batchNo:string; serialNo:string; quantityMicro:string;
  actorSubject:string; approverSubject:string; policyGeneration:number;
  inspectionCondition:''|'GOOD'|'DAMAGED'|'QUARANTINE'; inspectionEvidenceId:string;
}>;
export type PersistedApproval = Readonly<{
 approvalId:string; revision:number; approved:boolean; revoked:boolean;
 approvedPayloadSha256:string; scope:ApprovalScope;
}>;
export type PersistedPostingContext = Readonly<{
  source:ApprovalScope; currentPolicyGeneration:number;
  blockingHoldIds:readonly string[]; actorGrantActive:boolean; verifiedActorSubject:string;
}>;
const identifier=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const quantity=/^[1-9][0-9]*$/;
const typeAction:Record<ApprovalDocumentType,ApprovalAction>={GRN:'RECEIVE',ISSUE:'ISSUE',RETURN:'RETURN'};
function field(value:string,optional:boolean):string {
 if(typeof value!=='string'||(!optional&&!identifier.test(value))||
   (optional&&value!==''&&!identifier.test(value)))throw new Error('APPROVAL_CANONICAL_FIELD_INVALID');
 return value;
}
function positiveNumber(value:number):string{
 if(!Number.isSafeInteger(value)||value<1)throw new Error('APPROVAL_REVISION_OR_GENERATION_INVALID');
 return String(value);
}
/** Stable V1 tuple; each identifier excludes delimiter '|'. SQL must use identical order. */
export function canonicalApprovalText(s:ApprovalScope):string{
 if(typeAction[s.documentType]!==s.action)throw new Error('APPROVAL_ACTION_TYPE_MISMATCH');
 if(!quantity.test(s.quantityMicro)||BigInt(s.quantityMicro)>9223372036854775807n)throw new Error('APPROVAL_QUANTITY_INVALID');
 if(s.inspectionCondition&&!['GOOD','DAMAGED','QUARANTINE'].includes(s.inspectionCondition))throw new Error('APPROVAL_CONDITION_INVALID');
 if(s.action==='RETURN'&&(!s.inspectionCondition||!s.inspectionEvidenceId))throw new Error('RETURN_INSPECTION_APPROVAL_REQUIRED');
 if(s.actorSubject===s.approverSubject)throw new Error('APPROVAL_SEGREGATION_REQUIRED');
 return ['HFT_APPROVAL_V1',s.documentType,s.action,field(s.documentId,false),
  positiveNumber(s.documentRevision),field(s.sourceActionKey,false),
  field(s.legalEntityId,false),field(s.siteId,false),field(s.warehouseId,false),
  field(s.itemCode,false),field(s.locationId,false),field(s.batchNo,true),
  field(s.serialNo,true),s.quantityMicro,field(s.actorSubject,false),
  field(s.approverSubject,false),positiveNumber(s.policyGeneration),
  s.inspectionCondition,field(s.inspectionEvidenceId,true)].join('|');
}
export function approvedPayloadDigest(scope:ApprovalScope):string{
 return createHash('sha256').update(canonicalApprovalText(scope),'utf8').digest('hex');
}
function sameDigest(a:string,b:string):boolean{
 if(!/^[0-9a-f]{64}$/.test(a)||!/^[0-9a-f]{64}$/.test(b))return false;
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
/** Must receive persisted, row-locked source, approval and policy data. */
export function assertBoundApproval(command:ApprovalScope,approval:PersistedApproval,
 context:PersistedPostingContext):void{
 if(!approval||!approval.approved||approval.revoked||!identifier.test(approval.approvalId)||
   !Number.isSafeInteger(approval.revision)||approval.revision<1)throw new Error('BOUND_APPROVAL_REQUIRED');
 if(!context.actorGrantActive||context.blockingHoldIds.length)throw new Error('POSTING_POLICY_OR_HOLD_BLOCKED');
 if(command.actorSubject!==context.verifiedActorSubject)throw new Error('POSTING_ACTOR_BINDING_FAILED');
 if(command.policyGeneration!==context.currentPolicyGeneration)throw new Error('POSTING_POLICY_GENERATION_STALE');
 const submitted=canonicalApprovalText(command),persisted=canonicalApprovalText(approval.scope),
 actual=canonicalApprovalText(context.source);
 if(submitted!==persisted||persisted!==actual)throw new Error('APPROVAL_DOCUMENT_REVISION_OR_PAYLOAD_CHANGED');
 if(!sameDigest(approval.approvedPayloadSha256,approvedPayloadDigest(approval.scope)))
   throw new Error('APPROVAL_CANONICAL_DIGEST_MISMATCH');
}

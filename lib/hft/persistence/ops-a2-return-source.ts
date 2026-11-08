/** RETURN-to-P2 V2 source binding. Offline verification, NOT an approval issuer.
 * A trusted PostgreSQL resolver must supply the command and signed source
 * account identities; this function neither signs nor posts anything.
 */
import {parseQuantity} from '../domain/quantity.ts';
import {validateOpsA2ReturnRequest,type OpsA2ReturnRequest}
 from '../stores/ops-a2-return-preparation.ts';
import {proposedOpsAPayload,type OpsAPayload}
 from '../security/ops-a-versioned-invocation.ts';
import type {VersionedCommand} from './ops-a-versioned-evidence.ts';

export type ProtectedReturnResolution=Readonly<{
 issuer:'HFT_P2_PROTECTED_DATABASE';state:'OPS_A2_AUTHORIZED_SOURCE_V2';
 command:VersionedCommand;sourceAccountId:string;destinationAccountId:string;
 approvedPayloadSha256:string;
}>;
const sha=/^[0-9a-f]{64}$/;
const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
/** An exact request match is necessary but NOT sufficient to authorize posting. */
export function verifyReturnP2Source(raw:unknown,resolved:ProtectedReturnResolution):
 OpsAPayload{
 const req:OpsA2ReturnRequest=validateOpsA2ReturnRequest(raw);
 if(!resolved||resolved.issuer!=='HFT_P2_PROTECTED_DATABASE'||
    resolved.state!=='OPS_A2_AUTHORIZED_SOURCE_V2')
  throw Error('OPS_A2_RETURN_PROTECTED_ISSUER_REQUIRED');
 const c=resolved.command;
 if(!c||c.kind!=='RETURN'||c.commandId!==req.requestId||
    c.idempotencyKey!==req.requestId||
    c.legalEntityId!==req.legalEntityId||c.siteId!==req.siteId||
    c.warehouseId!==req.warehouseId||c.itemCode!==req.itemCode||
    c.productVersion!==req.productVersion||c.controlType!==req.controlType||
    c.serialNo!==req.serialNo||c.batchNo!==req.batchNo||
    parseQuantity(c.requestQuantity)!==parseQuantity(req.quantity)||
    c.destinationLeafId!==req.leafLocationId||
    c.employeeId!==req.employeeId||c.originalIssueId!==req.originalIssueId||
    c.sourceDocumentId!==req.returnDocumentId||
    c.sourceActionKey!==req.returnLineKey||c.fragmentId!==req.returnLineKey||
    c.inspectionEvidenceId!==req.inspectionEvidenceId||
    c.inspectedCondition!==req.inspectedCondition||
    !c.sourceLeafId||c.expectedSourceAccountVersion===null||
    c.expectedDestinationAccountVersion===null||
    c.actorSubject===c.approvedBy||
    !id.test(resolved.sourceAccountId)||!id.test(resolved.destinationAccountId)||
    resolved.sourceAccountId===resolved.destinationAccountId||
    !sha.test(resolved.approvedPayloadSha256))
  throw Error('OPS_A2_RETURN_SOURCE_COMMAND_NOT_BOUND');
 return proposedOpsAPayload(c,resolved.sourceAccountId,
  resolved.destinationAccountId,resolved.approvedPayloadSha256);
}

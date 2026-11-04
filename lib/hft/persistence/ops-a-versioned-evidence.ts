/**
 * OPS-A source-only verification of proposed VERSION-AWARE P2 immutable facts.
 * NEVER a new ledger, posting authority, balance store or browser client.
 * Inputs must eventually be read from the already authoritative hft.stock_entry,
 * hft.stock_command, hft.stock_account, seal and audit records under a qualified
 * protected PostgreSQL read transaction. This module DOES NOT attest that source.
 */
import {createHash} from 'node:crypto';
import {parseQuantity,formatSignedQuantity} from '../domain/quantity.ts';
import {lengthPrefixedUtf8} from '../security/posting-invocation-proof.ts';

export const OPS_A_EVIDENCE_V1='HFT-R1-OPS-A-VERSION-LEDGER-EVIDENCE-V1' as const;
export const OPS_A_READBACK_V1='HFT-R1-OPS-A-VERSION-READBACK-V1' as const;
const id=/^[A-Z0-9][A-Z0-9._:-]{1,63}$/;
const documentId=/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const hex=/^[0-9a-f]{64}$/;
const maxMicro=9223372036854775807n;
const kinds=['AVAILABLE','CUSTODY','QUARANTINE','DAMAGED','WIP','INSTALLED'] as const;
export type AccountKind=typeof kinds[number];
export type VersionScope=Readonly<{
 legalEntityId:string;siteId:string;warehouseId:string;itemCode:string;
 productVersion:string;controlType:'NONE'|'BATCH'|'SERIAL';
 serialNo:string;batchNo:string;
}>;
export type StockAccountIdentity=Readonly<VersionScope&{
 leafLocationId:string;kind:AccountKind;
 condition:'GOOD'|'DAMAGED'|'QUARANTINE';custodianEmployeeId:string;
}>;
export type VersionedCommand=Readonly<VersionScope&{
 commandId:string;idempotencyKey:string;kind:'RECEIVE'|'ISSUE'|'RETURN'|'TRANSFER';
 sourceDocumentId:string;sourceActionKey:string;fragmentId:string;
 requestQuantity:string;sourceLeafId:string;destinationLeafId:string;
 expectedSourceAccountVersion:number|null;expectedDestinationAccountVersion:number|null;
 employeeId:string;originalIssueId:string;
 sourceRevision:number;approvalId:string;approvalRevision:number;
 policyGeneration:number;approvedBy:string;actorSubject:string;
 inspectedCondition:'GOOD'|'DAMAGED'|'QUARANTINE';inspectionEvidenceId:string;
}>;
export type VersionedLedgerEntry=Readonly<{
 entryId:string;commandId:string;accountId:string|null;
 account:StockAccountIdentity|null;bucket:AccountKind|'EXTERNAL';
 accountBeforeVersion:number|null;accountAfterVersion:number|null;
 signedQuantity:string;
}>;
export type VersionedImmutableFact=Readonly<{
 schema:typeof OPS_A_EVIDENCE_V1;command:VersionedCommand;
 ledgerEntryIds:readonly string[];movements:readonly VersionedLedgerEntry[];
 movementSha256:string;auditCanonicalText:string;auditSha256:string;
}>;
export type VersionedStockAccountRow=Readonly<{
 accountId:string;identity:StockAccountIdentity;
 persistedQuantity:string;persistedVersion:number;
}>;
export type VersionedLedgerReadback=Readonly<{
 schema:typeof OPS_A_READBACK_V1;legalEntityId:string;siteId:string;
 warehouseId:string;completeUnfilteredHistory:true;
 immutableFacts:readonly VersionedImmutableFact[];
 accounts:readonly VersionedStockAccountRow[];
}>;
function required(value:string,name:string):void{
 if(typeof value!=='string'||!id.test(value))throw Error('OPS_A_'+name+'_INVALID');
}
function document(value:string,name:string,optional=false):void{
 if(typeof value!=='string'||(!optional||value!=='')&&!documentId.test(value))
  throw Error('OPS_A_'+name+'_INVALID');
}
function positiveInteger(value:number,name:string):void{
 if(!Number.isSafeInteger(value)||value<1)throw Error('OPS_A_'+name+'_INVALID');
}
function positiveMicro(value:string):bigint{
 const amount=parseQuantity(value);
 if(amount===0n)throw Error('OPS_A_ZERO_QUANTITY');
 return amount;
}
function signedMicro(value:string):bigint{
 if(typeof value!=='string'||value==='-0')throw Error('OPS_A_DELTA_INVALID');
 const sign=value.startsWith('-')?-1n:1n;
 const amt=parseQuantity(sign===-1n?value.slice(1):value);
 if(amt===0n)throw Error('OPS_A_EMPTY_LEDGER_LEG');
 return sign*amt;
}
function canonicalFields(fields:readonly string[]):string{
 return createHash('sha256').update(lengthPrefixedUtf8(fields)).digest('hex');
}
function scopeFields(s:VersionScope):readonly string[]{
 return [s.legalEntityId,s.siteId,s.warehouseId,s.itemCode,
  s.productVersion,s.controlType,s.serialNo,s.batchNo];
}
function sameScope(a:VersionScope,b:VersionScope):boolean{
 return scopeFields(a).every((field,i)=>field===scopeFields(b)[i]);
}
function validateScope(s:VersionScope):void{
 for(const [name,value] of Object.entries({
  legalEntityId:s.legalEntityId,siteId:s.siteId,
  warehouseId:s.warehouseId,itemCode:s.itemCode,
  productVersion:s.productVersion}))required(value,name.toUpperCase());
 if(!['NONE','BATCH','SERIAL'].includes(s.controlType))
  throw Error('OPS_A_CONTROL_TYPE_INVALID');
 if(s.controlType==='SERIAL'){
  required(s.serialNo,'SERIAL');
  if(s.batchNo!=='')throw Error('OPS_A_SERIAL_BATCH_CONFLICT');
 }else if(s.controlType==='BATCH'){
  required(s.batchNo,'BATCH');
  if(s.serialNo!=='')throw Error('OPS_A_BATCH_SERIAL_CONFLICT');
 }else if(s.serialNo!==''||s.batchNo!=='')
  throw Error('OPS_A_NONE_TRACEABILITY_CONFLICT');
}
export function versionedAccountIdentityKey(account:StockAccountIdentity):string{
 validateScope(account);required(account.leafLocationId,'LEAF_LOCATION');
 if(!kinds.includes(account.kind))throw Error('OPS_A_ACCOUNT_KIND_INVALID');
 if(!['GOOD','DAMAGED','QUARANTINE'].includes(account.condition))
  throw Error('OPS_A_CONDITION_INVALID');
 if(account.kind==='CUSTODY'){
  required(account.custodianEmployeeId,'CUSTODIAN');
  if(account.condition!=='GOOD')throw Error('OPS_A_CUSTODY_CONDITION_INVALID');
 }else if(account.custodianEmployeeId!=='')
  throw Error('OPS_A_UNEXPECTED_CUSTODIAN');
 if(account.kind==='QUARANTINE'&&account.condition!=='QUARANTINE'||
    account.kind==='DAMAGED'&&account.condition!=='DAMAGED'||
    !['CUSTODY','QUARANTINE','DAMAGED'].includes(account.kind)&&account.condition!=='GOOD')
  throw Error('OPS_A_ACCOUNT_CONDITION_MISMATCH');
 return canonicalFields([OPS_A_EVIDENCE_V1,...scopeFields(account),
  account.leafLocationId,account.kind,account.condition,account.custodianEmployeeId]);
}
function entryFields(leg:VersionedLedgerEntry):readonly string[]{
 if(leg.bucket==='EXTERNAL')return [leg.entryId,leg.commandId,'EXTERNAL','','',
  '', '',leg.signedQuantity];
 if(!leg.accountId||!leg.account)throw Error('OPS_A_OWNED_ACCOUNT_REQUIRED');
 return [leg.entryId,leg.commandId,leg.bucket,leg.accountId,
  versionedAccountIdentityKey(leg.account),String(leg.accountBeforeVersion),
  String(leg.accountAfterVersion),leg.signedQuantity];
}
function factFields(f:VersionedImmutableFact):readonly string[]{
 const c=f.command;
 return [f.schema,c.commandId,c.idempotencyKey,c.kind,...scopeFields(c),
  c.sourceDocumentId,c.sourceActionKey,c.fragmentId,c.requestQuantity,
  c.sourceLeafId,c.destinationLeafId,
  String(c.expectedSourceAccountVersion??''),
  String(c.expectedDestinationAccountVersion??''),
  c.employeeId,c.originalIssueId,
  String(c.sourceRevision),c.approvalId,String(c.approvalRevision),
  String(c.policyGeneration),c.approvedBy,c.actorSubject,
  c.inspectedCondition,c.inspectionEvidenceId,
  ...f.movements.flatMap(entryFields)];
}
export function versionedFactAuditText(f:VersionedImmutableFact):string{
 // Testable audit text contract for a future sealed PostgreSQL source. The DB
 // must independently compute and store the same byte sequence at posting.
 return ['OPS_A_AUDIT_V1',...factFields(f)].map(x=>JSON.stringify(x)).join('|');
}
export function versionedMovementDigest(f:VersionedImmutableFact):string{
 const c=f.command;
 return canonicalFields([OPS_A_EVIDENCE_V1,c.commandId,
  ...f.movements.flatMap(entryFields)]);
}
function checkLeg(leg:VersionedLedgerEntry,c:VersionedCommand):void{
 document(leg.entryId,'ENTRY');
 if(leg.commandId!==c.commandId)throw Error('OPS_A_ENTRY_COMMAND_MISMATCH');
 if(leg.bucket==='EXTERNAL'){
  if(leg.accountId!==null||leg.account!==null||
     leg.accountBeforeVersion!==null||leg.accountAfterVersion!==null)
   throw Error('OPS_A_EXTERNAL_OWNERSHIP_FORBIDDEN');
 }else{
  if(!leg.account||!leg.accountId)throw Error('OPS_A_OWNED_ACCOUNT_REQUIRED');
  document(leg.accountId,'ACCOUNT');
  if(!sameScope(leg.account,c))
   throw Error('OPS_A_ENTRY_ITEM_VERSION_SCOPE_DRIFT');
  if(leg.account.kind!==leg.bucket)
   throw Error('OPS_A_ENTRY_BUCKET_ACCOUNT_MISMATCH');
  if(!Number.isSafeInteger(leg.accountBeforeVersion)||
      !Number.isSafeInteger(leg.accountAfterVersion)||
      leg.accountBeforeVersion===null||leg.accountAfterVersion===null||
      leg.accountBeforeVersion<0||leg.accountAfterVersion!==leg.accountBeforeVersion+1)
   throw Error('OPS_A_ACCOUNT_VERSION_SEQUENCE_INVALID');
  versionedAccountIdentityKey(leg.account);
 }
 signedMicro(leg.signedQuantity);
}
function checkMovement(c:VersionedCommand,m:readonly VersionedLedgerEntry[]):void{
 if(m.length!==2)throw Error('OPS_A_TWO_LEGS_REQUIRED');
 const qty=positiveMicro(c.requestQuantity);
 if(c.controlType==='SERIAL'&&qty!==1_000_000n)
  throw Error('OPS_A_SERIAL_UNIT_REQUIRED');
 if(signedMicro(m[0].signedQuantity)!==-qty||
    signedMicro(m[1].signedQuantity)!==qty)
  throw Error('OPS_A_UNBALANCED_COMMAND');
 const a=m[0],b=m[1];
 if(c.expectedSourceAccountVersion!==a.accountBeforeVersion||
    c.expectedDestinationAccountVersion!==b.accountBeforeVersion)
  throw Error('OPS_A_STALE_AUTHORIZED_ACCOUNT_REVISION');
 const from=a.account,to=b.account;
 const needed=(condition:boolean,code:string)=>{if(!condition)throw Error('OPS_A_'+code);};
 if(c.kind==='RECEIVE'){
  needed(a.bucket==='EXTERNAL'&&b.bucket==='AVAILABLE'&&
    from===null&&!!to&&to.leafLocationId===c.destinationLeafId&&
    c.sourceLeafId===''&&c.employeeId===''&&c.originalIssueId===''&&
    c.fragmentId===''&&c.inspectedCondition==='GOOD'&&
    !!c.inspectionEvidenceId,'RECEIPT_SOURCE_OR_QC_DENIED');
 }else if(c.kind==='ISSUE'){
  needed(a.bucket==='AVAILABLE'&&b.bucket==='CUSTODY'&&
   !!from&&!!to&&from.leafLocationId===c.sourceLeafId&&
   to.leafLocationId===c.sourceLeafId&&c.destinationLeafId===''&&
   !!c.employeeId&&to.custodianEmployeeId===c.employeeId&&
   c.originalIssueId===''&&!!c.fragmentId,'ISSUE_CUSTODY_SCOPE_INVALID');
 }else if(c.kind==='RETURN'){
  needed(a.bucket==='CUSTODY'&&
   b.bucket===(c.inspectedCondition==='GOOD'?'AVAILABLE':
     c.inspectedCondition==='DAMAGED'?'DAMAGED':'QUARANTINE')&&
   !!from&&!!to&&from.leafLocationId===c.sourceLeafId&&
   to.leafLocationId===c.destinationLeafId&&!!c.employeeId&&
   from.custodianEmployeeId===c.employeeId&&!!c.originalIssueId&&
   !!c.fragmentId&&!!c.inspectionEvidenceId,
   'RETURN_CUSTODY_INSPECTION_INVALID');
 }else if(c.kind==='TRANSFER'){
  needed(a.bucket==='AVAILABLE'&&b.bucket==='AVAILABLE'&&
   !!from&&!!to&&from.leafLocationId===c.sourceLeafId&&
   to.leafLocationId===c.destinationLeafId&&
   c.sourceLeafId!==c.destinationLeafId&&c.employeeId===''&&
   c.originalIssueId===''&&!!c.fragmentId&&
   c.inspectedCondition==='GOOD','TRANSFER_ONE_WRITER_LOCATIONS_INVALID');
 }else throw Error('OPS_A_ACTION_INVALID');
 if(from&&to&&from.leafLocationId===to.leafLocationId&&c.kind==='TRANSFER')
  throw Error('OPS_A_TRANSFER_SAME_LOCATION');
 if(from&&to&&a.accountId===b.accountId)
  throw Error('OPS_A_SAME_ACCOUNT_DOUBLE_LEG');
}
export function verifyVersionedImmutableFact(f:VersionedImmutableFact):void{
 if(f.schema!==OPS_A_EVIDENCE_V1)throw Error('OPS_A_FACT_SCHEMA_INVALID');
 const c=f.command;validateScope(c);
 for(const [key,v] of Object.entries({commandId:c.commandId,
  idempotencyKey:c.idempotencyKey,sourceDocumentId:c.sourceDocumentId,
  sourceActionKey:c.sourceActionKey,approvalId:c.approvalId,
  actorSubject:c.actorSubject,approvedBy:c.approvedBy}))
  document(v,key);
 for(const key of ['sourceLeafId','destinationLeafId','employeeId',
  'originalIssueId','fragmentId','inspectionEvidenceId'] as const)
  document(c[key],key,true);
 if(c.actorSubject===c.approvedBy)
  throw Error('OPS_A_SELF_APPROVAL');
 for(const version of [c.expectedSourceAccountVersion,c.expectedDestinationAccountVersion]){
  if(version!==null&&(!Number.isSafeInteger(version)||version<0))
   throw Error('OPS_A_AUTHORIZED_ACCOUNT_REVISION_INVALID');
 }
 positiveInteger(c.sourceRevision,'SOURCE_REVISION');
 positiveInteger(c.approvalRevision,'APPROVAL_REVISION');
 positiveInteger(c.policyGeneration,'POLICY_GENERATION');
 if(!Array.isArray(f.movements)||!Array.isArray(f.ledgerEntryIds)||
     f.movements.length!==f.ledgerEntryIds.length)
  throw Error('OPS_A_LEDGER_ENTRIES_INVALID');
 for(let i=0;i<f.movements.length;i++){
  if(f.movements[i].entryId!==f.ledgerEntryIds[i])
   throw Error('OPS_A_LEDGER_ENTRY_ORDER_MISMATCH');
  checkLeg(f.movements[i],c);
 }
 checkMovement(c,f.movements);
 if(!hex.test(f.movementSha256)||f.movementSha256!==versionedMovementDigest(f))
  throw Error('OPS_A_IMMUTABLE_MOVEMENT_SEAL_MISMATCH');
 const audit=versionedFactAuditText(f);
 if(f.auditCanonicalText!==audit||!hex.test(f.auditSha256)||
    f.auditSha256!==createHash('sha256').update(audit,'utf8').digest('hex'))
  throw Error('OPS_A_IMMUTABLE_AUDIT_MISMATCH');
}
/** Full-history reconstruction: reads existing stock_entry facts, never writes.
 * A source stating complete=true cannot attest its own completeness. A future
 * DB owner must prove snapshot/readback completeness independently.
 */
export function verifyVersionedLedgerReadback(proof:VersionedLedgerReadback):ReadonlyMap<string,bigint>{
 if(proof.schema!==OPS_A_READBACK_V1||proof.completeUnfilteredHistory!==true)
  throw Error('OPS_A_COMPLETE_AUTHORITATIVE_HISTORY_REQUIRED');
 for(const [key,value] of Object.entries({legalEntityId:proof.legalEntityId,
  siteId:proof.siteId,warehouseId:proof.warehouseId}))required(value,key);
 if(!Array.isArray(proof.immutableFacts)||!Array.isArray(proof.accounts))
  throw Error('OPS_A_READBACK_ARRAYS_REQUIRED');
 const byId=new Map<string,VersionedStockAccountRow>();
 const byIdentity=new Map<string,string>();
 for(const a of proof.accounts){
  document(a.accountId,'ACCOUNT');
  const key=versionedAccountIdentityKey(a.identity);
  if(a.identity.legalEntityId!==proof.legalEntityId||
    a.identity.siteId!==proof.siteId||a.identity.warehouseId!==proof.warehouseId)
   throw Error('OPS_A_ACCOUNT_OUT_OF_SCOPE');
  if(byId.has(a.accountId)||byIdentity.has(key))
   throw Error('OPS_A_DUPLICATE_ACCOUNT_IDENTITY');
  if(!Number.isSafeInteger(a.persistedVersion)||a.persistedVersion<0)
   throw Error('OPS_A_ACCOUNT_REVISION_INVALID');
  parseQuantity(a.persistedQuantity);
  byId.set(a.accountId,a);byIdentity.set(key,a.accountId);
 }
 const seenCommands=new Set<string>(),seenIdempotency=new Set<string>();
 const seenActions=new Set<string>(),seenEntryIds=new Set<string>();
 const totals=new Map<string,bigint>();
 const heldByIssue=new Map<string,{quantity:bigint;actor:VersionedCommand}>();
 const serialCustody=new Map<string,{version:string;state:string}>();
 const accountVersion=new Map<string,number>();
 for(const fact of proof.immutableFacts){
  verifyVersionedImmutableFact(fact);
  const c=fact.command;
  if(c.legalEntityId!==proof.legalEntityId||c.siteId!==proof.siteId||
     c.warehouseId!==proof.warehouseId)
   throw Error('OPS_A_COMMAND_OUT_OF_SCOPE');
  const commandKey=c.legalEntityId+'|'+c.commandId;
  const idemKey=c.legalEntityId+'|'+c.idempotencyKey;
  const sourceKey=JSON.stringify([c.legalEntityId,c.sourceDocumentId,
   c.sourceActionKey,c.fragmentId]);
  if(seenCommands.has(commandKey)||seenIdempotency.has(idemKey)||
     seenActions.has(sourceKey))throw Error('OPS_A_DUPLICATE_COMMAND_OR_SOURCE_ACTION');
  seenCommands.add(commandKey);seenIdempotency.add(idemKey);seenActions.add(sourceKey);
  if(c.kind==='ISSUE')heldByIssue.set(c.commandId,
   {quantity:positiveMicro(c.requestQuantity),actor:c});
  if(c.kind==='RETURN'){
   const outstanding=heldByIssue.get(c.originalIssueId);
   const amount=positiveMicro(c.requestQuantity);
   if(!outstanding||outstanding.quantity<amount)
    throw Error('OPS_A_RETURN_EXCEEDS_ORIGINAL_ISSUE');
   const origin=outstanding.actor;
   if(!sameScope(origin,c)||origin.employeeId!==c.employeeId||
      origin.sourceLeafId!==c.sourceLeafId)
    throw Error('OPS_A_RETURN_ORIGINAL_ISSUE_IDENTITY_MISMATCH');
   heldByIssue.set(c.originalIssueId,{...outstanding,
    quantity:outstanding.quantity-amount});
  }
  if(c.controlType==='SERIAL'){
   const key=JSON.stringify([c.legalEntityId,c.itemCode,c.serialNo]);
   const recorded=serialCustody.get(key);
   if(recorded&&recorded.version!==c.productVersion)
    throw Error('OPS_A_SERIAL_VERSION_REASSIGNMENT');
   const holder=recorded?.state;
   if(c.kind==='RECEIVE'){
    if(holder!==undefined)throw Error('OPS_A_SERIAL_DUPLICATE_RECEIVE');
    serialCustody.set(key,{version:c.productVersion,state:'AVAILABLE'});
   }else if(c.kind==='ISSUE'){
    if(holder!=='AVAILABLE')throw Error('OPS_A_SERIAL_NOT_AVAILABLE');
    serialCustody.set(key,{version:c.productVersion,state:'CUSTODY:'+c.employeeId});
   }else if(c.kind==='RETURN'){
    if(holder!=='CUSTODY:'+c.employeeId)
     throw Error('OPS_A_SERIAL_CUSTODY_MISMATCH');
    serialCustody.set(key,{version:c.productVersion,state:c.inspectedCondition});
   }else if(c.kind==='TRANSFER'){
    if(holder!=='AVAILABLE')throw Error('OPS_A_SERIAL_TRANSFER_NOT_AVAILABLE');
   }
  }
  for(const leg of fact.movements){
   if(seenEntryIds.has(leg.entryId))throw Error('OPS_A_DUPLICATE_IMMUTABLE_ENTRY_ID');
   seenEntryIds.add(leg.entryId);
   if(leg.accountId===null)continue;
   const account=byId.get(leg.accountId);
   if(!account||!leg.account||
       versionedAccountIdentityKey(account.identity)!==
       versionedAccountIdentityKey(leg.account))
    throw Error('OPS_A_LEDGER_ACCOUNT_IDENTITY_DRIFT');
   const currentVersion=accountVersion.get(leg.accountId)??0;
   if(leg.accountBeforeVersion!==currentVersion||
      leg.accountAfterVersion!==currentVersion+1)
    throw Error('OPS_A_ACCOUNT_VERSION_STALE_OR_SKIPPED');
   accountVersion.set(leg.accountId,currentVersion+1);
   const current=totals.get(leg.accountId)??0n;
   const newValue=current+signedMicro(leg.signedQuantity);
   if(newValue<0n||newValue>maxMicro)
    throw Error('OPS_A_NEGATIVE_OR_OVERFLOW_ACCOUNT');
   totals.set(leg.accountId,newValue);
  }
 }
 for(const account of proof.accounts){
  if((totals.get(account.accountId)??0n)!==parseQuantity(account.persistedQuantity))
   throw Error('OPS_A_ACCOUNT_LEDGER_RECONSTRUCTION_MISMATCH');
  if((accountVersion.get(account.accountId)??0)!==account.persistedVersion)
   throw Error('OPS_A_ACCOUNT_VERSION_RECONSTRUCTION_MISMATCH');
 }
 return totals;
}

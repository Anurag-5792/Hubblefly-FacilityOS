/**
 * HFT R1 P2 source-only immutable fragment validation.
 * This pure check is NOT an approval, identity or database posting authority.
 * The single protected PostgreSQL writer must enforce the same rules under
 * locked persisted documents, issue custody, grants, approvals and Holds.
 */
export type FragmentAction = 'ISSUE' | 'RETURN';
export type StockFragmentLine = Readonly<{
  action: FragmentAction;
  legalEntityId: string;
  siteId: string;
  warehouseId: string;
  documentId: string;
  documentRevision: number;
  lineActionKey: string;
  itemCode: string;
  locationId: string;
  batchNo: string;
  serialNo: string;
  employeeId: string;
  originalIssueCommandId: string;
  authorizedMicro: string;
  controlType: 'NONE' | 'SERIAL' | 'BATCH';
}>;
export type ImmutablePostingFragment = Readonly<{
  legalEntityId: string;
  fragmentId: string;
  commandId: string;
  idempotencyKey: string;
  sourceDocumentId: string;
  sourceLineActionKey: string;
  action: FragmentAction;
  quantityMicro: string;
  employeeId: string;
  originalIssueCommandId: string;
  documentRevision: number;
  actorSubject: string;
  approverSubject: string;
  approvedQuantityMicro: string;
  approvedPayloadSha256: string;
  policyGeneration: number;
}>;
export type FragmentPlan = Readonly<{
  fragment: ImmutablePostingFragment;
  postedMicro: string;
  remainingMicro: string;
  custodyRemainingMicro: string | null;
}>;
const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const sha = /^[0-9a-f]{64}$/;
const maxInt8 = 9_223_372_036_854_775_807n;
function quantity(value: string): bigint {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value))
    throw new Error('FRAGMENT_QUANTITY_INVALID');
  const parsed = BigInt(value);
  if (parsed <= 0n || parsed > maxInt8) throw new Error('FRAGMENT_QUANTITY_OVERFLOW');
  return parsed;
}
function validId(value: string): boolean { return typeof value === 'string' && id.test(value); }
function sameLine(line: StockFragmentLine, part: ImmutablePostingFragment): boolean {
  return line.action === part.action && line.legalEntityId === part.legalEntityId &&
    line.documentId === part.sourceDocumentId && line.lineActionKey === part.sourceLineActionKey &&
    line.employeeId === part.employeeId &&
    line.originalIssueCommandId === part.originalIssueCommandId;
}
/**
 * Existing fragments MUST be read from authoritative immutable posted facts.
 * Passing fabricated rows to this function supplies no authorization.
 */
export function planImmutablePostingFragment(
  line: StockFragmentLine,
  fragment: ImmutablePostingFragment,
  committed: readonly ImmutablePostingFragment[],
  remainingCustodyMicro: string | null,
): FragmentPlan {
  for (const value of [line.legalEntityId,line.siteId,line.warehouseId,line.documentId,
    line.lineActionKey,line.itemCode,line.locationId,line.employeeId,
    fragment.fragmentId,fragment.commandId,fragment.idempotencyKey,fragment.actorSubject,
    fragment.approverSubject]) if (!validId(value)) throw new Error('FRAGMENT_IDENTITY_INVALID');
  if (line.batchNo && !validId(line.batchNo) || line.serialNo && !validId(line.serialNo))
    throw new Error('FRAGMENT_CONTROL_IDENTITY_INVALID');
  if (line.action === 'RETURN' && !validId(line.originalIssueCommandId))
    throw new Error('RETURN_ORIGINAL_ISSUE_REQUIRED');
  if (line.action === 'ISSUE' && line.originalIssueCommandId !== '')
    throw new Error('ISSUE_UNEXPECTED_ORIGINAL_ISSUE');
  if (line.controlType === 'SERIAL' && !line.serialNo || line.controlType === 'BATCH' && !line.batchNo)
    throw new Error('FRAGMENT_CONTROL_REQUIRED');
  if (line.controlType === 'NONE' && (line.serialNo || line.batchNo))
    throw new Error('FRAGMENT_UNEXPECTED_SERIAL_OR_BATCH');
  if (!Number.isSafeInteger(line.documentRevision) || line.documentRevision < 1 ||
      !Number.isSafeInteger(fragment.documentRevision) || fragment.documentRevision < 1 ||
      !Number.isSafeInteger(fragment.policyGeneration) || fragment.policyGeneration < 1)
    throw new Error('FRAGMENT_REVISION_INVALID');
  if (!sameLine(line,fragment) || line.documentRevision !== fragment.documentRevision)
    throw new Error('FRAGMENT_SOURCE_LINE_OR_REVISION_MISMATCH');
  if (fragment.actorSubject === fragment.approverSubject || !sha.test(fragment.approvedPayloadSha256))
    throw new Error('FRAGMENT_APPROVAL_CONTRACT_INVALID');
  const fragmentQuantity = quantity(fragment.quantityMicro);
  const ceiling = quantity(line.authorizedMicro);
  if (fragment.approvedQuantityMicro !== fragment.quantityMicro)
    throw new Error('FRAGMENT_EXACT_APPROVED_QUANTITY_MISMATCH');
  if (line.controlType === 'SERIAL' && (ceiling !== 1_000_000n || fragmentQuantity !== 1_000_000n))
    throw new Error('FRAGMENT_SERIAL_UNIT_REQUIRED');
  const seenFragments=new Set<string>(), seenCommands=new Set<string>(), seenKeys=new Set<string>();
  let alreadyPosted=0n;
  for (const posted of committed) {
    if (posted.legalEntityId !== line.legalEntityId) continue;
    for (const [key,seen] of [[posted.fragmentId,seenFragments],[posted.commandId,seenCommands],
                             [posted.idempotencyKey,seenKeys]] as const) {
      if (seen.has(key)) throw new Error('DUPLICATED_IMMUTABLE_FRAGMENT_HISTORY');
      seen.add(key);
    }
    if (sameLine(line,posted)) alreadyPosted += quantity(posted.quantityMicro);
  }
  if (seenFragments.has(fragment.fragmentId) || seenCommands.has(fragment.commandId) ||
      seenKeys.has(fragment.idempotencyKey)) throw new Error('FRAGMENT_IDEMPOTENCY_OR_COMMAND_COLLISION');
  if (alreadyPosted+fragmentQuantity>ceiling) throw new Error('FRAGMENT_AUTHORIZED_CUMULATIVE_EXCEEDED');
  let custodyAfter: bigint | null = null;
  if (line.action === 'RETURN') {
    if (remainingCustodyMicro === null || !/^[0-9]+$/.test(remainingCustodyMicro))
      throw new Error('RETURN_CUSTODY_READBACK_REQUIRED');
    const custodyBefore=BigInt(remainingCustodyMicro);
    if (fragmentQuantity>custodyBefore) throw new Error('RETURN_EXCEEDS_REMAINING_CUSTODY');
    custodyAfter=custodyBefore-fragmentQuantity;
  } else if (remainingCustodyMicro !== null) {
    throw new Error('ISSUE_UNEXPECTED_CUSTODY_READBACK');
  }
  return Object.freeze({fragment:Object.freeze({...fragment}),postedMicro:(alreadyPosted+fragmentQuantity).toString(),
    remainingMicro:(ceiling-alreadyPosted-fragmentQuantity).toString(),
    custodyRemainingMicro:custodyAfter?.toString()??null});
}

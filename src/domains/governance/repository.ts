import "server-only";

import { sql, type Transaction } from "kysely";

import type { DB } from "../../platform/db/kysely.types";
import { TransactionalRepository } from "../../platform/db/repository";
import {
  parseCausationId,
  parseCommandId,
  parseCorrelationId,
  parseInternalId,
  parseRequestId,
  parseUtcTimestamp,
  type InternalId,
  type JsonObject,
  type OperationContext,
  type UtcTimestamp,
} from "../../platform/primitives";
import type { GovernanceScope } from "./model";
import {
  type ApprovalRequest,
  type ApprovalStatus,
  type GovernanceMutationResult,
  type Hold,
  type HoldStatus,
  type ResourceReference,
} from "./model";

interface MutationRow {
  record_id: string;
  replayed: boolean;
  current_status: string;
}

interface ApprovalRequestRow {
  id: string;
  resource_type: string;
  resource_id: string;
  requested_action: string;
  policy_code: string;
  requester_user_id: string;
  requested_at: Date | string;
  organisation_id: string;
  legal_entity_id: string | null;
  site_id: string | null;
  status: string;
  required_approval_count: number;
  require_distinct_humans: boolean;
  self_approval_allowed: boolean;
  required_capability_codes: string[];
  request_capability_code: string;
  request_id: string;
  command_id: string;
  correlation_id: string;
  causation_id: string | null;
  version: string | number | bigint;
}

interface HoldRow {
  id: string;
  resource_type: string;
  resource_id: string;
  hold_type: string;
  blocked_action: string | null;
  reason: string;
  placed_by_user_id: string;
  placed_at: Date | string;
  organisation_id: string;
  legal_entity_id: string | null;
  site_id: string | null;
  status: string;
  release_capability_code: string;
  release_requires_approval: boolean;
  released_by_user_id: string | null;
  released_at: Date | string | null;
  release_reason: string | null;
  release_approval_request_id: string | null;
  placement_capability_code: string;
  version: string | number | bigint;
}

function operationFromRow(row: ApprovalRequestRow): Readonly<OperationContext> {
  return Object.freeze({
    requestId: parseRequestId(row.request_id),
    commandId: parseCommandId(row.command_id),
    correlationId: parseCorrelationId(row.correlation_id),
    causationId: row.causation_id ? parseCausationId(row.causation_id) : undefined,
  });
}

function scopeFromRow(row: {
  organisation_id: string;
  legal_entity_id: string | null;
  site_id: string | null;
}): Readonly<GovernanceScope> {
  return Object.freeze({
    organisationId: parseInternalId(row.organisation_id),
    legalEntityId: row.legal_entity_id
      ? parseInternalId(row.legal_entity_id)
      : undefined,
    siteId: row.site_id ? parseInternalId(row.site_id) : undefined,
  });
}

function approvalRequestFromRow(row: ApprovalRequestRow): ApprovalRequest {
  return Object.freeze({
    id: parseInternalId(row.id),
    resource: Object.freeze({
      type: row.resource_type,
      id: parseInternalId(row.resource_id),
    }),
    requestedAction: row.requested_action,
    policyCode: row.policy_code,
    requesterUserId: parseInternalId(row.requester_user_id),
    requestedAt: parseUtcTimestamp(new Date(row.requested_at).toISOString()),
    scope: scopeFromRow(row),
    status: row.status as ApprovalStatus,
    requiredApprovalCount: Number(row.required_approval_count),
    requireDistinctHumans: row.require_distinct_humans,
    selfApprovalAllowed: row.self_approval_allowed,
    requiredCapabilityCodes: Object.freeze([...row.required_capability_codes]),
    requestCapabilityCode: row.request_capability_code,
    operation: operationFromRow(row),
    version: Number(row.version),
  });
}

function holdFromRow(row: HoldRow): Hold {
  return Object.freeze({
    id: parseInternalId(row.id),
    resource: Object.freeze({
      type: row.resource_type,
      id: parseInternalId(row.resource_id),
    }),
    holdType: row.hold_type,
    blockedAction: row.blocked_action ?? undefined,
    reason: row.reason,
    placedByUserId: parseInternalId(row.placed_by_user_id),
    placedAt: parseUtcTimestamp(new Date(row.placed_at).toISOString()),
    scope: scopeFromRow(row),
    status: row.status as HoldStatus,
    releaseCapabilityCode: row.release_capability_code,
    releaseRequiresApproval: row.release_requires_approval,
    placementCapabilityCode: row.placement_capability_code,
    releasedByUserId: row.released_by_user_id
      ? parseInternalId(row.released_by_user_id)
      : undefined,
    releasedAt: row.released_at
      ? parseUtcTimestamp(new Date(row.released_at).toISOString())
      : undefined,
    releaseReason: row.release_reason ?? undefined,
    releaseApprovalRequestId: row.release_approval_request_id
      ? parseInternalId(row.release_approval_request_id)
      : undefined,
    version: Number(row.version),
  });
}

function mutationResult(row: MutationRow | undefined): GovernanceMutationResult {
  if (!row) throw new Error("Governance database operation returned no result.");
  return Object.freeze({
    id: parseInternalId(row.record_id),
    replayed: row.replayed,
    status: row.current_status,
  });
}

export class GovernanceRepository extends TransactionalRepository<DB> {
  constructor(transaction: Transaction<DB>) {
    super(transaction);
  }

  async appendHumanAudit(input: {
    id: InternalId;
    authorizingCapability: string;
    eventType: string;
    eventVersion: number;
    recordedAt: UtcTimestamp;
    occurredAt: UtcTimestamp;
    operation: Readonly<OperationContext>;
    scope: Readonly<GovernanceScope>;
    resource: Readonly<ResourceReference>;
    action: string;
    outcome: string;
    metadata: Readonly<JsonObject>;
    sourceModule: string;
    reason?: string;
  }): Promise<InternalId> {
    const result = await sql<{ id: string }>`
      select governance.append_human_audit_event(
        ${input.id}::uuid,
        ${input.authorizingCapability},
        ${input.eventType},
        ${input.eventVersion},
        ${input.recordedAt}::timestamptz,
        ${input.occurredAt}::timestamptz,
        ${input.operation.requestId},
        ${input.operation.commandId}::uuid,
        ${input.operation.correlationId}::uuid,
        ${input.operation.causationId ?? null}::uuid,
        ${input.scope.organisationId}::uuid,
        ${input.scope.legalEntityId ?? null}::uuid,
        ${input.scope.siteId ?? null}::uuid,
        ${input.resource.type},
        ${input.resource.id}::uuid,
        ${input.action},
        ${input.outcome},
        ${JSON.stringify(input.metadata)}::jsonb,
        ${input.sourceModule},
        ${input.reason ?? null}
      ) as id
    `.execute(this.transaction);
    return parseInternalId(result.rows[0]!.id);
  }

  async appendSystemAudit(input: {
    id: InternalId;
    actorType: "SERVICE" | "SYSTEM" | "MIGRATION";
    actorId: string;
    eventType: string;
    eventVersion: number;
    recordedAt: UtcTimestamp;
    occurredAt: UtcTimestamp;
    operation: Readonly<OperationContext>;
    scope: Readonly<GovernanceScope>;
    resource: Readonly<ResourceReference>;
    action: string;
    outcome: string;
    metadata: Readonly<JsonObject>;
    sourceModule: string;
    reason?: string;
  }): Promise<InternalId> {
    const result = await sql<{ id: string }>`
      select governance.append_system_audit_event(
        ${input.id}::uuid,
        ${input.actorType},
        ${input.actorId},
        ${input.eventType},
        ${input.eventVersion},
        ${input.recordedAt}::timestamptz,
        ${input.occurredAt}::timestamptz,
        ${input.operation.requestId},
        ${input.operation.commandId}::uuid,
        ${input.operation.correlationId}::uuid,
        ${input.operation.causationId ?? null}::uuid,
        ${input.scope.organisationId}::uuid,
        ${input.scope.legalEntityId ?? null}::uuid,
        ${input.scope.siteId ?? null}::uuid,
        ${input.resource.type},
        ${input.resource.id}::uuid,
        ${input.action},
        ${input.outcome},
        ${JSON.stringify(input.metadata)}::jsonb,
        ${input.sourceModule},
        ${input.reason ?? null}
      ) as id
    `.execute(this.transaction);
    return parseInternalId(result.rows[0]!.id);
  }

  async createApprovalRequest(input: {
    id: InternalId;
    resource: Readonly<ResourceReference>;
    requestedAction: string;
    policyCode: string;
    requestedAt: UtcTimestamp;
    scope: Readonly<GovernanceScope>;
    requiredApprovalCount: number;
    requireDistinctHumans: boolean;
    selfApprovalAllowed: boolean;
    requiredCapabilityCodes: readonly string[];
    requestCapabilityCode: string;
    operation: Readonly<OperationContext>;
  }): Promise<GovernanceMutationResult> {
    const result = await sql<MutationRow>`
      select * from governance.create_approval_request(
        ${input.id}::uuid,
        ${input.resource.type},
        ${input.resource.id}::uuid,
        ${input.requestedAction},
        ${input.policyCode},
        ${input.requestedAt}::timestamptz,
        ${input.scope.organisationId}::uuid,
        ${input.scope.legalEntityId ?? null}::uuid,
        ${input.scope.siteId ?? null}::uuid,
        ${input.requiredApprovalCount}::smallint,
        ${input.requireDistinctHumans},
        ${input.selfApprovalAllowed},
        ${[...input.requiredCapabilityCodes]}::text[],
        ${input.requestCapabilityCode},
        ${input.operation.requestId},
        ${input.operation.commandId}::uuid,
        ${input.operation.correlationId}::uuid,
        ${input.operation.causationId ?? null}::uuid
      )
    `.execute(this.transaction);
    return mutationResult(result.rows[0]);
  }

  async findApprovalRequest(id: InternalId): Promise<ApprovalRequest | undefined> {
    const result = await sql<ApprovalRequestRow>`
      select *
      from governance.approval_request
      where id = ${id}::uuid
    `.execute(this.transaction);
    const row = result.rows[0];
    return row ? approvalRequestFromRow(row) : undefined;
  }

  async decideApproval(input: {
    decisionId: InternalId;
    approvalRequestId: InternalId;
    decision: "APPROVE" | "REJECT";
    capabilityCode: string;
    decidedAt: UtcTimestamp;
    reason?: string;
    operation: Readonly<OperationContext>;
  }): Promise<GovernanceMutationResult> {
    const result = await sql<MutationRow>`
      select * from governance.decide_approval(
        ${input.decisionId}::uuid,
        ${input.approvalRequestId}::uuid,
        ${input.decision},
        ${input.capabilityCode},
        ${input.decidedAt}::timestamptz,
        ${input.reason ?? null},
        ${input.operation.requestId},
        ${input.operation.commandId}::uuid,
        ${input.operation.correlationId}::uuid,
        ${input.operation.causationId ?? null}::uuid
      )
    `.execute(this.transaction);
    return mutationResult(result.rows[0]);
  }

  async placeHold(input: {
    holdId: InternalId;
    actionId: InternalId;
    resource: Readonly<ResourceReference>;
    holdType: string;
    blockedAction?: string;
    reason: string;
    placedAt: UtcTimestamp;
    scope: Readonly<GovernanceScope>;
    placementCapabilityCode: string;
    releaseCapabilityCode: string;
    releaseRequiresApproval: boolean;
    operation: Readonly<OperationContext>;
  }): Promise<GovernanceMutationResult> {
    const result = await sql<MutationRow>`
      select * from governance.place_hold(
        ${input.holdId}::uuid,
        ${input.actionId}::uuid,
        ${input.resource.type},
        ${input.resource.id}::uuid,
        ${input.holdType},
        ${input.blockedAction ?? null},
        ${input.reason},
        ${input.placedAt}::timestamptz,
        ${input.scope.organisationId}::uuid,
        ${input.scope.legalEntityId ?? null}::uuid,
        ${input.scope.siteId ?? null}::uuid,
        ${input.placementCapabilityCode},
        ${input.releaseCapabilityCode},
        ${input.releaseRequiresApproval},
        ${input.operation.requestId},
        ${input.operation.commandId}::uuid,
        ${input.operation.correlationId}::uuid,
        ${input.operation.causationId ?? null}::uuid
      )
    `.execute(this.transaction);
    return mutationResult(result.rows[0]);
  }

  async findHold(id: InternalId): Promise<Hold | undefined> {
    const result = await sql<HoldRow>`
      select *
      from governance.hold
      where id = ${id}::uuid
    `.execute(this.transaction);
    const row = result.rows[0];
    return row ? holdFromRow(row) : undefined;
  }

  async releaseHold(input: {
    actionId: InternalId;
    holdId: InternalId;
    releasedAt: UtcTimestamp;
    reason: string;
    approvalRequestId?: InternalId;
    operation: Readonly<OperationContext>;
  }): Promise<GovernanceMutationResult> {
    const result = await sql<MutationRow>`
      select * from governance.release_hold(
        ${input.actionId}::uuid,
        ${input.holdId}::uuid,
        ${input.releasedAt}::timestamptz,
        ${input.reason},
        ${input.approvalRequestId ?? null}::uuid,
        ${input.operation.requestId},
        ${input.operation.commandId}::uuid,
        ${input.operation.correlationId}::uuid,
        ${input.operation.causationId ?? null}::uuid
      )
    `.execute(this.transaction);
    return mutationResult(result.rows[0]);
  }

  async hasBlockingHold(input: {
    scope: Readonly<GovernanceScope>;
    resource: Readonly<ResourceReference>;
    action: string;
  }): Promise<boolean> {
    const result = await sql<{ blocked: boolean }>`
      select governance.has_blocking_hold(
        ${input.scope.organisationId}::uuid,
        ${input.scope.legalEntityId ?? null}::uuid,
        ${input.scope.siteId ?? null}::uuid,
        ${input.resource.type},
        ${input.resource.id}::uuid,
        ${input.action}
      ) as blocked
    `.execute(this.transaction);
    return result.rows[0]?.blocked === true;
  }
}

export const governanceRepository = (transaction: Transaction<DB>) =>
  new GovernanceRepository(transaction);

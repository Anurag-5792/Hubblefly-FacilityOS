import "server-only";

import type { DB } from "../../platform/db/kysely.types";
import { createDatabaseSecurityContext } from "../../platform/db/security-context";
import type { UnitOfWork, UnitOfWorkManager } from "../../platform/db/unit-of-work";
import {
  type ActorContext,
  type Clock,
  type InternalId,
  type InternalIdFactory,
  type JsonObject,
  type OperationContext,
  type UtcTimestamp,
} from "../../platform/primitives";
import {
  AuthorizationService,
  type AuthenticatedUser,
  type AuthorizationScope,
} from "../iam";
import {
  BlockingHoldError,
  GovernancePolicyError,
  GovernanceRecordNotFoundError,
} from "./errors";
import {
  assertSafeAuditMetadata,
  createResourceReference,
  parseGovernanceCode,
  type ApprovalDecisionValue,
  type ApprovalRequest,
  type GovernanceMutationResult,
  type GovernanceScope,
  type Hold,
  type ResourceReference,
} from "./model";
import { governanceRepository } from "./repository";

function securityContext(user: Readonly<AuthenticatedUser>) {
  return createDatabaseSecurityContext({
    authUserId: user.authUserId,
    requestId: user.operation.requestId,
    correlationId: user.operation.correlationId,
  });
}

async function requireDirectCapability(
  authorization: AuthorizationService,
  uow: UnitOfWork<DB>,
  input: {
    user: Readonly<AuthenticatedUser>;
    capability: string;
    scope: Readonly<AuthorizationScope>;
    resourceContext?: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  const decision = await authorization.requireWithin(uow, input);
  if (decision.viaSuperuser) {
    throw new GovernancePolicyError(
      `Explicit capability ${input.capability} is required; platform.superuser is not sufficient for this governed action.`,
      "EXPLICIT_GOVERNANCE_CAPABILITY_REQUIRED",
    );
  }
}

export interface HumanAuditInput {
  readonly authorizingCapability: string;
  readonly eventType: string;
  readonly eventVersion?: number;
  readonly occurredAt?: UtcTimestamp;
  readonly scope: Readonly<GovernanceScope>;
  readonly resource: Readonly<ResourceReference>;
  readonly action: string;
  readonly outcome: string;
  readonly metadata?: Readonly<JsonObject>;
  readonly sourceModule: string;
  readonly reason?: string;
}

export class AuditRecorder {
  constructor(
    private readonly unitOfWork: UnitOfWorkManager<DB>,
    private readonly authorization: AuthorizationService,
    private readonly clock: Clock,
    private readonly ids: InternalIdFactory,
  ) {}

  async recordHuman(
    user: Readonly<AuthenticatedUser>,
    input: HumanAuditInput,
  ): Promise<InternalId> {
    return await this.unitOfWork.withRlsTransaction(
      securityContext(user),
      async (uow) => await this.appendHumanWithin(uow, user, input),
    );
  }

  async appendHumanWithin(
    uow: UnitOfWork<DB>,
    user: Readonly<AuthenticatedUser>,
    input: HumanAuditInput,
  ): Promise<InternalId> {
    const metadata = input.metadata ?? {};
    assertSafeAuditMetadata(metadata);
    const authorizingCapability = parseGovernanceCode(
      input.authorizingCapability,
      "Authorizing capability",
    );

    await requireDirectCapability(this.authorization, uow, {
      user,
      capability: authorizingCapability,
      scope: input.scope,
      resourceContext: {
        resourceType: input.resource.type,
        resourceId: input.resource.id,
      },
    });

    const at = this.clock.nowUtc();
    return await uow.repository(governanceRepository).appendHumanAudit({
      id: this.ids.next(),
      authorizingCapability,
      eventType: parseGovernanceCode(input.eventType, "Audit event type"),
      eventVersion: input.eventVersion ?? 1,
      recordedAt: at,
      occurredAt: input.occurredAt ?? at,
      operation: user.operation,
      scope: input.scope,
      resource: createResourceReference(input.resource.type, input.resource.id),
      action: parseGovernanceCode(input.action, "Audit action"),
      outcome: parseGovernanceCode(input.outcome, "Audit outcome"),
      metadata,
      sourceModule: parseGovernanceCode(input.sourceModule, "Audit source module"),
      reason: input.reason,
    });
  }

  async appendSystemWithin(
    uow: UnitOfWork<DB>,
    input: {
      actor: Readonly<ActorContext> & {
        readonly actorType: "SERVICE" | "SYSTEM" | "MIGRATION";
      };
      operation: Readonly<OperationContext>;
      eventType: string;
      eventVersion?: number;
      occurredAt?: UtcTimestamp;
      scope: Readonly<GovernanceScope>;
      resource: Readonly<ResourceReference>;
      action: string;
      outcome: string;
      metadata?: Readonly<JsonObject>;
      sourceModule: string;
      reason?: string;
    },
  ): Promise<InternalId> {
    const metadata = input.metadata ?? {};
    assertSafeAuditMetadata(metadata);
    const at = this.clock.nowUtc();

    return await uow.repository(governanceRepository).appendSystemAudit({
      id: this.ids.next(),
      actorType: input.actor.actorType,
      actorId: input.actor.actorId,
      eventType: parseGovernanceCode(input.eventType, "Audit event type"),
      eventVersion: input.eventVersion ?? 1,
      recordedAt: at,
      occurredAt: input.occurredAt ?? at,
      operation: input.operation,
      scope: input.scope,
      resource: createResourceReference(input.resource.type, input.resource.id),
      action: parseGovernanceCode(input.action, "Audit action"),
      outcome: parseGovernanceCode(input.outcome, "Audit outcome"),
      metadata,
      sourceModule: parseGovernanceCode(input.sourceModule, "Audit source module"),
      reason: input.reason,
    });
  }
}

export class ApprovalService {
  constructor(
    private readonly unitOfWork: UnitOfWorkManager<DB>,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
    private readonly ids: InternalIdFactory,
  ) {}

  async request(
    user: Readonly<AuthenticatedUser>,
    input: {
      resource: Readonly<ResourceReference>;
      requestedAction: string;
      policyCode: string;
      scope: Readonly<GovernanceScope>;
      requiredApprovalCount: number;
      requireDistinctHumans: boolean;
      selfApprovalAllowed: boolean;
      requiredCapabilityCodes: readonly string[];
      requestCapabilityCode?: string;
    },
  ): Promise<GovernanceMutationResult> {
    const requestCapabilityCode = parseGovernanceCode(
      input.requestCapabilityCode ?? "governance.approval.request",
      "Approval request capability",
    );
    const requiredCapabilityCodes = Object.freeze(
      input.requiredCapabilityCodes.map((code) =>
        parseGovernanceCode(code, "Required approval capability"),
      ),
    );
    if (
      !Number.isSafeInteger(input.requiredApprovalCount) ||
      input.requiredApprovalCount < 1 ||
      input.requiredApprovalCount > 8
    ) {
      throw new TypeError("Required approval count must be an integer from 1 to 8.");
    }
    if (
      requiredCapabilityCodes.length < 1 ||
      requiredCapabilityCodes.length > 8 ||
      new Set(requiredCapabilityCodes).size !== requiredCapabilityCodes.length ||
      input.requiredApprovalCount < requiredCapabilityCodes.length
    ) {
      throw new TypeError(
        "Approval policy must define 1-8 unique capabilities covered by the required approval count.",
      );
    }

    return await this.unitOfWork.withRlsTransaction(
      securityContext(user),
      async (uow) => {
        await requireDirectCapability(this.authorization, uow, {
          user,
          capability: requestCapabilityCode,
          scope: input.scope,
        });

        const result = await uow.repository(governanceRepository).createApprovalRequest({
          id: this.ids.next(),
          resource: createResourceReference(input.resource.type, input.resource.id),
          requestedAction: parseGovernanceCode(input.requestedAction, "Requested action"),
          policyCode: parseGovernanceCode(input.policyCode, "Approval policy code"),
          requestedAt: this.clock.nowUtc(),
          scope: input.scope,
          requiredApprovalCount: input.requiredApprovalCount,
          requireDistinctHumans: input.requireDistinctHumans,
          selfApprovalAllowed: input.selfApprovalAllowed,
          requiredCapabilityCodes,
          requestCapabilityCode,
          operation: user.operation,
        });

        if (!result.replayed) {
          await this.audit.appendHumanWithin(uow, user, {
            authorizingCapability: requestCapabilityCode,
            eventType: "governance.approval.requested",
            scope: input.scope,
            resource: input.resource,
            action: "APPROVAL_REQUESTED",
            outcome: "PENDING",
            sourceModule: "governance.approval",
            metadata: {
              approvalRequestId: result.id,
              policyCode: input.policyCode,
              requiredApprovalCount: input.requiredApprovalCount,
              requireDistinctHumans: input.requireDistinctHumans,
              selfApprovalAllowed: input.selfApprovalAllowed,
              requiredCapabilityCodes: [...requiredCapabilityCodes],
            },
          });
        }

        return result;
      },
    );
  }

  async decide(
    user: Readonly<AuthenticatedUser>,
    input: {
      approvalRequestId: InternalId;
      decision: ApprovalDecisionValue;
      capabilityCode: string;
      reason?: string;
    },
  ): Promise<GovernanceMutationResult> {
    const capabilityCode = parseGovernanceCode(
      input.capabilityCode,
      "Approval decision capability",
    );

    return await this.unitOfWork.withRlsTransaction(
      securityContext(user),
      async (uow) => {
        const repository = uow.repository(governanceRepository);
        const request = await repository.findApprovalRequest(input.approvalRequestId);
        if (!request) throw new GovernanceRecordNotFoundError("Approval request");

        await requireDirectCapability(this.authorization, uow, {
          user,
          capability: capabilityCode,
          scope: request.scope,
          resourceContext: {
            approvalRequestId: request.id,
            requestedAction: request.requestedAction,
          },
        });

        const result = await repository.decideApproval({
          decisionId: this.ids.next(),
          approvalRequestId: input.approvalRequestId,
          decision: input.decision,
          capabilityCode,
          decidedAt: this.clock.nowUtc(),
          reason: input.reason,
          operation: user.operation,
        });

        if (!result.replayed) {
          await this.audit.appendHumanWithin(uow, user, {
            authorizingCapability: capabilityCode,
            eventType: "governance.approval.decision",
            scope: request.scope,
            resource: request.resource,
            action: input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
            outcome: result.status,
            sourceModule: "governance.approval",
            reason: input.reason,
            metadata: {
              approvalRequestId: request.id,
              approvalDecisionId: result.id,
              policyCode: request.policyCode,
              capabilityCode,
            },
          });
        }

        return result;
      },
    );
  }
}

export class HoldService {
  constructor(
    private readonly unitOfWork: UnitOfWorkManager<DB>,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
    private readonly ids: InternalIdFactory,
  ) {}

  async place(
    user: Readonly<AuthenticatedUser>,
    input: {
      resource: Readonly<ResourceReference>;
      holdType: string;
      blockedAction?: string;
      reason: string;
      scope: Readonly<GovernanceScope>;
      placementCapabilityCode?: string;
      releaseCapabilityCode?: string;
      releaseRequiresApproval?: boolean;
    },
  ): Promise<GovernanceMutationResult> {
    const placementCapabilityCode = parseGovernanceCode(
      input.placementCapabilityCode ?? "governance.hold.place",
      "Hold placement capability",
    );
    const releaseCapabilityCode = parseGovernanceCode(
      input.releaseCapabilityCode ?? "governance.hold.release",
      "Hold release capability",
    );

    return await this.unitOfWork.withRlsTransaction(
      securityContext(user),
      async (uow) => {
        await requireDirectCapability(this.authorization, uow, {
          user,
          capability: placementCapabilityCode,
          scope: input.scope,
        });
        const result = await uow.repository(governanceRepository).placeHold({
          holdId: this.ids.next(),
          actionId: this.ids.next(),
          resource: createResourceReference(input.resource.type, input.resource.id),
          holdType: parseGovernanceCode(input.holdType, "Hold type"),
          blockedAction: input.blockedAction
            ? parseGovernanceCode(input.blockedAction, "Blocked action")
            : undefined,
          reason: input.reason,
          placedAt: this.clock.nowUtc(),
          scope: input.scope,
          placementCapabilityCode,
          releaseCapabilityCode,
          releaseRequiresApproval: input.releaseRequiresApproval ?? false,
          operation: user.operation,
        });

        if (!result.replayed) {
          await this.audit.appendHumanWithin(uow, user, {
            authorizingCapability: placementCapabilityCode,
            eventType: "governance.hold.placed",
            scope: input.scope,
            resource: input.resource,
            action: "HOLD_PLACED",
            outcome: "ACTIVE",
            sourceModule: "governance.hold",
            reason: input.reason,
            metadata: {
              holdId: result.id,
              holdType: input.holdType,
              blockedAction: input.blockedAction ?? null,
              releaseCapabilityCode,
              releaseRequiresApproval: input.releaseRequiresApproval ?? false,
            },
          });
        }

        return result;
      },
    );
  }

  async release(
    user: Readonly<AuthenticatedUser>,
    input: {
      holdId: InternalId;
      reason: string;
      approvalRequestId?: InternalId;
    },
  ): Promise<GovernanceMutationResult> {
    return await this.unitOfWork.withRlsTransaction(
      securityContext(user),
      async (uow) => {
        const repository = uow.repository(governanceRepository);
        const hold = await repository.findHold(input.holdId);
        if (!hold) throw new GovernanceRecordNotFoundError("Hold");

        await requireDirectCapability(this.authorization, uow, {
          user,
          capability: hold.releaseCapabilityCode,
          scope: hold.scope,
          resourceContext: { holdId: hold.id, holdType: hold.holdType },
        });

        const result = await repository.releaseHold({
          actionId: this.ids.next(),
          holdId: input.holdId,
          releasedAt: this.clock.nowUtc(),
          reason: input.reason,
          approvalRequestId: input.approvalRequestId,
          operation: user.operation,
        });

        if (!result.replayed) {
          await this.audit.appendHumanWithin(uow, user, {
            authorizingCapability: hold.releaseCapabilityCode,
            eventType: "governance.hold.released",
            scope: hold.scope,
            resource: hold.resource,
            action: "HOLD_RELEASED",
            outcome: "RELEASED",
            sourceModule: "governance.hold",
            reason: input.reason,
            metadata: {
              holdId: hold.id,
              holdType: hold.holdType,
              approvalRequestId: input.approvalRequestId ?? null,
            },
          });
        }

        return result;
      },
    );
  }

  async requireNoBlockingHoldWithin(
    uow: UnitOfWork<DB>,
    input: {
      scope: Readonly<GovernanceScope>;
      resource: Readonly<ResourceReference>;
      action: string;
    },
  ): Promise<void> {
    const blocked = await uow.repository(governanceRepository).hasBlockingHold({
      scope: input.scope,
      resource: createResourceReference(input.resource.type, input.resource.id),
      action: parseGovernanceCode(input.action, "Protected action"),
    });
    if (blocked) throw new BlockingHoldError();
  }
}

export class GovernancePolicyService {
  constructor(private readonly holds: HoldService) {}

  async requireNoBlockingHoldWithin(
    uow: UnitOfWork<DB>,
    input: {
      scope: Readonly<GovernanceScope>;
      resource: Readonly<ResourceReference>;
      action: string;
    },
  ): Promise<void> {
    await this.holds.requireNoBlockingHoldWithin(uow, input);
  }
}

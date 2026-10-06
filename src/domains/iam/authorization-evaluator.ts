import type { AuthenticatedUser } from "./authenticated-user";
import {
  SUPERUSER_CAPABILITY,
  scopeMatches,
  type AuthorizationDecision,
  type AuthorizationDenialReason,
  type AuthorizationScope,
  type Capability,
  type Role,
  type RoleAssignment,
  type RoleCapability,
} from "./authorization-model";
import type { UserProfileStatus } from "./model";
import type { UtcTimestamp } from "../../platform/primitives";

export interface LoadedRoleAssignment {
  readonly assignment: RoleAssignment;
  readonly role?: Role;
  readonly grants: readonly {
    readonly mapping: RoleCapability;
    readonly capability?: Capability;
  }[];
}

export interface AuthorizationEvaluationState {
  readonly profileStatus?: UserProfileStatus;
  readonly requestedCapability?: Capability;
  readonly scopeValid: boolean;
  readonly assignments: readonly LoadedRoleAssignment[];
}

export interface AuthorizationPolicyContext {
  readonly user: Readonly<AuthenticatedUser>;
  readonly requestedCapability: Capability;
  readonly requestedScope: Readonly<AuthorizationScope>;
  readonly matchingAssignments: readonly LoadedRoleAssignment[];
  readonly evaluatedAt: UtcTimestamp;
  readonly resourceContext?: Readonly<Record<string, unknown>>;
}

export interface AuthorizationDenyPolicy {
  evaluate(context: AuthorizationPolicyContext): AuthorizationDenialReason | undefined;
}

function denied(input: {
  user?: Readonly<AuthenticatedUser>;
  capability: string;
  scope: Readonly<AuthorizationScope>;
  at: UtcTimestamp;
  reason: AuthorizationDenialReason;
}): AuthorizationDecision {
  return Object.freeze({
    outcome: "DENY" as const,
    allowed: false,
    requestedCapability: input.capability,
    evaluatedUserId: input.user?.facilityUserId,
    requestedScope: input.scope,
    matchingAssignmentIds: Object.freeze([]),
    viaSuperuser: false,
    denialReason: input.reason,
    evaluatedAt: input.at,
  });
}

export function evaluateAuthorization(input: {
  user?: Readonly<AuthenticatedUser>;
  capability: string;
  scope: Readonly<AuthorizationScope>;
  evaluatedAt: UtcTimestamp;
  state: Readonly<AuthorizationEvaluationState>;
  policies?: readonly AuthorizationDenyPolicy[];
  resourceContext?: Readonly<Record<string, unknown>>;
}): AuthorizationDecision {
  const { user, capability, scope, evaluatedAt, state } = input;

  if (!user) {
    return denied({ user, capability, scope, at: evaluatedAt, reason: "UNAUTHENTICATED" });
  }

  if (user.actor.actorType !== "HUMAN" || user.actor.actorId !== user.facilityUserId) {
    return denied({ user, capability, scope, at: evaluatedAt, reason: "IDENTITY_MISMATCH" });
  }

  if (state.profileStatus === undefined) {
    return denied({ user, capability, scope, at: evaluatedAt, reason: "USER_NOT_PROVISIONED" });
  }

  if (state.profileStatus !== "ACTIVE") {
    return denied({ user, capability, scope, at: evaluatedAt, reason: "USER_INACTIVE" });
  }

  if (!state.requestedCapability) {
    return denied({ user, capability, scope, at: evaluatedAt, reason: "UNKNOWN_CAPABILITY" });
  }

  if (state.requestedCapability.status !== "ACTIVE") {
    return denied({ user, capability, scope, at: evaluatedAt, reason: "CAPABILITY_INACTIVE" });
  }

  if (!state.scopeValid) {
    return denied({ user, capability, scope, at: evaluatedAt, reason: "SCOPE_INVALID" });
  }

  if (state.assignments.length === 0) {
    return denied({ user, capability, scope, at: evaluatedAt, reason: "NO_ASSIGNMENT" });
  }

  const observedReasons: AuthorizationDenialReason[] = [];
  const matching: LoadedRoleAssignment[] = [];
  let viaSuperuser = false;

  for (const candidate of state.assignments) {
    const assignment = candidate.assignment;

    if (assignment.status !== "ACTIVE") {
      observedReasons.push("ASSIGNMENT_INACTIVE");
      continue;
    }
    if (evaluatedAt < assignment.validFrom) {
      observedReasons.push("ASSIGNMENT_NOT_YET_VALID");
      continue;
    }
    if (assignment.validUntil && evaluatedAt >= assignment.validUntil) {
      observedReasons.push("ASSIGNMENT_EXPIRED");
      continue;
    }
    if (!scopeMatches(assignment, scope)) {
      observedReasons.push("SCOPE_MISMATCH");
      continue;
    }
    if (!candidate.role || candidate.role.status !== "ACTIVE") {
      observedReasons.push("ROLE_INACTIVE");
      continue;
    }

    const direct = candidate.grants.some(
      ({ mapping, capability: granted }) =>
        mapping.status === "ACTIVE" &&
        granted?.status === "ACTIVE" &&
        granted.code === state.requestedCapability?.code,
    );
    const superuser = candidate.grants.some(
      ({ mapping, capability: granted }) =>
        mapping.status === "ACTIVE" &&
        granted?.status === "ACTIVE" &&
        granted.code === SUPERUSER_CAPABILITY,
    );

    if (!direct && !superuser) {
      observedReasons.push("CAPABILITY_NOT_GRANTED");
      continue;
    }

    matching.push(candidate);
    viaSuperuser ||= superuser && !direct;
  }

  if (matching.length === 0) {
    const precedence: AuthorizationDenialReason[] = [
      "ASSIGNMENT_INACTIVE",
      "ASSIGNMENT_NOT_YET_VALID",
      "ASSIGNMENT_EXPIRED",
      "SCOPE_MISMATCH",
      "ROLE_INACTIVE",
      "CAPABILITY_NOT_GRANTED",
    ];
    const reason =
      precedence.find((candidate) => observedReasons.includes(candidate)) ??
      "CAPABILITY_NOT_GRANTED";
    return denied({ user, capability, scope, at: evaluatedAt, reason });
  }

  const distinctAssignmentIds = Object.freeze([
    ...new Set(matching.map(({ assignment }) => assignment.id)),
  ]);

  const policyContext: AuthorizationPolicyContext = Object.freeze({
    user,
    requestedCapability: state.requestedCapability,
    requestedScope: scope,
    matchingAssignments: Object.freeze([...matching]),
    evaluatedAt,
    resourceContext: input.resourceContext,
  });

  for (const policy of input.policies ?? []) {
    const reason = policy.evaluate(policyContext);
    if (reason) {
      return Object.freeze({
        outcome: "DENY" as const,
        allowed: false,
        requestedCapability: capability,
        evaluatedUserId: user.facilityUserId,
        requestedScope: scope,
        matchingAssignmentIds: distinctAssignmentIds,
        viaSuperuser,
        denialReason: reason,
        evaluatedAt,
      });
    }
  }

  return Object.freeze({
    outcome: "ALLOW" as const,
    allowed: true,
    requestedCapability: capability,
    evaluatedUserId: user.facilityUserId,
    requestedScope: scope,
    matchingAssignmentIds: distinctAssignmentIds,
    viaSuperuser,
    evaluatedAt,
  });
}

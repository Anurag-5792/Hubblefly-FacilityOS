import { describe, expect, it } from "vitest";

import type { AuthenticatedUser, UserProfileStatus } from "../../../src/domains/iam";
import {
  SUPERUSER_CAPABILITY,
  areDistinctHumans,
  evaluateAuthorization,
  isSameHuman,
  parseCapabilityCode,
  parseRoleCode,
  scopeMatches,
  type AuthorizationDenyPolicy,
  type AuthorizationEvaluationState,
  type AuthorizationScope,
  type Capability,
  type LoadedRoleAssignment,
  type Role,
  type RoleAssignment,
  type RoleCapability,
} from "../../../src/domains/iam";
import {
  createOperationContext,
  parseActorContext,
  parseAggregateVersion,
  parseCommandId,
  parseCorrelationId,
  parseInternalId,
  parseRequestId,
  parseUtcTimestamp,
} from "../../../src/platform/primitives";

const at = parseUtcTimestamp("2026-10-07T00:00:00.000Z");
const earlier = parseUtcTimestamp("2026-10-06T00:00:00.000Z");
const later = parseUtcTimestamp("2026-10-08T00:00:00.000Z");
const orgA = parseInternalId("018f47b0-9b6d-7a30-8f6a-b0cc55d33a01");
const orgB = parseInternalId("018f47b0-9b6d-7a30-8f6a-b0cc55d33a02");
const legalA = parseInternalId("018f47b0-9b6d-7a30-8f6a-b0cc55d33a03");
const legalB = parseInternalId("018f47b0-9b6d-7a30-8f6a-b0cc55d33a04");
const siteA = parseInternalId("018f47b0-9b6d-7a30-8f6a-b0cc55d33a05");
const userId = parseInternalId("018f47b0-9b6d-7a30-8f6a-b0cc55d33a06");

const operation = createOperationContext({
  requestId: parseRequestId("req-w0-07-unit"),
  commandId: parseCommandId("123e4567-e89b-42d3-a456-426614174070"),
  correlationId: parseCorrelationId("123e4567-e89b-42d3-a456-426614174071"),
});

const user: AuthenticatedUser = {
  facilityUserId: userId,
  authUserId: "123e4567-e89b-42d3-a456-426614174072" as never,
  displayName: "W0-07 User",
  status: "ACTIVE",
  actor: parseActorContext({
    actorType: "HUMAN",
    actorId: userId,
    requestId: operation.requestId,
  }),
  operation,
};

function capability(
  code = "inventory.physical_count.view",
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
  idSuffix = "10",
): Capability {
  return {
    id: parseInternalId(`018f47b0-9b6d-7a30-8f6a-b0cc55d33a${idSuffix}`),
    code: parseCapabilityCode(code),
    displayName: code,
    kind: "SYSTEM",
    status,
    version: parseAggregateVersion(0),
    createdAt: earlier,
    updatedAt: earlier,
  };
}

function role(
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
  idSuffix = "20",
): Role {
  return {
    id: parseInternalId(`018f47b0-9b6d-7a30-8f6a-b0cc55d33a${idSuffix}`),
    code: parseRoleCode(`ROLE_${idSuffix}`),
    displayName: `Role ${idSuffix}`,
    kind: "CUSTOM",
    status,
    version: parseAggregateVersion(0),
    createdAt: earlier,
    updatedAt: earlier,
  };
}

function assignment(
  input: Partial<RoleAssignment> & {
    roleId: Role["id"];
    idSuffix?: string;
  },
): RoleAssignment {
  return {
    id: parseInternalId(
      `018f47b0-9b6d-7a30-8f6a-b0cc55d33a${input.idSuffix ?? "30"}`,
    ),
    userProfileId: userId,
    roleId: input.roleId,
    organisationId: input.organisationId ?? orgA,
    legalEntityId: input.legalEntityId,
    siteId: input.siteId,
    scopeLevel: input.scopeLevel ?? "ORGANISATION",
    validFrom: input.validFrom ?? earlier,
    validUntil: input.validUntil,
    status: input.status ?? "ACTIVE",
    version: parseAggregateVersion(0),
    createdAt: earlier,
    updatedAt: earlier,
  };
}

function mapping(
  roleId: Role["id"],
  capabilityId: Capability["id"],
  input: Partial<RoleCapability> = {},
): RoleCapability {
  return {
    id:
      input.id ??
      parseInternalId("018f47b0-9b6d-7a30-8f6a-b0cc55d33a40"),
    roleId,
    capabilityId,
    status: input.status ?? "ACTIVE",
    version: parseAggregateVersion(0),
    createdAt: earlier,
    updatedAt: earlier,
  };
}

function loaded(input?: {
  assignment?: RoleAssignment;
  role?: Role;
  capability?: Capability;
  mappingStatus?: "ACTIVE" | "INACTIVE";
}): LoadedRoleAssignment {
  const r = input?.role ?? role();
  const cap = input?.capability ?? capability();
  const a = input?.assignment ?? assignment({ roleId: r.id });
  return {
    assignment: a,
    role: r,
    grants: [
      {
        mapping: mapping(r.id, cap.id, {
          status: input?.mappingStatus ?? "ACTIVE",
        }),
        capability: cap,
      },
    ],
  };
}

function state(input?: {
  profileStatus?: UserProfileStatus;
  requestedCapability?: Capability;
  assignments?: readonly LoadedRoleAssignment[];
  scopeValid?: boolean;
  identityMatches?: boolean;
}): AuthorizationEvaluationState {
  return {
    profileStatus: input && "profileStatus" in input ? input.profileStatus : "ACTIVE",
    requestedCapability: input && "requestedCapability" in input ? input.requestedCapability : capability(),
    assignments: input?.assignments ?? [loaded()],
    scopeValid: input?.scopeValid ?? true,
    identityMatches: input?.identityMatches ?? true,
  };
}

function evaluate(input?: {
  user?: AuthenticatedUser;
  capabilityCode?: string;
  scope?: AuthorizationScope;
  state?: AuthorizationEvaluationState;
  policies?: readonly AuthorizationDenyPolicy[];
}) {
  return evaluateAuthorization({
    user: input && "user" in input ? input.user : user,
    capability: input?.capabilityCode ?? "inventory.physical_count.view",
    scope: input?.scope ?? { organisationId: orgA },
    evaluatedAt: at,
    state: input?.state ?? state(),
    policies: input?.policies,
  });
}

describe("W0-07 authorization evaluator", () => {
  it("fails closed for unauthenticated, unprovisioned and inactive users", () => {
    expect(evaluate({ user: undefined }).denialReason).toBe("UNAUTHENTICATED");
    expect(evaluate({ state: state({ profileStatus: undefined }) }).denialReason)
      .toBe("USER_NOT_PROVISIONED");
    expect(evaluate({ state: state({ profileStatus: "INACTIVE" }) }).denialReason)
      .toBe("USER_INACTIVE");
    expect(evaluate({ state: state({ assignments: [] }) }).denialReason)
      .toBe("NO_ASSIGNMENT");
  });

  it("rejects forged trusted-human identity", () => {
    const forged: AuthenticatedUser = {
      ...user,
      actor: parseActorContext({ actorType: "HUMAN", actorId: "someone-else" }),
    };
    expect(evaluate({ user: forged }).denialReason).toBe("IDENTITY_MISMATCH");

    expect(
      evaluate({ state: state({ identityMatches: false }) }).denialReason,
    ).toBe("IDENTITY_MISMATCH");
  });

  it("allows only an active capability granted by an active role and assignment", () => {
    expect(evaluate().outcome).toBe("ALLOW");

    const inactiveRole = role("INACTIVE");
    expect(
      evaluate({
        state: state({ assignments: [loaded({ role: inactiveRole })] }),
      }).denialReason,
    ).toBe("ROLE_INACTIVE");

    expect(
      evaluate({
        state: state({ requestedCapability: capability("inventory.physical_count.view", "INACTIVE") }),
      }).denialReason,
    ).toBe("CAPABILITY_INACTIVE");

    const r = role();
    expect(
      evaluate({
        state: state({
          assignments: [
            loaded({
              role: r,
              assignment: assignment({ roleId: r.id, status: "INACTIVE" }),
            }),
          ],
        }),
      }).denialReason,
    ).toBe("ASSIGNMENT_INACTIVE");
  });

  it("denies unknown, missing and inactive role-capability grants", () => {
    expect(
      evaluate({ state: state({ requestedCapability: undefined }) }).denialReason,
    ).toBe("UNKNOWN_CAPABILITY");

    const r = role();
    const a = assignment({ roleId: r.id });
    expect(
      evaluate({
        state: state({
          assignments: [{ assignment: a, role: r, grants: [] }],
        }),
      }).denialReason,
    ).toBe("CAPABILITY_NOT_GRANTED");

    expect(
      evaluate({
        state: state({ assignments: [loaded({ mappingStatus: "INACTIVE" })] }),
      }).denialReason,
    ).toBe("CAPABILITY_NOT_GRANTED");
  });

  it("enforces [valid_from, valid_until) time validity", () => {
    const r = role();
    expect(
      evaluate({
        state: state({
          assignments: [
            loaded({
              role: r,
              assignment: assignment({ roleId: r.id, validFrom: later }),
            }),
          ],
        }),
      }).denialReason,
    ).toBe("ASSIGNMENT_NOT_YET_VALID");

    expect(
      evaluate({
        state: state({
          assignments: [
            loaded({
              role: r,
              assignment: assignment({
                roleId: r.id,
                validFrom: earlier,
                validUntil: at,
              }),
            }),
          ],
        }),
      }).denialReason,
    ).toBe("ASSIGNMENT_EXPIRED");

    expect(evaluate().allowed).toBe(true);
  });

  it("unions positive capabilities across simultaneous assignments without overwriting roles", () => {
    const view = capability("inventory.physical_count.view", "ACTIVE", "10");
    const record = capability("inventory.physical_count.record", "ACTIVE", "11");
    const viewer = role("ACTIVE", "20");
    const recorder = role("ACTIVE", "21");
    const viewerLoaded = loaded({
      role: viewer,
      capability: view,
      assignment: assignment({ roleId: viewer.id, idSuffix: "30" }),
    });
    const recorderLoaded = loaded({
      role: recorder,
      capability: record,
      assignment: assignment({ roleId: recorder.id, idSuffix: "31" }),
    });

    const result = evaluate({
      capabilityCode: record.code,
      state: state({
        requestedCapability: record,
        assignments: [viewerLoaded, recorderLoaded],
      }),
    });
    expect(result.allowed).toBe(true);
    expect(result.matchingAssignmentIds).toEqual([recorderLoaded.assignment.id]);

    const deduplicated = evaluate({
      state: state({ assignments: [recorderLoaded, recorderLoaded] }),
      capabilityCode: record.code,
      scope: { organisationId: orgA },
    });
    expect(deduplicated.matchingAssignmentIds).toEqual([recorderLoaded.assignment.id]);
  });

  it("implements explicit Organisation, Legal Entity and Site scope matching", () => {
    const r = role();

    const organisationAssignment = assignment({ roleId: r.id });
    expect(scopeMatches(organisationAssignment, { organisationId: orgA, legalEntityId: legalA })).toBe(true);
    expect(scopeMatches(organisationAssignment, { organisationId: orgB })).toBe(false);

    const legalAssignment = assignment({
      roleId: r.id,
      legalEntityId: legalA,
      scopeLevel: "LEGAL_ENTITY",
    });
    expect(scopeMatches(legalAssignment, { organisationId: orgA, legalEntityId: legalA })).toBe(true);
    expect(scopeMatches(legalAssignment, { organisationId: orgA, legalEntityId: legalB })).toBe(false);
    expect(scopeMatches(legalAssignment, { organisationId: orgA, legalEntityId: legalA, siteId: siteA })).toBe(true);

    const siteLegalAssignment = assignment({
      roleId: r.id,
      legalEntityId: legalA,
      siteId: siteA,
      scopeLevel: "SITE",
    });
    expect(scopeMatches(siteLegalAssignment, { organisationId: orgA, legalEntityId: legalA, siteId: siteA })).toBe(true);
    expect(scopeMatches(siteLegalAssignment, { organisationId: orgA, legalEntityId: legalB, siteId: siteA })).toBe(false);

    const physicalSiteOnly = assignment({
      roleId: r.id,
      siteId: siteA,
      scopeLevel: "SITE",
    });
    expect(scopeMatches(physicalSiteOnly, { organisationId: orgA, siteId: siteA })).toBe(true);
    expect(scopeMatches(physicalSiteOnly, { organisationId: orgA, legalEntityId: legalA, siteId: siteA })).toBe(false);
  });

  it("never expands a narrower assignment and rejects invalid requested scope", () => {
    const r = role();
    const siteScoped = loaded({
      role: r,
      assignment: assignment({
        roleId: r.id,
        legalEntityId: legalA,
        siteId: siteA,
        scopeLevel: "SITE",
      }),
    });
    expect(
      evaluate({
        scope: { organisationId: orgA, legalEntityId: legalA },
        state: state({ assignments: [siteScoped] }),
      }).denialReason,
    ).toBe("SCOPE_MISMATCH");

    expect(
      evaluate({ state: state({ scopeValid: false }) }).denialReason,
    ).toBe("SCOPE_INVALID");
  });

  it("SUPERUSER is a scoped positive grant and still traverses explicit deny policies", () => {
    const requested = capability("dispatch.gate_pass.authorise", "ACTIVE", "12");
    const superCapability = capability(SUPERUSER_CAPABILITY, "ACTIVE", "13");
    const superRole = role("ACTIVE", "22");
    const a = assignment({ roleId: superRole.id, idSuffix: "32" });
    const loadedSuper: LoadedRoleAssignment = {
      assignment: a,
      role: superRole,
      grants: [{
        mapping: mapping(superRole.id, superCapability.id),
        capability: superCapability,
      }],
    };

    const allow = evaluate({
      capabilityCode: requested.code,
      state: state({
        requestedCapability: requested,
        assignments: [loadedSuper],
      }),
    });
    expect(allow.allowed).toBe(true);
    expect(allow.viaSuperuser).toBe(true);

    const sodPolicy: AuthorizationDenyPolicy = {
      evaluate: () => "SEGREGATION_RULE",
    };
    const deny = evaluate({
      capabilityCode: requested.code,
      state: state({
        requestedCapability: requested,
        assignments: [loadedSuper],
      }),
      policies: [sodPolicy],
    });
    expect(deny.allowed).toBe(false);
    expect(deny.denialReason).toBe("SEGREGATION_RULE");
    expect(deny.viaSuperuser).toBe(true);
  });

  it("treats one human as one human even with multiple roles or sessions", () => {
    const samePersonNewSession = parseActorContext({
      actorType: "HUMAN",
      actorId: user.actor.actorId,
      sessionReference: "second-session",
    });
    const otherHuman = parseActorContext({
      actorType: "HUMAN",
      actorId: "different-human",
    });

    expect(isSameHuman(user.actor, samePersonNewSession)).toBe(true);
    expect(areDistinctHumans(user.actor, samePersonNewSession)).toBe(false);
    expect(areDistinctHumans(user.actor, otherHuman)).toBe(true);
  });
});

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AuthorizationAdministrationService,
  AuthorizationDeniedError,
  AuthorizationService,
  SUPERUSER_CAPABILITY,
  UserProfileService,
  buildAuthenticatedHuman,
  parseSupabaseAuthUserId,
  userProfileRepository,
} from "../../../src/domains/iam";
import { OrganisationService } from "../../../src/domains/core";
import {
  ConcurrencyConflictError,
  FixedClock,
  SystemInternalIdFactory,
  createOperationContext,
  parseActorContext,
  parseAggregateVersion,
  parseCommandId,
  parseCorrelationId,
  parseRequestId,
  parseUtcTimestamp,
} from "../../../src/platform/primitives";
import {
  closeApplicationDatabaseRuntime,
  getApplicationDatabaseRuntime,
} from "../../../src/platform/db/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const clock = new FixedClock("2026-10-07T00:00:00.000Z");
const ids = new SystemInternalIdFactory();
const operator = parseActorContext({ actorType: "SYSTEM", actorId: "w0-07-authz-test" });
const operation = createOperationContext({
  requestId: parseRequestId("req-authz-integration"),
  commandId: parseCommandId("123e4567-e89b-42d3-a456-426614174170"),
  correlationId: parseCorrelationId("123e4567-e89b-42d3-a456-426614174171"),
});

let currentUser: ReturnType<typeof buildAuthenticatedHuman>;
let userProfileId: ReturnType<typeof ids.next>;
let orgA: ReturnType<typeof ids.next>;
let orgB: ReturnType<typeof ids.next>;
let legalA: ReturnType<typeof ids.next>;
let legalB: ReturnType<typeof ids.next>;
let legalOther: ReturnType<typeof ids.next>;
let sharedSite: ReturnType<typeof ids.next>;
let viewCapability: ReturnType<typeof ids.next>;
let recordCapability: ReturnType<typeof ids.next>;
let siteCapability: ReturnType<typeof ids.next>;
let dispatchCapability: ReturnType<typeof ids.next>;
let superCapability: ReturnType<typeof ids.next>;
let viewerRole: ReturnType<typeof ids.next>;
let recorderRole: ReturnType<typeof ids.next>;
let siteRole: ReturnType<typeof ids.next>;
let superRole: ReturnType<typeof ids.next>;
let recordAssignment: ReturnType<typeof ids.next>;

describe("W0-07 PostgreSQL scoped authorization integration", () => {
  beforeAll(async () => {
    expect(url).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):/);
    const runtime = getApplicationDatabaseRuntime();
    const profiles = new UserProfileService(runtime.unitOfWork, clock, ids);
    const organisations = new OrganisationService(runtime.unitOfWork, clock, ids);
    const authorization = new AuthorizationAdministrationService(runtime.unitOfWork, clock, ids, operation);

    const email = `w007-${randomUUID()}@example.invalid`;
    const created = await admin.auth.admin.createUser({
      email,
      password: "W0-07-Test-Password-123!",
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("Auth user not created.");
    }

    userProfileId = await profiles.provision({
      authUserId: created.data.user.id,
      displayName: "Authorization Integration User",
      emailSnapshot: email,
    }, operator);

    const profile = await runtime.unitOfWork.withTransaction(async (uow) =>
      await uow.repository(userProfileRepository).findByAuthUserId(
        parseSupabaseAuthUserId(created.data.user!.id),
      ),
    );
    currentUser = buildAuthenticatedHuman({
      authUserId: parseSupabaseAuthUserId(created.data.user.id),
      authEmail: email,
      profile,
      operation,
    });

    orgA = await organisations.createOrganisation({ code: "AUTHA", name: "Auth Organisation A" }, operator);
    orgB = await organisations.createOrganisation({ code: "AUTHB", name: "Auth Organisation B" }, operator);
    legalA = await organisations.createLegalEntity({
      organisationId: orgA, code: "LEA", legalName: "Legal Entity A",
    }, operator);
    legalB = await organisations.createLegalEntity({
      organisationId: orgA, code: "LEB", legalName: "Legal Entity B",
    }, operator);
    legalOther = await organisations.createLegalEntity({
      organisationId: orgB, code: "LEO", legalName: "Legal Entity Other",
    }, operator);
    sharedSite = await organisations.createSite({
      organisationId: orgA,
      code: "SHARED",
      name: "Shared Site",
      legalEntityIds: [legalA, legalB],
    }, operator);

    viewCapability = await authorization.registerCapability({
      code: "inventory.physical_count.view",
      displayName: "View physical count",
    }, operator);
    recordCapability = await authorization.registerCapability({
      code: "inventory.physical_count.record",
      displayName: "Record physical count",
    }, operator);
    siteCapability = await authorization.registerCapability({
      code: "quality.inspection.record",
      displayName: "Record inspection",
    }, operator);
    dispatchCapability = await authorization.registerCapability({
      code: "dispatch.gate_pass.authorise",
      displayName: "Authorise gate pass",
    }, operator);
    superCapability = await authorization.registerCapability({
      code: SUPERUSER_CAPABILITY,
      displayName: "FacilityOS superuser positive grant",
    }, operator);

    viewerRole = await authorization.createRole({
      code: "VIEWER", displayName: "Viewer", kind: "SYSTEM",
    }, operator);
    recorderRole = await authorization.createRole({
      code: "RECORDER", displayName: "Recorder", kind: "SYSTEM",
    }, operator);
    siteRole = await authorization.createRole({
      code: "SITE_INSPECTOR", displayName: "Site Inspector", kind: "SYSTEM",
    }, operator);
    superRole = await authorization.createRole({
      code: "SUPERUSER", displayName: "Superuser", kind: "SYSTEM",
    }, operator);

    await authorization.mapCapability({ roleId: viewerRole, capabilityId: viewCapability }, operator);
    await authorization.mapCapability({ roleId: recorderRole, capabilityId: recordCapability }, operator);
    await authorization.mapCapability({ roleId: siteRole, capabilityId: siteCapability }, operator);
    await authorization.mapCapability({ roleId: superRole, capabilityId: superCapability }, operator);

    await authorization.createAssignment({
      userProfileId,
      roleId: viewerRole,
      scope: { organisationId: orgA },
    }, operator);
    recordAssignment = await authorization.createAssignment({
      userProfileId,
      roleId: recorderRole,
      scope: { organisationId: orgA, legalEntityId: legalA },
    }, operator);
    await authorization.createAssignment({
      userProfileId,
      roleId: siteRole,
      scope: { organisationId: orgA, legalEntityId: legalA, siteId: sharedSite },
    }, operator);
  });

  afterAll(async () => {
    await closeApplicationDatabaseRuntime();
  });

  it("unions simultaneous roles while preserving scope boundaries", async () => {
    const runtime = getApplicationDatabaseRuntime();
    const service = new AuthorizationService(runtime.unitOfWork, clock);

    expect((await service.authorize({
      user: currentUser,
      capability: "inventory.physical_count.view",
      scope: { organisationId: orgA, legalEntityId: legalB },
    })).allowed).toBe(true);

    expect((await service.authorize({
      user: currentUser,
      capability: "inventory.physical_count.record",
      scope: { organisationId: orgA, legalEntityId: legalA },
    })).allowed).toBe(true);

    const denied = await service.authorize({
      user: currentUser,
      capability: "inventory.physical_count.record",
      scope: { organisationId: orgA, legalEntityId: legalB },
    });
    expect(denied.allowed).toBe(false);
    expect(denied.denialReason).toBe("SCOPE_MISMATCH");
  });

  it("does not turn a shared Site into unrelated Legal Entity access", async () => {
    const runtime = getApplicationDatabaseRuntime();
    const service = new AuthorizationService(runtime.unitOfWork, clock);

    expect((await service.authorize({
      user: currentUser,
      capability: "quality.inspection.record",
      scope: { organisationId: orgA, legalEntityId: legalA, siteId: sharedSite },
    })).allowed).toBe(true);

    expect((await service.authorize({
      user: currentUser,
      capability: "quality.inspection.record",
      scope: { organisationId: orgA, legalEntityId: legalB, siteId: sharedSite },
    })).allowed).toBe(false);
  });

  it("enforces assignment revocation immediately without stale grants", async () => {
    const runtime = getApplicationDatabaseRuntime();
    const administration = new AuthorizationAdministrationService(runtime.unitOfWork, clock, ids, operation);
    const service = new AuthorizationService(runtime.unitOfWork, clock);

    await administration.setAssignmentStatus({
      assignmentId: recordAssignment,
      expectedVersion: parseAggregateVersion(0),
      status: "INACTIVE",
    }, operator);

    const denied = await service.authorize({
      user: currentUser,
      capability: "inventory.physical_count.record",
      scope: { organisationId: orgA, legalEntityId: legalA },
    });
    expect(denied.allowed).toBe(false);
    expect(denied.denialReason).toBe("ASSIGNMENT_INACTIVE");
  });

  it("enforces future and expired validity windows", async () => {
    const runtime = getApplicationDatabaseRuntime();
    const administration = new AuthorizationAdministrationService(runtime.unitOfWork, clock, ids, operation);
    const futureCap = await administration.registerCapability({
      code: "service.job.execute", displayName: "Execute service job",
    }, operator);
    const futureRole = await administration.createRole({
      code: "SERVICE_ENGINEER", displayName: "Service Engineer",
    }, operator);
    await administration.mapCapability({ roleId: futureRole, capabilityId: futureCap }, operator);
    await administration.createAssignment({
      userProfileId,
      roleId: futureRole,
      scope: { organisationId: orgA },
      validFrom: parseUtcTimestamp("2026-10-08T00:00:00.000Z"),
    }, operator);

    const service = new AuthorizationService(runtime.unitOfWork, clock);
    expect((await service.authorize({
      user: currentUser,
      capability: "service.job.execute",
      scope: { organisationId: orgA },
    })).denialReason).toBe("ASSIGNMENT_NOT_YET_VALID");

    const expiredCap = await administration.registerCapability({
      code: "manufacturing.route_card.execute", displayName: "Execute route card",
    }, operator);
    const expiredRole = await administration.createRole({
      code: "ROUTE_OPERATOR", displayName: "Route Operator",
    }, operator);
    await administration.mapCapability({ roleId: expiredRole, capabilityId: expiredCap }, operator);
    await administration.createAssignment({
      userProfileId,
      roleId: expiredRole,
      scope: { organisationId: orgA },
      validFrom: parseUtcTimestamp("2026-10-05T00:00:00.000Z"),
      validUntil: parseUtcTimestamp("2026-10-06T00:00:00.000Z"),
    }, operator);

    expect((await service.authorize({
      user: currentUser,
      capability: "manufacturing.route_card.execute",
      scope: { organisationId: orgA },
    })).denialReason).toBe("ASSIGNMENT_EXPIRED");
  });

  it("rejects forged identity, unknown capability and forged broader scope", async () => {
    const runtime = getApplicationDatabaseRuntime();
    const service = new AuthorizationService(runtime.unitOfWork, clock);
    const forged = {
      ...currentUser,
      actor: parseActorContext({ actorType: "HUMAN", actorId: "forged-user" }),
    };

    expect((await service.authorize({
      user: forged,
      capability: "inventory.physical_count.view",
      scope: { organisationId: orgA },
    })).denialReason).toBe("IDENTITY_MISMATCH");

    const forgedAuthLink = {
      ...currentUser,
      authUserId: parseSupabaseAuthUserId("123e4567-e89b-42d3-a456-426614179999"),
    };
    expect((await service.authorize({
      user: forgedAuthLink,
      capability: "inventory.physical_count.view",
      scope: { organisationId: orgA },
    })).denialReason).toBe("IDENTITY_MISMATCH");

    expect((await service.authorize({
      user: currentUser,
      capability: "admin.everything",
      scope: { organisationId: orgA },
    })).denialReason).toBe("UNKNOWN_CAPABILITY");

    expect((await service.authorize({
      user: currentUser,
      capability: "quality.inspection.record",
      scope: { organisationId: orgB, legalEntityId: legalOther },
    })).allowed).toBe(false);
  });

  it("SUPERUSER remains scoped and cannot bypass an explicit policy deny", async () => {
    const runtime = getApplicationDatabaseRuntime();
    const administration = new AuthorizationAdministrationService(
      runtime.unitOfWork, clock, ids, operation,
    );
    const superAssignment = await administration.createAssignment({
      userProfileId,
      roleId: superRole,
      scope: { organisationId: orgA },
    }, operator);

    try {
      const normalService = new AuthorizationService(runtime.unitOfWork, clock);
      const outsideScope = await normalService.authorize({
        user: currentUser,
        capability: "dispatch.gate_pass.authorise",
        scope: { organisationId: orgB, legalEntityId: legalOther },
      });
      expect(outsideScope.allowed).toBe(false);
      expect(outsideScope.viaSuperuser).toBe(false);
      expect(outsideScope.denialReason).toBe("SCOPE_MISMATCH");

      const policy = { evaluate: () => "SEGREGATION_RULE" as const };
      const policyService = new AuthorizationService(runtime.unitOfWork, clock, [policy]);
      const denied = await policyService.authorize({
        user: currentUser,
        capability: "dispatch.gate_pass.authorise",
        scope: { organisationId: orgA },
      });
      expect(denied.allowed).toBe(false);
      expect(denied.viaSuperuser).toBe(true);
      expect(denied.denialReason).toBe("SEGREGATION_RULE");
    } finally {
      await administration.setAssignmentStatus({
        assignmentId: superAssignment,
        expectedVersion: parseAggregateVersion(0),
        status: "INACTIVE",
      }, operator);
    }
  });

  it("server guard raises a generic authorization error instead of exposing internals", async () => {
    const runtime = getApplicationDatabaseRuntime();
    const service = new AuthorizationService(runtime.unitOfWork, clock);
    await expect(service.require({
      user: currentUser,
      capability: "quality.inspection.record",
      scope: { organisationId: orgA, legalEntityId: legalB, siteId: sharedSite },
    })).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });


  it("revokes grants when Role or Capability is deactivated", async () => {
    const runtime = getApplicationDatabaseRuntime();
    const administration = new AuthorizationAdministrationService(
      runtime.unitOfWork, clock, ids, operation,
    );
    const service = new AuthorizationService(runtime.unitOfWork, clock);

    const roleCap = await administration.registerCapability({
      code: "inventory.stock.move", displayName: "Move stock",
    }, operator);
    const roleToDeactivate = await administration.createRole({
      code: "STOCK_MOVER", displayName: "Stock Mover",
    }, operator);
    await administration.mapCapability({
      roleId: roleToDeactivate, capabilityId: roleCap,
    }, operator);
    await administration.createAssignment({
      userProfileId, roleId: roleToDeactivate, scope: { organisationId: orgA },
    }, operator);
    expect((await service.authorize({
      user: currentUser,
      capability: "inventory.stock.move",
      scope: { organisationId: orgA },
    })).allowed).toBe(true);
    await administration.setRoleStatus({
      roleId: roleToDeactivate,
      expectedVersion: parseAggregateVersion(0),
      status: "INACTIVE",
    }, operator);
    expect((await service.authorize({
      user: currentUser,
      capability: "inventory.stock.move",
      scope: { organisationId: orgA },
    })).denialReason).toBe("ROLE_INACTIVE");

    const capabilityToDeactivate = await administration.registerCapability({
      code: "quality.inspection.submit", displayName: "Submit inspection",
    }, operator);
    const capabilityRole = await administration.createRole({
      code: "QUALITY_SUBMITTER", displayName: "Quality Submitter",
    }, operator);
    await administration.mapCapability({
      roleId: capabilityRole, capabilityId: capabilityToDeactivate,
    }, operator);
    await administration.createAssignment({
      userProfileId, roleId: capabilityRole, scope: { organisationId: orgA },
    }, operator);
    expect((await service.authorize({
      user: currentUser,
      capability: "quality.inspection.submit",
      scope: { organisationId: orgA },
    })).allowed).toBe(true);
    await administration.setCapabilityStatus({
      capabilityId: capabilityToDeactivate,
      expectedVersion: parseAggregateVersion(0),
      status: "INACTIVE",
    }, operator);
    expect((await service.authorize({
      user: currentUser,
      capability: "quality.inspection.submit",
      scope: { organisationId: orgA },
    })).denialReason).toBe("CAPABILITY_INACTIVE");
  });

  it("database rejects duplicate mappings, invalid cross-Organisation scope and invalid validity", async () => {
    const runtime = getApplicationDatabaseRuntime();
    const administration = new AuthorizationAdministrationService(runtime.unitOfWork, clock, ids, operation);

    await expect(
      administration.mapCapability({ roleId: viewerRole, capabilityId: viewCapability }, operator),
    ).rejects.toThrow();

    await expect(
      administration.createAssignment({
        userProfileId,
        roleId: viewerRole,
        scope: { organisationId: orgA },
      }, operator),
    ).rejects.toThrow();

    await expect(runtime.database.insertInto("iam.role_assignment").values({
      id: ids.next(),
      user_profile_id: userProfileId,
      role_id: viewerRole,
      organisation_id: orgA,
      legal_entity_id: legalOther,
      site_id: null,
      scope_level: "LEGAL_ENTITY",
      valid_from: clock.nowUtc(),
      valid_until: null,
      status: "ACTIVE",
      version: 0,
      created_at: clock.nowUtc(),
      created_actor_type: operator.actorType,
      created_actor_id: operator.actorId,
      updated_at: clock.nowUtc(),
      updated_actor_type: operator.actorType,
      updated_actor_id: operator.actorId,
    }).execute()).rejects.toThrow();

    await expect(runtime.database.insertInto("iam.role_assignment").values({
      id: ids.next(),
      user_profile_id: userProfileId,
      role_id: viewerRole,
      organisation_id: orgA,
      legal_entity_id: null,
      site_id: null,
      scope_level: "ORGANISATION",
      valid_from: parseUtcTimestamp("2026-10-08T00:00:00.000Z"),
      valid_until: parseUtcTimestamp("2026-10-07T00:00:00.000Z"),
      status: "ACTIVE",
      version: 0,
      created_at: clock.nowUtc(),
      created_actor_type: operator.actorType,
      created_actor_id: operator.actorId,
      updated_at: clock.nowUtc(),
      updated_actor_type: operator.actorType,
      updated_actor_id: operator.actorId,
    }).execute()).rejects.toThrow();
  });

  it("keeps role/capability codes immutable and enforces optimistic concurrency", async () => {
    const runtime = getApplicationDatabaseRuntime();
    await expect(runtime.database.updateTable("iam.role")
      .set({ code: "RENAMED" })
      .where("id", "=", viewerRole)
      .execute()).rejects.toThrow("immutable");

    const administration = new AuthorizationAdministrationService(runtime.unitOfWork, clock, ids, operation);
    await administration.setRoleStatus({
      roleId: viewerRole,
      expectedVersion: parseAggregateVersion(0),
      status: "INACTIVE",
    }, operator);
    await expect(administration.setRoleStatus({
      roleId: viewerRole,
      expectedVersion: parseAggregateVersion(0),
      status: "ACTIVE",
    }, operator)).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });
});

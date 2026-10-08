import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ApprovalService,
  AuditRecorder,
  GovernancePolicyService,
  HoldService,
  governanceRepository,
} from "../../../src/domains/governance";
import {
  AuthorizationService,
  SUPERUSER_CAPABILITY,
  buildAuthenticatedHuman,
  parseSupabaseAuthUserId,
} from "../../../src/domains/iam";
import {
  closeApplicationDatabaseRuntime,
  getApplicationDatabaseRuntime,
} from "../../../src/platform/db/server";
import { createDatabaseSecurityContext } from "../../../src/platform/db/security-context";
import {
  SystemClock,
  SystemInternalIdFactory,
  createOperationContext,
  parseActorContext,
  parseAggregateVersion,
  parseCommandId,
  parseCorrelationId,
  parseInternalId,
  parseRequestId,
  parseUtcTimestamp,
} from "../../../src/platform/primitives";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL!;
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(apiUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const anon = createClient(apiUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const pool = new Pool({
  connectionString: databaseUrl,
  max: 8,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 2000,
});

const clock = new SystemClock();
const ids = new SystemInternalIdFactory();
const runtime = getApplicationDatabaseRuntime();
const authorization = new AuthorizationService(runtime.unitOfWork, clock);
const audit = new AuditRecorder(runtime.unitOfWork, authorization, clock, ids);
const approvals = new ApprovalService(
  runtime.unitOfWork,
  authorization,
  audit,
  clock,
  ids,
);
const holds = new HoldService(
  runtime.unitOfWork,
  authorization,
  audit,
  clock,
  ids,
);
const policy = new GovernancePolicyService(holds);

const fixedCapabilities = {
  auditRead: "90000000-0000-4000-8000-000000000001",
  approvalRequest: "90000000-0000-4000-8000-000000000002",
  approvalDecide: "90000000-0000-4000-8000-000000000003",
  holdPlace: "90000000-0000-4000-8000-000000000004",
  holdRelease: "90000000-0000-4000-8000-000000000005",
};

type TestUser = {
  authId: string;
  profileId: string;
  email: string;
  label: string;
};

const users: Record<
  "requester" | "approverA" | "approverB" | "auditor" | "outsider" | "superuser" | "inactive",
  TestUser
> = {
  requester: { authId: "", profileId: randomUUID(), email: "", label: "requester" },
  approverA: { authId: "", profileId: randomUUID(), email: "", label: "approver-a" },
  approverB: { authId: "", profileId: randomUUID(), email: "", label: "approver-b" },
  auditor: { authId: "", profileId: randomUUID(), email: "", label: "auditor" },
  outsider: { authId: "", profileId: randomUUID(), email: "", label: "outsider" },
  superuser: { authId: "", profileId: randomUUID(), email: "", label: "superuser" },
  inactive: { authId: "", profileId: randomUUID(), email: "", label: "inactive" },
};

const fixture = {
  orgA: randomUUID(),
  orgB: randomUUID(),
  requesterRole: randomUUID(),
  approverRoleA: randomUUID(),
  approverRoleASecond: randomUUID(),
  approverRoleB: randomUUID(),
  auditorRole: randomUUID(),
  outsiderRole: randomUUID(),
  superRole: randomUUID(),
  inactiveRole: randomUUID(),
  superCapability: randomUUID(),
};

function iid(value: string) {
  return parseInternalId(value);
}

function operation(label: string) {
  return createOperationContext({
    requestId: parseRequestId(`req-w0-09-${label}`),
    commandId: parseCommandId(randomUUID()),
    correlationId: parseCorrelationId(randomUUID()),
  });
}

function asUser(entry: TestUser, label: string) {
  const at = parseUtcTimestamp("2026-10-07T00:00:00.000Z");
  return buildAuthenticatedHuman({
    authUserId: parseSupabaseAuthUserId(entry.authId),
    authEmail: entry.email,
    profile: {
      id: iid(entry.profileId),
      authUserId: parseSupabaseAuthUserId(entry.authId),
      displayName: `W0-09 ${entry.label}`,
      emailSnapshot: entry.email,
      status: "ACTIVE",
      version: parseAggregateVersion(0),
      createdAt: at,
      updatedAt: at,
    },
    operation: operation(label),
  });
}

async function createAuthUsers() {
  for (const entry of Object.values(users)) {
    entry.email = `w009-${entry.label}-${randomUUID()}@example.invalid`;
    const created = await admin.auth.admin.createUser({
      email: entry.email,
      password: "W0-09-Test-Password-123!",
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("W0-09 auth user not created.");
    }
    entry.authId = created.data.user.id;
  }
}

async function seed() {
  await createAuthUsers();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const actor = "w0-09-test";

    for (const [id, code, name] of [
      [fixture.orgA, "GOVA", "Governance Organisation A"],
      [fixture.orgB, "GOVB", "Governance Organisation B"],
    ]) {
      await client.query(
        `insert into core.organisation
          (id,code,name,status,version,created_at,created_actor_type,created_actor_id,
           updated_at,updated_actor_type,updated_actor_id)
         values ($1,$2,$3,'ACTIVE',0,now(),'SYSTEM',$4,now(),'SYSTEM',$4)`,
        [id, code, name, actor],
      );
    }

    for (const entry of Object.values(users)) {
      await client.query(
        `insert into iam.user_profile
          (id,auth_user_id,display_name,email_snapshot,status,version,created_at,
           created_actor_type,created_actor_id,updated_at,updated_actor_type,updated_actor_id)
         values ($1,$2,$3,$4,'ACTIVE',0,now(),'SYSTEM',$5,now(),'SYSTEM',$5)`,
        [entry.profileId, entry.authId, `W0-09 ${entry.label}`, entry.email, actor],
      );
    }

    await client.query(
      `insert into iam.capability
        (id,code,display_name,description,kind,status,version,created_at,created_actor_type,
         created_actor_id,updated_at,updated_actor_type,updated_actor_id)
       values ($1,$2,'FacilityOS superuser','Test-only W0-09 SUPERUSER grant','SYSTEM','ACTIVE',0,
               now(),'SYSTEM',$3,now(),'SYSTEM',$3)`,
      [fixture.superCapability, SUPERUSER_CAPABILITY, actor],
    );

    const roles = [
      [fixture.requesterRole, "GOV_REQUESTER", "Governance Requester"],
      [fixture.approverRoleA, "GOV_APPROVER_A", "Governance Approver A"],
      [fixture.approverRoleASecond, "GOV_APPROVER_A_2", "Governance Approver A Second Role"],
      [fixture.approverRoleB, "GOV_APPROVER_B", "Governance Approver B"],
      [fixture.auditorRole, "GOV_AUDITOR", "Governance Auditor"],
      [fixture.outsiderRole, "GOV_OUTSIDER", "Governance Outsider"],
      [fixture.superRole, "GOV_SUPERUSER", "Governance Superuser"],
      [fixture.inactiveRole, "GOV_INACTIVE", "Governance Inactive Assignment"],
    ];
    for (const [id, code, displayName] of roles) {
      await client.query(
        `insert into iam.role
          (id,code,display_name,kind,status,version,created_at,created_actor_type,
           created_actor_id,updated_at,updated_actor_type,updated_actor_id)
         values ($1,$2,$3,'SYSTEM','ACTIVE',0,now(),'SYSTEM',$4,now(),'SYSTEM',$4)`,
        [id, code, displayName, actor],
      );
    }

    const mappings = [
      [fixture.requesterRole, fixedCapabilities.approvalRequest],
      [fixture.requesterRole, fixedCapabilities.approvalDecide],
      [fixture.requesterRole, fixedCapabilities.holdPlace],
      [fixture.approverRoleA, fixedCapabilities.approvalDecide],
      [fixture.approverRoleA, fixedCapabilities.holdRelease],
      [fixture.approverRoleASecond, fixedCapabilities.approvalDecide],
      [fixture.approverRoleB, fixedCapabilities.approvalDecide],
      [fixture.approverRoleB, fixedCapabilities.holdRelease],
      [fixture.auditorRole, fixedCapabilities.auditRead],
      [fixture.outsiderRole, fixedCapabilities.approvalDecide],
      [fixture.outsiderRole, fixedCapabilities.holdRelease],
      [fixture.superRole, fixture.superCapability],
      [fixture.inactiveRole, fixedCapabilities.approvalDecide],
    ];
    for (const [roleId, capabilityId] of mappings) {
      await client.query(
        `insert into iam.role_capability
          (id,role_id,capability_id,status,version,created_at,created_actor_type,created_actor_id,
           updated_at,updated_actor_type,updated_actor_id)
         values ($1,$2,$3,'ACTIVE',0,now(),'SYSTEM',$4,now(),'SYSTEM',$4)`,
        [randomUUID(), roleId, capabilityId, actor],
      );
    }

    const assignments = [
      [users.requester.profileId, fixture.requesterRole, fixture.orgA, "ACTIVE"],
      [users.approverA.profileId, fixture.approverRoleA, fixture.orgA, "ACTIVE"],
      [users.approverA.profileId, fixture.approverRoleASecond, fixture.orgA, "ACTIVE"],
      [users.approverB.profileId, fixture.approverRoleB, fixture.orgA, "ACTIVE"],
      [users.auditor.profileId, fixture.auditorRole, fixture.orgA, "ACTIVE"],
      [users.outsider.profileId, fixture.outsiderRole, fixture.orgB, "ACTIVE"],
      [users.superuser.profileId, fixture.superRole, fixture.orgA, "ACTIVE"],
      [users.inactive.profileId, fixture.inactiveRole, fixture.orgA, "INACTIVE"],
    ];
    for (const [profileId, roleId, organisationId, status] of assignments) {
      await client.query(
        `insert into iam.role_assignment
          (id,user_profile_id,role_id,organisation_id,legal_entity_id,site_id,scope_level,
           valid_from,valid_until,status,version,created_at,created_actor_type,created_actor_id,
           updated_at,updated_actor_type,updated_actor_id)
         values ($1,$2,$3,$4,null,null,'ORGANISATION',now()-interval '1 day',null,$5,0,
                 now(),'SYSTEM',$6,now(),'SYSTEM',$6)`,
        [randomUUID(), profileId, roleId, organisationId, status, actor],
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function beginAsUser(entry: TestUser, requestId = "req-w0-09-direct") {
  const client = await pool.connect();
  await client.query("begin");
  await client.query("set local role facilityos_user_runtime");
  await client.query("set local row_security = on");
  await client.query(
    "select facilityos_security.establish_authenticated_context($1::uuid,$2,$3::uuid)",
    [entry.authId, requestId, randomUUID()],
  );
  return client;
}

async function expectDeniedRuntimeSql(
  entry: TestUser,
  statement: string,
  params: unknown[] = [],
) {
  const client = await beginAsUser(entry);
  try {
    await expect(client.query(statement, params)).rejects.toThrow();
  } finally {
    await client.query("rollback");
    client.release();
  }
}

async function requireNoHold(user: ReturnType<typeof asUser>, resourceId: string) {
  const context = createDatabaseSecurityContext({
    authUserId: user.authUserId,
    requestId: user.operation.requestId,
    correlationId: user.operation.correlationId,
  });
  await runtime.unitOfWork.withRlsTransaction(context, async (uow) => {
    await policy.requireNoBlockingHoldWithin(uow, {
      scope: { organisationId: iid(fixture.orgA) },
      resource: { type: "manufacturing.job", id: iid(resourceId) },
      action: "MANUFACTURING_RELEASE",
    });
  });
}

describe("W0-09 immutable Audit, Approval and Hold governance", () => {
  beforeAll(async () => {
    expect(databaseUrl).toMatch(/^postgres(?:ql)?:\/\//);
    expect(apiUrl).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):/);
    await pool.query("grant facilityos_security_admin to postgres");
    await seed();
  });

  afterAll(async () => {
    await closeApplicationDatabaseRuntime();
    await pool.query("revoke facilityos_security_admin from postgres");
    await pool.end();
  });

  it("keeps governance private, FORCE-RLS protected and runtime NOBYPASSRLS", async () => {
    const schema = await pool.query(
      `select n.nspname, n.nspacl
       from pg_namespace n where n.nspname='governance'`,
    );
    expect(schema.rows).toHaveLength(1);

    const tables = await pool.query(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity, owner.rolname owner_name
       from pg_class c
       join pg_namespace n on n.oid=c.relnamespace
       join pg_roles owner on owner.oid=c.relowner
       where n.nspname='governance' and c.relkind='r'
       order by c.relname`,
    );
    expect(tables.rows.map((row) => row.relname)).toEqual([
      "approval_decision",
      "approval_request",
      "audit_event",
      "hold",
      "hold_action",
    ]);
    for (const table of tables.rows) {
      expect(table.relrowsecurity).toBe(true);
      expect(table.relforcerowsecurity).toBe(true);
      expect(table.owner_name).not.toBe("facilityos_user_runtime");
    }

    const roles = await pool.query(
      `select rolname,rolbypassrls,rolsuper,rolcanlogin,rolinherit
       from pg_roles
       where rolname in ('facilityos_user_runtime','facilityos_governance_executor')
       order by rolname`,
    );
    expect(roles.rows).toHaveLength(2);
    for (const role of roles.rows) {
      expect(role.rolbypassrls).toBe(false);
      expect(role.rolsuper).toBe(false);
      expect(role.rolcanlogin).toBe(false);
      expect(role.rolinherit).toBe(false);
    }
    const executorMembership = await pool.query(
      `select count(*)::int count
       from pg_auth_members am
       join pg_roles granted_role on granted_role.oid=am.roleid
       where granted_role.rolname='facilityos_governance_executor'`,
    );
    expect(executorMembership.rows[0]?.count).toBe(0);

    const dataApi = await anon.schema("governance").from("audit_event").select("id").limit(1);
    expect(dataApi.error).not.toBeNull();
  });

  it("appends canonical HUMAN and SYSTEM audit with trace/scope/resource fields and bounded read visibility", async () => {
    const resourceId = randomUUID();
    const requester = asUser(users.requester, "audit-human");
    const humanEvent = await audit.recordHuman(requester, {
      authorizingCapability: "governance.approval.request",
      eventType: "governance.test.human",
      scope: { organisationId: iid(fixture.orgA) },
      resource: { type: "manufacturing.job", id: iid(resourceId) },
      action: "TEST_RECORDED",
      outcome: "SUCCESS",
      sourceModule: "governance.test",
      metadata: { safe: true, phase: "w0-09" },
    });

    const systemOperation = operation("audit-system");
    const systemEvent = await runtime.unitOfWork.withSecurityAdminTransaction(async (uow) =>
      await audit.appendSystemWithin(uow, {
        actor: parseActorContext({
          actorType: "SYSTEM",
          actorId: "w0-09-system",
          requestId: systemOperation.requestId,
        }) as never,
        operation: systemOperation,
        eventType: "governance.test.system",
        scope: { organisationId: iid(fixture.orgA) },
        resource: { type: "manufacturing.job", id: iid(resourceId) },
        action: "SYSTEM_RECORDED",
        outcome: "SUCCESS",
        sourceModule: "governance.test",
        metadata: { source: "integration-test" },
      }),
    );

    const canonical = await pool.query(
      `select id,actor_type,actor_id,authenticated_user_id,request_id,command_id,
              correlation_id,organisation_id,resource_type,resource_id,action,outcome,
              metadata,creation_txid
       from governance.audit_event where id=any($1::uuid[]) order by actor_type`,
      [[humanEvent, systemEvent]],
    );
    expect(canonical.rows).toHaveLength(2);
    const human = canonical.rows.find((row) => row.actor_type === "HUMAN");
    const system = canonical.rows.find((row) => row.actor_type === "SYSTEM");
    expect(human?.actor_id).toBe(users.requester.profileId);
    expect(human?.authenticated_user_id).toBe(users.requester.profileId);
    expect(human?.request_id).toBe(requester.operation.requestId);
    expect(human?.command_id).toBe(requester.operation.commandId);
    expect(human?.correlation_id).toBe(requester.operation.correlationId);
    expect(human?.organisation_id).toBe(fixture.orgA);
    expect(human?.resource_type).toBe("manufacturing.job");
    expect(human?.resource_id).toBe(resourceId);
    expect(human?.creation_txid).toMatch(/^\d+$/);
    expect(system?.actor_id).toBe("w0-09-system");
    expect(system?.authenticated_user_id).toBeNull();

    let client = await beginAsUser(users.requester, "req-audit-requester-read");
    try {
      expect(
        (await client.query("select id from governance.audit_event where id=$1", [humanEvent])).rows,
      ).toHaveLength(0);
    } finally {
      await client.query("rollback");
      client.release();
    }

    client = await beginAsUser(users.auditor, "req-audit-auditor-read");
    try {
      expect(
        (await client.query("select id from governance.audit_event where id=$1", [humanEvent])).rows,
      ).toHaveLength(1);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("enforces audit immutability, sensitive-data rejection and transactional rollback", async () => {
    const resourceId = randomUUID();
    const requester = asUser(users.requester, "audit-sensitive");
    await expect(
      audit.recordHuman(requester, {
        authorizingCapability: "governance.approval.request",
        eventType: "governance.test.sensitive",
        scope: { organisationId: iid(fixture.orgA) },
        resource: { type: "manufacturing.job", id: iid(resourceId) },
        action: "TEST_RECORDED",
        outcome: "SUCCESS",
        sourceModule: "governance.test",
        metadata: { api_token: "must-not-be-recorded" },
      }),
    ).rejects.toThrow();

    const rollbackUser = asUser(users.requester, "audit-rollback");
    const rollbackContext = createDatabaseSecurityContext({
      authUserId: rollbackUser.authUserId,
      requestId: rollbackUser.operation.requestId,
      correlationId: rollbackUser.operation.correlationId,
    });
    await expect(
      runtime.unitOfWork.withRlsTransaction(rollbackContext, async (uow) => {
        await audit.appendHumanWithin(uow, rollbackUser, {
          authorizingCapability: "governance.approval.request",
          eventType: "governance.test.rollback",
          scope: { organisationId: iid(fixture.orgA) },
          resource: { type: "manufacturing.job", id: iid(resourceId) },
          action: "ROLLBACK_TEST",
          outcome: "SUCCESS",
          sourceModule: "governance.test",
        });
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    const rolledBack = await pool.query(
      "select count(*)::int count from governance.audit_event where command_id=$1",
      [rollbackUser.operation.commandId],
    );
    expect(rolledBack.rows[0]?.count).toBe(0);

    const committed = asUser(users.requester, "audit-immutable");
    const eventId = await audit.recordHuman(committed, {
      authorizingCapability: "governance.approval.request",
      eventType: "governance.test.immutable",
      scope: { organisationId: iid(fixture.orgA) },
      resource: { type: "manufacturing.job", id: iid(resourceId) },
      action: "IMMUTABLE_TEST",
      outcome: "SUCCESS",
      sourceModule: "governance.test",
    });

    await expectDeniedRuntimeSql(
      users.requester,
      `insert into governance.audit_event
        (id,event_type,event_version,recorded_at,occurred_at,actor_type,actor_id,
         authenticated_user_id,request_id,correlation_id,organisation_id,resource_type,
         resource_id,action,outcome,metadata,source_module,creation_txid)
       values ($1,'governance.test.fabricated',1,now(),now(),'HUMAN',$2,$2,
               'req-fabricated',$3,$4,'manufacturing.job',$5,'FABRICATED','SUCCESS',
               '{}'::jsonb,'governance.test','0')`,
      [randomUUID(), users.requester.profileId, randomUUID(), fixture.orgA, resourceId],
    );

    const unsafeClient = await beginAsUser(users.requester, "req-audit-db-sensitive");
    try {
      await expect(
        unsafeClient.query(
          `select governance.append_human_audit_event(
             $1::uuid,'governance.approval.request','governance.test.db_sensitive',1,
             now(),now(),'req-audit-db-sensitive',$2::uuid,$3::uuid,null,
             $4::uuid,null,null,'manufacturing.job',$5::uuid,'DB_SENSITIVE','SUCCESS',
             $6::jsonb,'governance.test',null)`,
          [
            randomUUID(),
            randomUUID(),
            randomUUID(),
            fixture.orgA,
            resourceId,
            JSON.stringify({ api_token: "must-not-be-recorded" }),
          ],
        ),
      ).rejects.toThrow();
    } finally {
      await unsafeClient.query("rollback");
      unsafeClient.release();
    }

    await expectDeniedRuntimeSql(
      users.auditor,
      "update governance.audit_event set outcome='REWRITTEN' where id=$1",
      [eventId],
    );
    await expectDeniedRuntimeSql(
      users.auditor,
      "delete from governance.audit_event where id=$1",
      [eventId],
    );
    await expectDeniedRuntimeSql(
      users.superuser,
      "update governance.audit_event set outcome='REWRITTEN' where id=$1",
      [eventId],
    );
    expect(
      (await pool.query("select outcome from governance.audit_event where id=$1", [eventId]))
        .rows[0]?.outcome,
    ).toBe("SUCCESS");
  });

  it("rolls back a governance mutation when required canonical Audit cannot be appended", async () => {
    const user = asUser(users.requester, "atomic-request-audit");
    const context = createDatabaseSecurityContext({
      authUserId: user.authUserId,
      requestId: user.operation.requestId,
      correlationId: user.operation.correlationId,
    });
    const resourceId = randomUUID();

    await expect(
      runtime.unitOfWork.withRlsTransaction(context, async (uow) => {
        await uow.repository(governanceRepository).createApprovalRequest({
          id: ids.next(),
          resource: { type: "manufacturing.job", id: iid(resourceId) },
          requestedAction: "ENGINEERING_RELEASE",
          policyCode: "engineering.release",
          requestedAt: clock.nowUtc(),
          scope: { organisationId: iid(fixture.orgA) },
          requiredApprovalCount: 1,
          requireDistinctHumans: false,
          selfApprovalAllowed: false,
          requiredCapabilityCodes: ["governance.approval.decide"],
          requestCapabilityCode: "governance.approval.request",
          operation: user.operation,
        });
        await audit.appendHumanWithin(uow, user, {
          authorizingCapability: "governance.approval.request",
          eventType: "governance.test.atomic",
          scope: { organisationId: iid(fixture.orgA) },
          resource: { type: "manufacturing.job", id: iid(resourceId) },
          action: "APPROVAL_REQUESTED",
          outcome: "PENDING",
          sourceModule: "governance.test",
          metadata: { token: "reject-and-rollback" },
        });
      }),
    ).rejects.toThrow();

    expect(
      (
        await pool.query(
          "select count(*)::int count from governance.approval_request where command_id=$1",
          [user.operation.commandId],
        )
      ).rows[0]?.count,
    ).toBe(0);
  });

  it("enforces self-approval policy, distinct humans, two-role identity and immutable decisions", async () => {
    const resourceId = randomUUID();
    const requestUser = asUser(users.requester, "approval-two-person-request");
    const request = await approvals.request(requestUser, {
      resource: { type: "manufacturing.job", id: iid(resourceId) },
      requestedAction: "ENGINEERING_RELEASE",
      policyCode: "engineering.quality.maker_checker",
      scope: { organisationId: iid(fixture.orgA) },
      requiredApprovalCount: 2,
      requireDistinctHumans: true,
      selfApprovalAllowed: false,
      requiredCapabilityCodes: ["governance.approval.decide"],
    });
    expect(request.status).toBe("PENDING");

    await expect(
      approvals.decide(asUser(users.requester, "approval-self-denied"), {
        approvalRequestId: request.id,
        decision: "APPROVE",
        capabilityCode: "governance.approval.decide",
      }),
    ).rejects.toThrow();

    const first = await approvals.decide(asUser(users.approverA, "approval-first"), {
      approvalRequestId: request.id,
      decision: "APPROVE",
      capabilityCode: "governance.approval.decide",
      reason: "Engineering acceptance",
    });
    expect(first.status).toBe("PENDING");

    await expect(
      approvals.decide(asUser(users.approverA, "approval-same-human-second-role"), {
        approvalRequestId: request.id,
        decision: "APPROVE",
        capabilityCode: "governance.approval.decide",
      }),
    ).rejects.toThrow();

    const second = await approvals.decide(asUser(users.approverB, "approval-second"), {
      approvalRequestId: request.id,
      decision: "APPROVE",
      capabilityCode: "governance.approval.decide",
      reason: "Quality acceptance",
    });
    expect(second.status).toBe("APPROVED");

    const decisions = await pool.query(
      `select id,approver_user_id,decision
       from governance.approval_decision where approval_request_id=$1 order by decided_at,id`,
      [request.id],
    );
    expect(decisions.rows).toHaveLength(2);
    expect(new Set(decisions.rows.map((row) => row.approver_user_id)).size).toBe(2);

    await expectDeniedRuntimeSql(
      users.approverA,
      "update governance.approval_decision set decision='REJECT' where id=$1",
      [first.id],
    );
    await expectDeniedRuntimeSql(
      users.approverA,
      "delete from governance.approval_decision where id=$1",
      [first.id],
    );
    expect(
      (
        await pool.query(
          "select decision from governance.approval_decision where id=$1",
          [first.id],
        )
      ).rows[0]?.decision,
    ).toBe("APPROVE");
  });

  it("allows self-approval only when explicit policy permits and preserves rejected evidence", async () => {
    const self = await approvals.request(asUser(users.requester, "self-allowed-request"), {
      resource: { type: "quality.ncr", id: iid(randomUUID()) },
      requestedAction: "NCR_DISPOSITION",
      policyCode: "test.self.allowed",
      scope: { organisationId: iid(fixture.orgA) },
      requiredApprovalCount: 1,
      requireDistinctHumans: false,
      selfApprovalAllowed: true,
      requiredCapabilityCodes: ["governance.approval.decide"],
    });
    const selfDecision = await approvals.decide(
      asUser(users.requester, "self-allowed-decision"),
      {
        approvalRequestId: self.id,
        decision: "APPROVE",
        capabilityCode: "governance.approval.decide",
      },
    );
    expect(selfDecision.status).toBe("APPROVED");

    const rejected = await approvals.request(
      asUser(users.requester, "reject-request"),
      {
        resource: { type: "quality.ncr", id: iid(randomUUID()) },
        requestedAction: "NCR_DISPOSITION",
        policyCode: "test.reject",
        scope: { organisationId: iid(fixture.orgA) },
        requiredApprovalCount: 1,
        requireDistinctHumans: false,
        selfApprovalAllowed: false,
        requiredCapabilityCodes: ["governance.approval.decide"],
      },
    );
    const rejection = await approvals.decide(
      asUser(users.approverA, "reject-decision"),
      {
        approvalRequestId: rejected.id,
        decision: "REJECT",
        capabilityCode: "governance.approval.decide",
        reason: "Evidence insufficient",
      },
    );
    expect(rejection.status).toBe("REJECTED");
    expect(
      (
        await pool.query(
          "select decision from governance.approval_decision where id=$1",
          [rejection.id],
        )
      ).rows[0]?.decision,
    ).toBe("REJECT");
  });

  it("handles idempotent retries and concurrent terminal approval correctly", async () => {
    const retryRequestUser = asUser(users.requester, "approval-retry-request");
    const request = await approvals.request(retryRequestUser, {
      resource: { type: "dispatch.release", id: iid(randomUUID()) },
      requestedAction: "DISPATCH_AUTHORISATION",
      policyCode: "dispatch.single",
      scope: { organisationId: iid(fixture.orgA) },
      requiredApprovalCount: 1,
      requireDistinctHumans: false,
      selfApprovalAllowed: false,
      requiredCapabilityCodes: ["governance.approval.decide"],
    });

    const decisionUser = asUser(users.approverA, "approval-retry-decision");
    const first = await approvals.decide(decisionUser, {
      approvalRequestId: request.id,
      decision: "APPROVE",
      capabilityCode: "governance.approval.decide",
    });
    const retry = await approvals.decide(decisionUser, {
      approvalRequestId: request.id,
      decision: "APPROVE",
      capabilityCode: "governance.approval.decide",
    });
    expect(retry.id).toBe(first.id);
    expect(retry.replayed).toBe(true);
    expect(
      (
        await pool.query(
          "select count(*)::int count from governance.approval_decision where approval_request_id=$1",
          [request.id],
        )
      ).rows[0]?.count,
    ).toBe(1);

    const concurrent = await approvals.request(
      asUser(users.requester, "approval-concurrent-request"),
      {
        resource: { type: "dispatch.release", id: iid(randomUUID()) },
        requestedAction: "DISPATCH_AUTHORISATION",
        policyCode: "dispatch.concurrent",
        scope: { organisationId: iid(fixture.orgA) },
        requiredApprovalCount: 1,
        requireDistinctHumans: true,
        selfApprovalAllowed: false,
        requiredCapabilityCodes: ["governance.approval.decide"],
      },
    );

    const outcomes = await Promise.allSettled([
      approvals.decide(asUser(users.approverA, "approval-concurrent-a"), {
        approvalRequestId: concurrent.id,
        decision: "APPROVE",
        capabilityCode: "governance.approval.decide",
      }),
      approvals.decide(asUser(users.approverB, "approval-concurrent-b"), {
        approvalRequestId: concurrent.id,
        decision: "APPROVE",
        capabilityCode: "governance.approval.decide",
      }),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      (
        await pool.query(
          "select status from governance.approval_request where id=$1",
          [concurrent.id],
        )
      ).rows[0]?.status,
    ).toBe("APPROVED");
    expect(
      (
        await pool.query(
          "select count(*)::int count from governance.approval_decision where approval_request_id=$1",
          [concurrent.id],
        )
      ).rows[0]?.count,
    ).toBe(1);
  });

  it("denies cross-scope, inactive assignment, direct decision fabrication and SUPERUSER approval", async () => {
    const request = await approvals.request(
      asUser(users.requester, "approval-adversarial-request"),
      {
        resource: { type: "manufacturing.job", id: iid(randomUUID()) },
        requestedAction: "FG_RELEASE",
        policyCode: "fg.release",
        scope: { organisationId: iid(fixture.orgA) },
        requiredApprovalCount: 1,
        requireDistinctHumans: false,
        selfApprovalAllowed: false,
        requiredCapabilityCodes: ["governance.approval.decide"],
      },
    );

    await expect(
      approvals.decide(asUser(users.outsider, "approval-cross-scope"), {
        approvalRequestId: request.id,
        decision: "APPROVE",
        capabilityCode: "governance.approval.decide",
      }),
    ).rejects.toThrow();
    await expect(
      approvals.decide(asUser(users.inactive, "approval-inactive"), {
        approvalRequestId: request.id,
        decision: "APPROVE",
        capabilityCode: "governance.approval.decide",
      }),
    ).rejects.toThrow();
    await expect(
      approvals.decide(asUser(users.superuser, "approval-superuser"), {
        approvalRequestId: request.id,
        decision: "APPROVE",
        capabilityCode: "governance.approval.decide",
      }),
    ).rejects.toThrow();

    await expectDeniedRuntimeSql(
      users.approverA,
      `insert into governance.approval_decision
        (id,approval_request_id,approver_user_id,decision,capability_code,decided_at,
         organisation_id,request_id,command_id,correlation_id)
       values ($1,$2,$3,'APPROVE','governance.approval.decide',now(),$4,'req-fabricated',$5,$6)`,
      [
        randomUUID(),
        request.id,
        users.approverA.profileId,
        fixture.orgA,
        randomUUID(),
        randomUUID(),
      ],
    );

    const outsiderClient = await beginAsUser(users.outsider, "req-cross-scope-read");
    try {
      expect(
        (
          await outsiderClient.query(
            "select id from governance.approval_request where id=$1",
            [request.id],
          )
        ).rows,
      ).toHaveLength(0);
    } finally {
      await outsiderClient.query("rollback");
      outsiderClient.release();
    }
  });

  it("places Holds, blocks protected actions, releases explicitly and preserves immutable history", async () => {
    const resourceId = randomUUID();
    const placed = await holds.place(asUser(users.requester, "hold-place"), {
      resource: { type: "manufacturing.job", id: iid(resourceId) },
      holdType: "MATERIAL",
      blockedAction: "MANUFACTURING_RELEASE",
      reason: "Material traceability incomplete",
      scope: { organisationId: iid(fixture.orgA) },
    });
    expect(placed.status).toBe("ACTIVE");

    await expect(requireNoHold(asUser(users.requester, "hold-block-check"), resourceId))
      .rejects.toThrow();

    await expect(
      holds.release(asUser(users.requester, "hold-release-unauthorised"), {
        holdId: placed.id,
        reason: "Requester cannot release without authority",
      }),
    ).rejects.toThrow();

    const released = await holds.release(asUser(users.approverA, "hold-release"), {
      holdId: placed.id,
      reason: "Material traceability verified",
    });
    expect(released.status).toBe("RELEASED");
    await expect(requireNoHold(asUser(users.requester, "hold-clear-check"), resourceId))
      .resolves.toBeUndefined();

    const canonical = await pool.query(
      "select status,placed_by_user_id,released_by_user_id,release_reason from governance.hold where id=$1",
      [placed.id],
    );
    expect(canonical.rows[0]).toMatchObject({
      status: "RELEASED",
      placed_by_user_id: users.requester.profileId,
      released_by_user_id: users.approverA.profileId,
      release_reason: "Material traceability verified",
    });

    const history = await pool.query(
      "select id,action from governance.hold_action where hold_id=$1 order by acted_at,id",
      [placed.id],
    );
    expect(history.rows.map((row) => row.action).sort()).toEqual([
      "HOLD_PLACED",
      "HOLD_RELEASED",
    ]);
    await expectDeniedRuntimeSql(
      users.requester,
      "update governance.hold_action set reason='rewritten' where id=$1",
      [history.rows[0].id],
    );
    await expectDeniedRuntimeSql(
      users.requester,
      "delete from governance.hold_action where id=$1",
      [history.rows[0].id],
    );
  });

  it("requires approval evidence for protected Hold release and gives SUPERUSER no schedule override", async () => {
    const resourceId = randomUUID();
    const engineeringHold = await holds.place(
      asUser(users.requester, "engineering-hold-place"),
      {
        resource: { type: "manufacturing.job", id: iid(resourceId) },
        holdType: "ENGINEERING",
        blockedAction: "MANUFACTURING_RELEASE",
        reason: "Technical acceptability requires Engineering disposition",
        scope: { organisationId: iid(fixture.orgA) },
        releaseRequiresApproval: true,
      },
    );

    await expect(
      holds.release(asUser(users.approverA, "engineering-release-no-evidence"), {
        holdId: engineeringHold.id,
        reason: "Schedule pressure is not release evidence",
      }),
    ).rejects.toThrow();

    await expect(
      holds.release(asUser(users.superuser, "engineering-superuser-override"), {
        holdId: engineeringHold.id,
        reason: "Attempted admin schedule override",
      }),
    ).rejects.toThrow();

    const releaseApproval = await approvals.request(
      asUser(users.requester, "engineering-release-request"),
      {
        resource: { type: "manufacturing.job", id: iid(resourceId) },
        requestedAction: "ENGINEERING_HOLD_RELEASE",
        policyCode: "engineering.hold.release",
        scope: { organisationId: iid(fixture.orgA) },
        requiredApprovalCount: 1,
        requireDistinctHumans: false,
        selfApprovalAllowed: false,
        requiredCapabilityCodes: ["governance.approval.decide"],
      },
    );
    await approvals.decide(asUser(users.approverB, "engineering-release-approve"), {
      approvalRequestId: releaseApproval.id,
      decision: "APPROVE",
      capabilityCode: "governance.approval.decide",
      reason: "Technical disposition accepted",
    });

    const released = await holds.release(
      asUser(users.approverA, "engineering-release-with-evidence"),
      {
        holdId: engineeringHold.id,
        reason: "Released against approved technical disposition",
        approvalRequestId: releaseApproval.id,
      },
    );
    expect(released.status).toBe("RELEASED");
  });

  it("handles duplicate placement and concurrent Hold release without rewriting history", async () => {
    const resourceId = randomUUID();
    const first = await holds.place(asUser(users.requester, "hold-duplicate-first"), {
      resource: { type: "manufacturing.job", id: iid(resourceId) },
      holdType: "QUALITY",
      blockedAction: "MANUFACTURING_RELEASE",
      reason: "Quality evidence incomplete",
      scope: { organisationId: iid(fixture.orgA) },
    });

    await expect(
      holds.place(asUser(users.requester, "hold-duplicate-second"), {
        resource: { type: "manufacturing.job", id: iid(resourceId) },
        holdType: "QUALITY",
        blockedAction: "MANUFACTURING_RELEASE",
        reason: "Second active duplicate",
        scope: { organisationId: iid(fixture.orgA) },
      }),
    ).rejects.toThrow();

    const outcomes = await Promise.allSettled([
      holds.release(asUser(users.approverA, "hold-concurrent-a"), {
        holdId: first.id,
        reason: "Release A",
      }),
      holds.release(asUser(users.approverB, "hold-concurrent-b"), {
        holdId: first.id,
        reason: "Release B",
      }),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      (
        await pool.query(
          "select count(*)::int count from governance.hold_action where hold_id=$1 and action='HOLD_RELEASED'",
          [first.id],
        )
      ).rows[0]?.count,
    ).toBe(1);
    expect(
      (await pool.query("select status from governance.hold where id=$1", [first.id]))
        .rows[0]?.status,
    ).toBe("RELEASED");
  });
});

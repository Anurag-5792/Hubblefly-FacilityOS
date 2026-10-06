import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AuthorizationService,
  SUPERUSER_CAPABILITY,
  buildAuthenticatedHuman,
  parseSupabaseAuthUserId,
  userProfileRepository,
} from "../../../src/domains/iam";
import {
  closeApplicationDatabaseRuntime,
  getApplicationDatabaseRuntime,
} from "../../../src/platform/db/server";
import {
  SystemClock,
  createOperationContext,
  parseCommandId,
  parseCorrelationId,
  parseRequestId,
} from "../../../src/platform/primitives";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL!;
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(apiUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 2000,
});

const ids = {
  orgA: randomUUID(), orgB: randomUUID(),
  legalA: randomUUID(), legalB: randomUUID(), legalOther: randomUUID(),
  sharedSite: randomUUID(), otherSite: randomUUID(),
  siteRelA: randomUUID(), siteRelB: randomUUID(), otherSiteRel: randomUUID(),
  seriesA: randomUUID(), sequenceA: randomUUID(), seriesB: randomUUID(), sequenceB: randomUUID(),
  viewCapability: randomUUID(), superCapability: randomUUID(),
  siteRole: randomUUID(), orgBRole: randomUUID(), expiredRole: randomUUID(),
  futureRole: randomUUID(), inactiveAssignmentRole: randomUUID(), superRole: randomUUID(),
  siteRoleMap: randomUUID(), orgBRoleMap: randomUUID(), expiredRoleMap: randomUUID(),
  futureRoleMap: randomUUID(), inactiveAssignmentRoleMap: randomUUID(), superRoleMap: randomUUID(),
  assignmentA: randomUUID(), assignmentB: randomUUID(), expiredAssignment: randomUUID(),
  futureAssignment: randomUUID(), inactiveAssignment: randomUUID(),
  inactiveProfileAssignment: randomUUID(), superAssignment: randomUUID(),
};

const users = {
  a: { authId: "", profileId: randomUUID(), email: "", password: "W0-08-User-A-Password-123!" },
  b: { authId: "", profileId: randomUUID(), email: "", password: "W0-08-User-B-Password-123!" },
  expired: { authId: "", profileId: randomUUID(), email: "", password: "W0-08-Expired-Password-123!" },
  future: { authId: "", profileId: randomUUID(), email: "", password: "W0-08-Future-Password-123!" },
  inactiveAssignment: { authId: "", profileId: randomUUID(), email: "", password: "W0-08-Inactive-Assignment-123!" },
  inactiveProfile: { authId: "", profileId: randomUUID(), email: "", password: "W0-08-Inactive-Profile-123!" },
  superuser: { authId: "", profileId: randomUUID(), email: "", password: "W0-08-Superuser-Password-123!" },
};

const operation = createOperationContext({
  requestId: parseRequestId("req-w0-08-rls"),
  commandId: parseCommandId("123e4567-e89b-42d3-a456-426614174880"),
  correlationId: parseCorrelationId("123e4567-e89b-42d3-a456-426614174881"),
});

async function createAuthUser(entry: typeof users.a, label: string) {
  entry.email = `w008-${label}-${randomUUID()}@example.invalid`;
  const created = await admin.auth.admin.createUser({
    email: entry.email,
    password: entry.password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("W0-08 auth user not created.");
  }
  entry.authId = created.data.user.id;
}

async function seed() {
  for (const [label, entry] of Object.entries(users)) {
    await createAuthUser(entry, label);
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const actor = "w0-08-rls-test";

    for (const row of [
      [ids.orgA, "RLSA", "RLS Organisation A"],
      [ids.orgB, "RLSB", "RLS Organisation B"],
    ]) {
      await client.query(
        `insert into core.organisation
          (id, code, name, status, version, created_at, created_actor_type, created_actor_id,
           updated_at, updated_actor_type, updated_actor_id)
         values ($1,$2,$3,'ACTIVE',0,now(),'SYSTEM',$4,now(),'SYSTEM',$4)`,
        [row[0], row[1], row[2], actor],
      );
    }

    for (const row of [
      [ids.legalA, ids.orgA, "RLSLEA", "RLS Legal Entity A"],
      [ids.legalB, ids.orgA, "RLSLEB", "RLS Legal Entity B"],
      [ids.legalOther, ids.orgB, "RLSLEO", "RLS Legal Entity Other"],
    ]) {
      await client.query(
        `insert into core.legal_entity
          (id, organisation_id, code, legal_name, status, version, created_at,
           created_actor_type, created_actor_id, updated_at, updated_actor_type, updated_actor_id)
         values ($1,$2,$3,$4,'ACTIVE',0,now(),'SYSTEM',$5,now(),'SYSTEM',$5)`,
        [row[0], row[1], row[2], row[3], actor],
      );
    }

    for (const row of [
      [ids.sharedSite, ids.orgA, "RLSSHARED", "RLS Shared Site"],
      [ids.otherSite, ids.orgA, "RLSOTHER", "RLS Other Site"],
    ]) {
      await client.query(
        `insert into core.site
          (id, organisation_id, code, name, status, version, created_at,
           created_actor_type, created_actor_id, updated_at, updated_actor_type, updated_actor_id)
         values ($1,$2,$3,$4,'ACTIVE',0,now(),'SYSTEM',$5,now(),'SYSTEM',$5)`,
        [row[0], row[1], row[2], row[3], actor],
      );
    }

    for (const row of [
      [ids.siteRelA, ids.orgA, ids.sharedSite, ids.legalA],
      [ids.siteRelB, ids.orgA, ids.sharedSite, ids.legalB],
      [ids.otherSiteRel, ids.orgA, ids.otherSite, ids.legalA],
    ]) {
      await client.query(
        `insert into core.site_legal_entity
          (id, organisation_id, site_id, legal_entity_id, status, version, created_at,
           created_actor_type, created_actor_id, updated_at, updated_actor_type, updated_actor_id)
         values ($1,$2,$3,$4,'ACTIVE',0,now(),'SYSTEM',$5,now(),'SYSTEM',$5)`,
        [row[0], row[1], row[2], row[3], actor],
      );
    }

    for (const entry of Object.values(users)) {
      await client.query(
        `insert into iam.user_profile
          (id, auth_user_id, display_name, email_snapshot, status, version, created_at,
           created_actor_type, created_actor_id, updated_at, updated_actor_type, updated_actor_id)
         values ($1,$2,$3,$4,$5,0,now(),'SYSTEM',$6,now(),'SYSTEM',$6)`,
        [
          entry.profileId,
          entry.authId,
          "W0-08 " + entry.email,
          entry.email,
          entry === users.inactiveProfile ? "INACTIVE" : "ACTIVE",
          actor,
        ],
      );
    }

    for (const row of [
      [ids.viewCapability, "inventory.physical_count.view", "View physical count"],
      [ids.superCapability, SUPERUSER_CAPABILITY, "FacilityOS superuser"],
    ]) {
      await client.query(
        `insert into iam.capability
          (id, code, display_name, kind, status, version, created_at, created_actor_type,
           created_actor_id, updated_at, updated_actor_type, updated_actor_id)
         values ($1,$2,$3,'SYSTEM','ACTIVE',0,now(),'SYSTEM',$4,now(),'SYSTEM',$4)`,
        [row[0], row[1], row[2], actor],
      );
    }

    for (const row of [
      [ids.siteRole, "RLS_SITE_A", "RLS Site A"],
      [ids.orgBRole, "RLS_ORG_B", "RLS Org B"],
      [ids.expiredRole, "RLS_EXPIRED", "RLS Expired"],
      [ids.futureRole, "RLS_FUTURE", "RLS Future"],
      [ids.inactiveAssignmentRole, "RLS_INACTIVE_ASSIGNMENT", "RLS Inactive Assignment"],
      [ids.superRole, "RLS_SUPERUSER", "RLS Superuser"],
    ]) {
      await client.query(
        `insert into iam.role
          (id, code, display_name, kind, status, version, created_at, created_actor_type,
           created_actor_id, updated_at, updated_actor_type, updated_actor_id)
         values ($1,$2,$3,'SYSTEM','ACTIVE',0,now(),'SYSTEM',$4,now(),'SYSTEM',$4)`,
        [row[0], row[1], row[2], actor],
      );
    }

    for (const row of [
      [ids.siteRoleMap, ids.siteRole, ids.viewCapability],
      [ids.orgBRoleMap, ids.orgBRole, ids.viewCapability],
      [ids.expiredRoleMap, ids.expiredRole, ids.viewCapability],
      [ids.futureRoleMap, ids.futureRole, ids.viewCapability],
      [ids.inactiveAssignmentRoleMap, ids.inactiveAssignmentRole, ids.viewCapability],
      [ids.superRoleMap, ids.superRole, ids.superCapability],
    ]) {
      await client.query(
        `insert into iam.role_capability
          (id, role_id, capability_id, status, version, created_at, created_actor_type,
           created_actor_id, updated_at, updated_actor_type, updated_actor_id)
         values ($1,$2,$3,'ACTIVE',0,now(),'SYSTEM',$4,now(),'SYSTEM',$4)`,
        [row[0], row[1], row[2], actor],
      );
    }

    const assignmentRows = [
      {id: ids.assignmentA, user: users.a.profileId, role: ids.siteRole, org: ids.orgA, le: ids.legalA, site: ids.sharedSite, level: "SITE", from: "now() - interval '1 day'", until: "null", status: "ACTIVE"},
      {id: ids.assignmentB, user: users.b.profileId, role: ids.orgBRole, org: ids.orgB, le: null, site: null, level: "ORGANISATION", from: "now() - interval '1 day'", until: "null", status: "ACTIVE"},
      {id: ids.expiredAssignment, user: users.expired.profileId, role: ids.expiredRole, org: ids.orgA, le: null, site: null, level: "ORGANISATION", from: "now() - interval '2 days'", until: "now() - interval '1 day'", status: "ACTIVE"},
      {id: ids.futureAssignment, user: users.future.profileId, role: ids.futureRole, org: ids.orgA, le: null, site: null, level: "ORGANISATION", from: "now() + interval '1 day'", until: "null", status: "ACTIVE"},
      {id: ids.inactiveAssignment, user: users.inactiveAssignment.profileId, role: ids.inactiveAssignmentRole, org: ids.orgA, le: null, site: null, level: "ORGANISATION", from: "now() - interval '1 day'", until: "null", status: "INACTIVE"},
      {id: ids.inactiveProfileAssignment, user: users.inactiveProfile.profileId, role: ids.siteRole, org: ids.orgA, le: ids.legalA, site: ids.sharedSite, level: "SITE", from: "now() - interval '1 day'", until: "null", status: "ACTIVE"},
      {id: ids.superAssignment, user: users.superuser.profileId, role: ids.superRole, org: ids.orgA, le: ids.legalA, site: ids.sharedSite, level: "SITE", from: "now() - interval '1 day'", until: "null", status: "ACTIVE"},
    ];

    for (const row of assignmentRows) {
      await client.query(
        `insert into iam.role_assignment
          (id, user_profile_id, role_id, organisation_id, legal_entity_id, site_id, scope_level,
           valid_from, valid_until, status, version, created_at, created_actor_type, created_actor_id,
           updated_at, updated_actor_type, updated_actor_id)
         values ($1,$2,$3,$4,$5,$6,$7,${row.from},${row.until},$8,0,now(),'SYSTEM',$9,now(),'SYSTEM',$9)`,
        [row.id, row.user, row.role, row.org, row.le, row.site, row.level, row.status, actor],
      );
    }

    await client.query(
      `insert into core.identifier_series
        (id, organisation_id, series_key, format_template, sequence_width, scope_legal_entity,
         scope_site, requires_period, status, version, created_at, created_actor_type,
         created_actor_id, updated_at, updated_actor_type, updated_actor_id)
       values
        ($1,$2,'rls.site.sequence','RLS-{sequence}',6,true,true,false,'ACTIVE',0,now(),'SYSTEM',$5,now(),'SYSTEM',$5),
        ($3,$4,'rls.other.sequence','RLSB-{sequence}',6,false,false,false,'ACTIVE',0,now(),'SYSTEM',$5,now(),'SYSTEM',$5)`,
      [ids.seriesA, ids.orgA, ids.seriesB, ids.orgB, actor],
    );

    await client.query(
      `insert into core.identifier_sequence
        (id, series_id, organisation_id, legal_entity_id, site_id, next_value, version,
         created_at, updated_at, updated_actor_type, updated_actor_id)
       values
        ($1,$2,$3,$4,$5,1,0,now(),now(),'SYSTEM',$10),
        ($6,$7,$8,null,null,1,0,now(),now(),'SYSTEM',$10)`,
      [
        ids.sequenceA, ids.seriesA, ids.orgA, ids.legalA, ids.sharedSite,
        ids.sequenceB, ids.seriesB, ids.orgB, actor,
      ],
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function beginAsUser(authUserId: string) {
  const client = await pool.connect();
  await client.query("begin");
  await client.query("set local role facilityos_user_runtime");
  await client.query("set local row_security = on");
  await client.query(
    "select facilityos_security.establish_authenticated_context($1::uuid,$2,$3::uuid)",
    [authUserId, "req-w0-08-direct", randomUUID()],
  );
  return client;
}

async function deniedRuntimeSql(
  authUserId: string,
  statement: string,
  params: unknown[] = [],
) {
  const client = await beginAsUser(authUserId);
  try {
    await expect(client.query(statement, params)).rejects.toThrow();
  } finally {
    await client.query("rollback");
    client.release();
  }
}

describe("W0-08 PostgreSQL RLS and runtime-role enforcement", () => {
  beforeAll(async () => {
    expect(databaseUrl).toMatch(/^postgres(?:ql)?:\/\//);
    expect(apiUrl).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):/);
    await seed();
  });

  afterAll(async () => {
    await closeApplicationDatabaseRuntime();
    await pool.end();
  });

  it("creates non-owner NOLOGIN/NOBYPASSRLS roles and FORCE RLS tables", async () => {
    const roles = await pool.query(
      `select rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole
       from pg_roles
       where rolname in ('facilityos_user_runtime','facilityos_security_admin')
       order by rolname`,
    );
    expect(roles.rows).toHaveLength(2);
    for (const role of roles.rows) {
      expect(role.rolsuper).toBe(false);
      expect(role.rolbypassrls).toBe(false);
      expect(role.rolcanlogin).toBe(false);
      expect(role.rolcreatedb).toBe(false);
      expect(role.rolcreaterole).toBe(false);
    }

    const tables = await pool.query(
      `select n.nspname as schema_name, c.relname as table_name,
              owner.rolname as owner_name, c.relrowsecurity, c.relforcerowsecurity
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       join pg_roles owner on owner.oid = c.relowner
       where (n.nspname, c.relname) in (
         ('core','organisation'), ('core','legal_entity'), ('core','site'),
         ('core','site_legal_entity'), ('core','identifier_series'),
         ('core','identifier_sequence'), ('core','identifier_allocation'),
         ('iam','user_profile'), ('iam','role'), ('iam','capability'),
         ('iam','role_capability'), ('iam','role_assignment')
       )
       order by n.nspname, c.relname`,
    );
    expect(tables.rows).toHaveLength(12);
    for (const table of tables.rows) {
      expect(table.relrowsecurity).toBe(true);
      expect(table.relforcerowsecurity).toBe(true);
      expect(["facilityos_user_runtime", "facilityos_security_admin"])
        .not.toContain(table.owner_name);
    }
  });

  it("denies anon/authenticated direct DB access and missing runtime context", async () => {
    for (const role of ["anon", "authenticated"]) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("set local role " + role);
        await expect(client.query("select id from core.organisation")).rejects.toThrow();
      } finally {
        await client.query("rollback");
        client.release();
      }
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role facilityos_user_runtime");
      expect((await client.query("select id from core.organisation")).rows)
        .toHaveLength(0);
      await client.query("commit");
    } finally {
      client.release();
    }
  });

  it("enforces Organisation, Legal Entity, Site and shared-Site isolation", async () => {
    const client = await beginAsUser(users.a.authId);
    try {
      expect((await client.query("select id from core.organisation order by id")).rows.map((r) => r.id))
        .toEqual([ids.orgA]);
      expect((await client.query("select id from core.legal_entity order by id")).rows.map((r) => r.id))
        .toEqual([ids.legalA]);
      expect((await client.query("select id from core.site order by id")).rows.map((r) => r.id))
        .toEqual([ids.sharedSite]);

      const pairs = await client.query(
        "select legal_entity_id from core.site_legal_entity where site_id=$1 order by legal_entity_id",
        [ids.sharedSite],
      );
      expect(pairs.rows.map((r) => r.legal_entity_id)).toEqual([ids.legalA]);

      expect((await client.query("select id from core.identifier_sequence order by id")).rows.map((r) => r.id))
        .toEqual([ids.sequenceA]);
      await client.query("commit");
    } finally {
      client.release();
    }
  });

  it("blocks cross-scope direct SQL mutation while allowing the exact assigned sequence", async () => {
    const client = await beginAsUser(users.a.authId);
    try {
      const own = await client.query(
        `update core.identifier_sequence
         set next_value=next_value+1, version=version+1, updated_at=now(),
             updated_actor_type='HUMAN', updated_actor_id=$2
         where id=$1 returning id`,
        [ids.sequenceA, users.a.profileId],
      );
      expect(own.rows.map((r) => r.id)).toEqual([ids.sequenceA]);

      const foreign = await client.query(
        `update core.identifier_sequence
         set next_value=next_value+1, version=version+1, updated_at=now(),
             updated_actor_type='HUMAN', updated_actor_id=$2
         where id=$1 returning id`,
        [ids.sequenceB, users.a.profileId],
      );
      expect(foreign.rows).toHaveLength(0);

      await expect(client.query(
        `insert into core.identifier_sequence
          (id, series_id, organisation_id, legal_entity_id, site_id, next_value, version,
           created_at, updated_at, updated_actor_type, updated_actor_id)
         values ($1,$2,$3,null,null,1,0,now(),now(),'HUMAN',$4)`,
        [randomUUID(), ids.seriesB, ids.orgB, users.a.profileId],
      )).rejects.toThrow();
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("denies inactive, future and expired assignments and inactive profiles", async () => {
    for (const entry of [
      users.expired,
      users.future,
      users.inactiveAssignment,
      users.inactiveProfile,
    ]) {
      const client = await beginAsUser(entry.authId);
      try {
        expect((await client.query("select id from core.organisation")).rows)
          .toHaveLength(0);
        await client.query("commit");
      } finally {
        client.release();
      }
    }
  });

  it("applies revocation on the next transaction", async () => {
    let client = await beginAsUser(users.a.authId);
    try {
      expect((await client.query("select id from core.organisation")).rows)
        .toHaveLength(1);
      await client.query("commit");
    } finally {
      client.release();
    }

    await pool.query(
      "update iam.role_assignment set status='INACTIVE', version=version+1 where id=$1",
      [ids.assignmentA],
    );

    client = await beginAsUser(users.a.authId);
    try {
      expect((await client.query("select id from core.organisation")).rows)
        .toHaveLength(0);
      await client.query("commit");
    } finally {
      client.release();
    }

    await pool.query(
      "update iam.role_assignment set status='ACTIVE', version=version+1 where id=$1",
      [ids.assignmentA],
    );
  });

  it("prevents security self-grant and profile security-field changes", async () => {
    await deniedRuntimeSql(
      users.a.authId,
      `insert into iam.role
        (id,code,display_name,kind,status,version,created_at,created_actor_type,
         created_actor_id,updated_at,updated_actor_type,updated_actor_id)
       values ($1,'SELF_GRANT','Self Grant','CUSTOM','ACTIVE',0,now(),'HUMAN',$2,now(),'HUMAN',$2)`,
      [randomUUID(), users.a.profileId],
    );

    await deniedRuntimeSql(
      users.a.authId,
      `insert into iam.capability
        (id,code,display_name,kind,status,version,created_at,created_actor_type,
         created_actor_id,updated_at,updated_actor_type,updated_actor_id)
       values ($1,'security.self_grant','Self Grant','CUSTOM','ACTIVE',0,now(),'HUMAN',$2,now(),'HUMAN',$2)`,
      [randomUUID(), users.a.profileId],
    );

    await deniedRuntimeSql(
      users.a.authId,
      `insert into iam.role_assignment
        (id,user_profile_id,role_id,organisation_id,scope_level,valid_from,status,
         version,created_at,created_actor_type,created_actor_id,updated_at,
         updated_actor_type,updated_actor_id)
       values ($1,$2,$3,$4,'ORGANISATION',now(),'ACTIVE',0,now(),'HUMAN',$2,now(),'HUMAN',$2)`,
      [randomUUID(), users.a.profileId, ids.orgBRole, ids.orgB],
    );

    await deniedRuntimeSql(
      users.a.authId,
      "update iam.role_capability set status='INACTIVE' where id=$1",
      [ids.siteRoleMap],
    );
    await deniedRuntimeSql(
      users.a.authId,
      "update iam.user_profile set auth_user_id=$1 where id=$2",
      [users.b.authId, users.a.profileId],
    );
    await deniedRuntimeSql(
      users.inactiveProfile.authId,
      "update iam.user_profile set status='ACTIVE' where id=$1",
      [users.inactiveProfile.profileId],
    );
    await deniedRuntimeSql(
      users.a.authId,
      "update iam.user_profile set display_name='changed' where id=$1",
      [users.b.profileId],
    );
  });

  it("does not leak identity across pooled connection reuse or rollback", async () => {
    let client = await pool.connect();
    let firstPid = 0;
    try {
      firstPid = Number(
        (await client.query("select pg_backend_pid() as pid")).rows[0]?.pid,
      );
      await client.query("begin");
      await client.query("set local role facilityos_user_runtime");
      await client.query(
        "select facilityos_security.establish_authenticated_context($1::uuid,$2,$3::uuid)",
        [users.a.authId, "req-pool-a", randomUUID()],
      );
      expect((await client.query("select id from core.organisation")).rows.map((r) => r.id))
        .toEqual([ids.orgA]);
      await client.query("commit");
    } finally {
      client.release();
    }

    client = await pool.connect();
    try {
      expect(Number(
        (await client.query("select pg_backend_pid() as pid")).rows[0]?.pid,
      )).toBe(firstPid);

      await client.query("begin");
      await client.query("set local role facilityos_user_runtime");
      expect((await client.query("select id from core.organisation")).rows)
        .toHaveLength(0);

      await client.query(
        "select facilityos_security.establish_authenticated_context($1::uuid,$2,$3::uuid)",
        [users.b.authId, "req-pool-b", randomUUID()],
      );
      expect((await client.query("select id from core.organisation")).rows.map((r) => r.id))
        .toEqual([ids.orgB]);
      await client.query("rollback");

      await client.query("begin");
      await client.query("set local role facilityos_user_runtime");
      expect((await client.query("select id from core.organisation")).rows)
        .toHaveLength(0);
      await client.query("rollback");
    } finally {
      client.release();
    }
  });

  it("keeps platform.superuser scoped and not DB superuser/BYPASSRLS", async () => {
    const client = await beginAsUser(users.superuser.authId);
    try {
      expect((await client.query("select id from core.organisation")).rows.map((r) => r.id))
        .toEqual([ids.orgA]);
      expect((await client.query("select id from core.legal_entity order by id")).rows.map((r) => r.id))
        .toEqual([ids.legalA]);
      expect((await client.query("select legal_entity_id from core.site_legal_entity")).rows.map((r) => r.legal_entity_id))
        .toEqual([ids.legalA]);

      const role = await client.query(
        "select rolbypassrls, rolsuper from pg_roles where rolname=current_user",
      );
      expect(role.rows[0]?.rolbypassrls).toBe(false);
      expect(role.rows[0]?.rolsuper).toBe(false);
      await client.query("commit");
    } finally {
      client.release();
    }
  });

  it("keeps W0-07 AuthorizationService functional under RLS", async () => {
    const runtime = getApplicationDatabaseRuntime();
    const profile = await runtime.unitOfWork.withTransaction(async (uow) =>
      await uow.repository(userProfileRepository).findById(users.a.profileId as never),
    );
    const user = buildAuthenticatedHuman({
      authUserId: parseSupabaseAuthUserId(users.a.authId),
      authEmail: users.a.email,
      profile,
      operation,
    });
    const service = new AuthorizationService(runtime.unitOfWork, new SystemClock());

    expect((await service.authorize({
      user,
      capability: "inventory.physical_count.view",
      scope: {
        organisationId: ids.orgA as never,
        legalEntityId: ids.legalA as never,
        siteId: ids.sharedSite as never,
      },
    })).allowed).toBe(true);

    expect((await service.authorize({
      user,
      capability: "inventory.physical_count.view",
      scope: {
        organisationId: ids.orgA as never,
        legalEntityId: ids.legalB as never,
        siteId: ids.sharedSite as never,
      },
    })).allowed).toBe(false);
  });

  it("keeps core/iam absent from anon/authenticated Supabase Data API", async () => {
    const anonClient = createClient(apiUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    expect((await anonClient.schema("core").from("organisation").select("id")).error)
      .not.toBeNull();

    const userClient = createClient(apiUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    expect((await userClient.auth.signInWithPassword({
      email: users.a.email,
      password: users.a.password,
    })).error).toBeNull();
    expect((await userClient.schema("core").from("organisation").select("id")).error)
      .not.toBeNull();

    const privileges = await pool.query(
      `select
         has_schema_privilege('anon','core','USAGE') as anon_core,
         has_schema_privilege('authenticated','core','USAGE') as authenticated_core,
         has_schema_privilege('service_role','core','USAGE') as service_core,
         has_schema_privilege('anon','iam','USAGE') as anon_iam,
         has_schema_privilege('authenticated','iam','USAGE') as authenticated_iam`,
    );
    expect(privileges.rows[0]).toEqual({
      anon_core: false,
      authenticated_core: false,
      service_core: false,
      anon_iam: false,
      authenticated_iam: false,
    });
  });
});

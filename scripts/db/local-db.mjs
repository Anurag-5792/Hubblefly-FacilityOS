import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const root = resolve(process.cwd());
const supabaseDir = join(root, "supabase");
const linkedProjectRef = join(supabaseDir, ".temp", "project-ref");
const supabaseTypesFile = join(root, "src", "platform", "db", "database.types.ts");
const kyselyTypesFile = join(root, "src", "platform", "db", "kysely.types.ts");
const expectedMigrationVersions = ["20260923120000", "20261006124500", "20261006130500", "20261006132300", "20261007003000", "20261007023000"];
const generatedSchemas = "public,core,iam";
const lintSchemas = "public,core,iam,facilityos_security";
const expectedCliVersion = "2.117.0";

const supabaseBin = process.platform === "win32"
  ? join(root, "node_modules", ".bin", "supabase.cmd")
  : join(root, "node_modules", ".bin", "supabase");
const kyselyCodegenBin = process.platform === "win32"
  ? join(root, "node_modules", ".bin", "kysely-codegen.cmd")
  : join(root, "node_modules", ".bin", "kysely-codegen");
const vitestBin = process.platform === "win32"
  ? join(root, "node_modules", ".bin", "vitest.cmd")
  : join(root, "node_modules", ".bin", "vitest");

function fail(message) {
  process.stderr.write(`[db] ${message}\n`);
  process.exit(1);
}

function assertToolExists(path, name) {
  if (!existsSync(path)) fail(`${name} is not installed. Run pnpm install --frozen-lockfile first.`);
}

function assertLocalOnly() {
  if (existsSync(linkedProjectRef)) {
    const ref = readFileSync(linkedProjectRef, "utf8").trim();
    if (ref) {
      fail("Local-only W0-02 command refused: this checkout contains a linked Supabase project reference.");
    }
  }
}

function sanitize(text) {
  return String(text ?? "")
    .replace(/(service[_ -]?role|anon|publishable|secret|jwt)[^\n:=]*[:=]\s*[^\n]+/gi, "$1: <redacted>")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://<redacted>")
    .replace(/eyJ[A-Za-z0-9._-]+/g, "<redacted-token>");
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: options.env ?? process.env,
    shell: process.platform === "win32",
  });

  if (result.error) fail(`${options.label ?? executable}: ${result.error.message}`);
  if (result.status !== 0) {
    const output = sanitize(`${result.stdout ?? ""}\n${result.stderr ?? ""}`).trim();
    if (output) process.stderr.write(output + "\n");
    fail(`${options.label ?? executable} exited with status ${result.status}`);
  }

  if (!options.quiet) {
    process.stdout.write(`[db] ${options.label ?? args.join(" ")}: ok\n`);
  }
  return result.stdout ?? "";
}

function runSupabase(args, options = {}) {
  assertToolExists(supabaseBin, "Supabase CLI");
  assertLocalOnly();
  return run(supabaseBin, args, options);
}

function cliVersion() {
  const version = runSupabase(["--version"], { label: "Supabase CLI", quiet: true }).trim();
  if (version !== expectedCliVersion) {
    fail(`Supabase CLI version mismatch: expected ${expectedCliVersion}, got ${version || "<empty>"}`);
  }
  process.stdout.write(`[db] Supabase CLI ${version}\n`);
}

function start() {
  cliVersion();
  runSupabase(["start"], { label: "local Supabase start" });
}

function stop() {
  assertToolExists(supabaseBin, "Supabase CLI");
  run(supabaseBin, ["stop"], { label: "local Supabase stop" });
}

function reset() {
  runSupabase(["db", "reset", "--local"], { label: "local database reset" });
}

function migrate() {
  runSupabase(["migration", "up"], { label: "local migration up" });
}

function statusEnv() {
  const output = runSupabase(["status", "-o", "env"], { label: "local Supabase status", quiet: true });
  const line = output.split(/\r?\n/).find((entry) => entry.startsWith("DB_URL="));
  if (!line) fail("Supabase status did not provide a local DB_URL.");
  return line.slice("DB_URL=".length).replace(/^[\"']|[\"']$/g, "");
}

async function provisionLocalRuntimeLogin(adminDatabaseUrl) {
  const roleName = "facilityos_local_runtime_login";
  const password = randomBytes(24).toString("hex");
  const client = new Client({ connectionString: adminDatabaseUrl });

  await client.connect();
  try {
    await client.query(`
      do $
      begin
        if not exists (select 1 from pg_roles where rolname = 'facilityos_local_runtime_login') then
          create role facilityos_local_runtime_login
            login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
        end if;
      end;
      $;
    `);
    await client.query(`
      alter role facilityos_local_runtime_login
        login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
    `);
    await client.query(`alter role facilityos_local_runtime_login password '${password}'`);
    await client.query("grant facilityos_user_runtime to facilityos_local_runtime_login");
    await client.query("revoke facilityos_security_admin from facilityos_local_runtime_login");

    const check = await client.query(`
      select r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb,
             r.rolcanlogin, r.rolreplication, r.rolbypassrls,
             exists (
               select 1 from pg_auth_members am
               join pg_roles granted_role on granted_role.oid = am.roleid
               join pg_roles member_role on member_role.oid = am.member
               where granted_role.rolname = 'facilityos_user_runtime'
                 and member_role.rolname = r.rolname
             ) as runtime_member,
             exists (
               select 1 from pg_auth_members am
               join pg_roles granted_role on granted_role.oid = am.roleid
               join pg_roles member_role on member_role.oid = am.member
               where granted_role.rolname = 'facilityos_security_admin'
                 and member_role.rolname = r.rolname
             ) as security_admin_member
      from pg_roles r
      where r.rolname = 'facilityos_local_runtime_login'
    `);
    const role = check.rows[0];
    if (!role || role.rolsuper || role.rolinherit || role.rolcreaterole || role.rolcreatedb
        || !role.rolcanlogin || role.rolreplication || role.rolbypassrls
        || !role.runtime_member || role.security_admin_member) {
      throw new Error("Local FacilityOS runtime login has unsafe role attributes or membership.");
    }

    const runtimeUrl = new URL(adminDatabaseUrl);
    runtimeUrl.username = roleName;
    runtimeUrl.password = password;
    process.stdout.write("[db] local non-owner runtime login provisioned: ok\n");
    return { connectionString: runtimeUrl.toString(), roleName };
  } finally {
    await client.end();
  }
}

function generateSupabaseTypes(outFile = supabaseTypesFile) {
  mkdirSync(dirname(outFile), { recursive: true });
  const output = runSupabase(
    ["gen", "types", "typescript", "--local", "--schema", generatedSchemas],
    { label: "Supabase TypeScript type generation", quiet: true },
  );
  writeFileSync(outFile, output);
  process.stdout.write(`[db] Supabase types generated: ${outFile === supabaseTypesFile ? "canonical" : "verification copy"}\n`);
}

function generateKyselyTypes(outFile = kyselyTypesFile) {
  assertToolExists(kyselyCodegenBin, "kysely-codegen");
  mkdirSync(dirname(outFile), { recursive: true });
  const databaseUrl = statusEnv();
  run(
    kyselyCodegenBin,
    [`--out-file=${outFile}`, "--include-pattern={public,core,iam}.*"],
    {
      label: "Kysely type generation",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    },
  );
}

function generateTypes() {
  generateSupabaseTypes();
  generateKyselyTypes();
}

async function schemaFingerprint() {
  const client = new Client({ connectionString: statusEnv() });
  await client.connect();
  try {
    const tables = await client.query(`
      select table_schema, table_name, table_type
      from information_schema.tables
      where table_schema in ('public', 'core', 'iam')
      order by table_name, table_type
    `);
    const columns = await client.query(`
      select table_schema, table_name, column_name, ordinal_position, data_type,
             udt_schema, udt_name, is_nullable, column_default
      from information_schema.columns
      where table_schema in ('public', 'core', 'iam')
      order by table_name, ordinal_position
    `);
    const constraints = await client.query(`
      select n.nspname as schema_name, c.relname as table_name, con.conname as constraint_name,
             con.contype as constraint_type, pg_get_constraintdef(con.oid, true) as definition
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'core', 'iam')
      order by c.relname, con.conname
    `);
    const indexes = await client.query(`
      select schemaname, tablename, indexname, indexdef
      from pg_indexes
      where schemaname in ('public', 'core', 'iam')
      order by tablename, indexname
    `);
    const enums = await client.query(`
      select n.nspname as schema_name, t.typname as type_name, e.enumsortorder, e.enumlabel
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname in ('public', 'core', 'iam')
      order by t.typname, e.enumsortorder
    `);
    const functions = await client.query(`
      select n.nspname as schema_name, p.proname as function_name,
             pg_get_function_identity_arguments(p.oid) as identity_arguments,
             pg_get_function_result(p.oid) as result_type,
             owner.rolname as owner_name,
             p.prosecdef as security_definer,
             p.proconfig as function_config,
             pg_get_functiondef(p.oid) as definition
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_roles owner on owner.oid = p.proowner
      where n.nspname in ('public', 'core', 'iam', 'facilityos_security')
      order by n.nspname, p.proname, identity_arguments
    `);
    const rls = await client.query(`
      select n.nspname as schema_name, c.relname as table_name,
             owner.rolname as owner_name,
             c.relrowsecurity, c.relforcerowsecurity, c.relacl
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles owner on owner.oid = c.relowner
      where n.nspname in ('public', 'core', 'iam')
        and c.relkind in ('r', 'p')
      order by n.nspname, c.relname
    `);
    const policies = await client.query(`
      select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_policies
      where schemaname in ('public', 'core', 'iam')
      order by schemaname, tablename, policyname
    `);
    const securityRoles = await client.query(`
      select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
             rolcanlogin, rolreplication, rolbypassrls
      from pg_roles
      where rolname in ('facilityos_user_runtime', 'facilityos_security_admin')
      order by rolname
    `);
    const schemaAcls = await client.query(`
      select n.nspname as schema_name, n.nspacl
      from pg_namespace n
      where n.nspname in ('public', 'core', 'iam', 'facilityos_security')
      order by n.nspname
    `);

    const canonical = JSON.stringify({
      tables: tables.rows,
      columns: columns.rows,
      constraints: constraints.rows,
      indexes: indexes.rows,
      enums: enums.rows,
      functions: functions.rows,
      rls: rls.rows,
      policies: policies.rows,
      securityRoles: securityRoles.rows,
      schemaAcls: schemaAcls.rows,
    });
    return createHash("sha256").update(canonical).digest("hex");
  } finally {
    await client.end();
  }
}

async function assertMigrationApplied() {
  const client = new Client({ connectionString: statusEnv() });
  await client.connect();
  try {
    const result = await client.query(
      "select version, name from supabase_migrations.schema_migrations order by version",
    );
    for (const version of expectedMigrationVersions) {
      const match = result.rows.find((row) => String(row.version) === version);
      if (!match) fail(`Expected migration ${version} is not recorded as applied.`);
      process.stdout.write(`[db] migration ${version}: applied\n`);
    }
  } finally {
    await client.end();
  }
}

function lintDatabase() {
  runSupabase(["db", "lint", "--schema", lintSchemas, "--level", "error"], {
    label: "local database lint",
  });
}

function compareFiles(first, second, label) {
  const a = readFileSync(first);
  const b = readFileSync(second);
  if (!a.equals(b)) fail(`${label} is not deterministic across clean resets.`);
}

async function verifyRuntime() {
  const temp = await mkdtemp(join(tmpdir(), "facilityos-db-"));
  try {
    start();

    reset();
    await assertMigrationApplied();
    lintDatabase();
    generateTypes();
    const fingerprintA = await schemaFingerprint();
    const supabaseA = join(temp, "database-a.types.ts");
    const kyselyA = join(temp, "kysely-a.types.ts");
    generateSupabaseTypes(supabaseA);
    generateKyselyTypes(kyselyA);

    reset();
    await assertMigrationApplied();
    lintDatabase();
    generateTypes();
    const fingerprintB = await schemaFingerprint();
    const supabaseB = join(temp, "database-b.types.ts");
    const kyselyB = join(temp, "kysely-b.types.ts");
    generateSupabaseTypes(supabaseB);
    generateKyselyTypes(kyselyB);

    if (fingerprintA !== fingerprintB) {
      fail("Database schema fingerprint changed between two clean database resets.");
    }
    compareFiles(supabaseA, supabaseB, "Supabase generated types");
    compareFiles(kyselyA, kyselyB, "Kysely generated types");

    process.stdout.write(`[db] deterministic database schema fingerprint: ${fingerprintA}\n`);
    process.stdout.write("[db] two-reset deterministic migration verification: ok\n");
  } finally {
    try {
      stop();
    } catch {
      // Preserve the primary verification failure if cleanup also fails.
    }
    await rm(temp, { recursive: true, force: true });
  }
}

function verifyGeneratedFilesCommitted() {
  run("git", [
    "diff",
    "--exit-code",
    "--",
    "src/platform/db/database.types.ts",
    "src/platform/db/kysely.types.ts",
  ], { label: "generated database type drift check" });
}

async function runCoreTests() {
  assertToolExists(vitestBin, "Vitest");
  try {
    start();
    reset();
    await assertMigrationApplied();
    lintDatabase();

    const databaseUrl = statusEnv();
    run(
      vitestBin,
      ["run", "tests/unit/core", "tests/integration/core"],
      {
        label: "W0-05 core organisation and identifier tests",
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          FACILITYOS_DB_POOL_MAX: "10",
          FACILITYOS_DB_IDLE_TIMEOUT_MS: "5000",
          FACILITYOS_DB_CONNECTION_TIMEOUT_MS: "2000",
        },
      },
    );
  } finally {
    try {
      stop();
    } catch {
      // Preserve the primary test failure if cleanup also fails.
    }
  }
}

async function runAuthTests() {
  assertToolExists(vitestBin, "Vitest");
  try {
    start();
    reset();
    await assertMigrationApplied();
    lintDatabase();

    const statusOutput = runSupabase(["status", "-o", "env"], {
      label: "local Supabase status",
      quiet: true,
    });
    const local = Object.fromEntries(
      statusOutput
        .split(/\r?\n/)
        .filter((line) => line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [
            line.slice(0, index),
            line.slice(index + 1).replace(/^[\"']|[\"']$/g, ""),
          ];
        }),
    );
    const required = ["DB_URL", "API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"];
    for (const key of required) {
      if (!local[key]) fail(`Supabase status did not provide local ${key}.`);
    }

    run(
      vitestBin,
      ["run", "tests/unit/auth/", "tests/integration/auth/"],
      {
        label: "W0-06 Supabase Auth and FacilityOS user tests",
        env: {
          ...process.env,
          DATABASE_URL: local.DB_URL,
          NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
          FACILITYOS_AUTH_SOURCE: "supabase",
          FACILITYOS_DB_POOL_MAX: "5",
          FACILITYOS_DB_IDLE_TIMEOUT_MS: "5000",
          FACILITYOS_DB_CONNECTION_TIMEOUT_MS: "2000",
        },
      },
    );
  } finally {
    try {
      stop();
    } catch {
      // Preserve the primary test failure if cleanup also fails.
    }
  }
}


async function runAuthorizationTests() {
  assertToolExists(vitestBin, "Vitest");
  try {
    start();
    reset();
    await assertMigrationApplied();
    lintDatabase();

    const statusOutput = runSupabase(["status", "-o", "env"], {
      label: "local Supabase status",
      quiet: true,
    });
    const local = Object.fromEntries(
      statusOutput
        .split(/\r?\n/)
        .filter((line) => line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [
            line.slice(0, index),
            line.slice(index + 1).replace(/^[\"']|[\"']$/g, ""),
          ];
        }),
    );
    const required = ["DB_URL", "API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"];
    for (const key of required) {
      if (!local[key]) fail(`Supabase status did not provide local ${key}.`);
    }

    const localRuntime = await provisionLocalRuntimeLogin(local.DB_URL);

    run(
      vitestBin,
      ["run", "tests/unit/authorization", "tests/integration/authorization"],
      {
        label: "W0-07 roles, capabilities and scoped authorization tests",
        env: {
          ...process.env,
          DATABASE_URL: localRuntime.connectionString,
          FACILITYOS_TEST_ADMIN_DATABASE_URL: local.DB_URL,
          FACILITYOS_TEST_RUNTIME_LOGIN: localRuntime.roleName,
          NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
          FACILITYOS_AUTH_SOURCE: "supabase",
          FACILITYOS_DB_POOL_MAX: "5",
          FACILITYOS_DB_IDLE_TIMEOUT_MS: "5000",
          FACILITYOS_DB_CONNECTION_TIMEOUT_MS: "2000",
        },
      },
    );
  } finally {
    try {
      stop();
    } catch {
      // Preserve the primary test failure if cleanup also fails.
    }
  }
}

async function runRlsTests() {
  assertToolExists(vitestBin, "Vitest");
  try {
    start();
    reset();
    await assertMigrationApplied();
    lintDatabase();

    const statusOutput = runSupabase(["status", "-o", "env"], {
      label: "local Supabase status",
      quiet: true,
    });
    const local = Object.fromEntries(
      statusOutput
        .split(/\r?\n/)
        .filter((line) => line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [
            line.slice(0, index),
            line.slice(index + 1).replace(/^[\"']|[\"']$/g, ""),
          ];
        }),
    );
    const required = ["DB_URL", "API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"];
    for (const key of required) {
      if (!local[key]) fail(`Supabase status did not provide local ${key}.`);
    }

    const localRuntime = await provisionLocalRuntimeLogin(local.DB_URL);

    run(
      vitestBin,
      ["run", "tests/integration/rls"],
      {
        label: "W0-08 PostgreSQL RLS and runtime-role tests",
        env: {
          ...process.env,
          DATABASE_URL: localRuntime.connectionString,
          FACILITYOS_TEST_ADMIN_DATABASE_URL: local.DB_URL,
          FACILITYOS_TEST_RUNTIME_LOGIN: localRuntime.roleName,
          NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
          FACILITYOS_AUTH_SOURCE: "supabase",
          FACILITYOS_DB_POOL_MAX: "1",
          FACILITYOS_DB_IDLE_TIMEOUT_MS: "5000",
          FACILITYOS_DB_CONNECTION_TIMEOUT_MS: "2000",
        },
      },
    );
  } finally {
    try {
      stop();
    } catch {
      // Preserve the primary test failure if cleanup also fails.
    }
  }
}

async function runDatabaseAccessTests() {
  assertToolExists(vitestBin, "Vitest");
  try {
    start();
    reset();
    await assertMigrationApplied();
    lintDatabase();

    const databaseUrl = statusEnv();
    run(
      vitestBin,
      ["run", "tests/unit/platform/db", "tests/integration/database"],
      {
        label: "W0-03 database access tests",
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          FACILITYOS_DB_POOL_MAX: "1",
          FACILITYOS_DB_IDLE_TIMEOUT_MS: "5000",
          FACILITYOS_DB_CONNECTION_TIMEOUT_MS: "2000",
        },
      },
    );
  } finally {
    try {
      stop();
    } catch {
      // Preserve the primary test failure if cleanup also fails.
    }
  }
}

function createMigration(name) {
  if (!name || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(name)) {
    fail("Migration name must be supplied as lower_snake_case, for example: pnpm db:migration:new -- add_sites.");
  }
  runSupabase(["migration", "new", name], { label: `create migration ${name}` });
}

const [operation, ...args] = process.argv.slice(2);

switch (operation) {
  case "version":
    cliVersion();
    break;
  case "start":
    start();
    break;
  case "stop":
    stop();
    break;
  case "reset":
    reset();
    break;
  case "migrate":
    migrate();
    break;
  case "migration-new":
    createMigration(args[0]);
    break;
  case "types-supabase":
    generateSupabaseTypes();
    break;
  case "types-kysely":
    generateKyselyTypes();
    break;
  case "types":
    generateTypes();
    break;
  case "verify-runtime":
    await verifyRuntime();
    break;
  case "verify":
    await verifyRuntime();
    verifyGeneratedFilesCommitted();
    break;
  case "test-access":
    await runDatabaseAccessTests();
    break;
  case "test-core":
    await runCoreTests();
    break;
  case "test-auth":
    await runAuthTests();
    break;
  case "test-authorization":
    await runAuthorizationTests();
    break;
  case "test-rls":
    await runRlsTests();
    break;
  default:
    fail("Unknown local database operation.");
}

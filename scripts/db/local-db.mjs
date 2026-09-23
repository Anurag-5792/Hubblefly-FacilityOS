import { createHash } from "node:crypto";
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
const expectedMigrationVersion = "20260923120000";
const expectedCliVersion = "2.117.0";

const supabaseBin = process.platform === "win32"
  ? join(root, "node_modules", ".bin", "supabase.cmd")
  : join(root, "node_modules", ".bin", "supabase");
const kyselyCodegenBin = process.platform === "win32"
  ? join(root, "node_modules", ".bin", "kysely-codegen.cmd")
  : join(root, "node_modules", ".bin", "kysely-codegen");

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

function generateSupabaseTypes(outFile = supabaseTypesFile) {
  mkdirSync(dirname(outFile), { recursive: true });
  const output = runSupabase(
    ["gen", "types", "typescript", "--local", "--schema", "public"],
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
    [`--out-file=${outFile}`, "--include-pattern=public.*"],
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
      where table_schema = 'public'
      order by table_name, table_type
    `);
    const columns = await client.query(`
      select table_schema, table_name, column_name, ordinal_position, data_type,
             udt_schema, udt_name, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position
    `);
    const constraints = await client.query(`
      select n.nspname as schema_name, c.relname as table_name, con.conname as constraint_name,
             con.contype as constraint_type, pg_get_constraintdef(con.oid, true) as definition
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
      order by c.relname, con.conname
    `);
    const indexes = await client.query(`
      select schemaname, tablename, indexname, indexdef
      from pg_indexes
      where schemaname = 'public'
      order by tablename, indexname
    `);
    const enums = await client.query(`
      select n.nspname as schema_name, t.typname as type_name, e.enumsortorder, e.enumlabel
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public'
      order by t.typname, e.enumsortorder
    `);
    const functions = await client.query(`
      select n.nspname as schema_name, p.proname as function_name,
             pg_get_function_identity_arguments(p.oid) as identity_arguments,
             pg_get_function_result(p.oid) as result_type
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
      order by p.proname, identity_arguments
    `);

    const canonical = JSON.stringify({
      tables: tables.rows,
      columns: columns.rows,
      constraints: constraints.rows,
      indexes: indexes.rows,
      enums: enums.rows,
      functions: functions.rows,
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
    const match = result.rows.find((row) => String(row.version) === expectedMigrationVersion);
    if (!match) fail(`Expected W0-02 migration ${expectedMigrationVersion} is not recorded as applied.`);
    process.stdout.write(`[db] migration ${expectedMigrationVersion}: applied\n`);
  } finally {
    await client.end();
  }
}

function lintDatabase() {
  runSupabase(["db", "lint", "--schema", "public", "--level", "error"], {
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
      fail("Public-schema fingerprint changed between two clean database resets.");
    }
    compareFiles(supabaseA, supabaseB, "Supabase generated types");
    compareFiles(kyselyA, kyselyB, "Kysely generated types");

    process.stdout.write(`[db] deterministic public-schema fingerprint: ${fingerprintA}\n`);
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
  default:
    fail("Unknown local database operation.");
}

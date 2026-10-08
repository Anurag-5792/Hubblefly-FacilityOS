import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const { Client } = pg;
const root = resolve(process.cwd());
const supabaseBin = process.platform === "win32"
  ? join(root, "node_modules", ".bin", "supabase.cmd")
  : join(root, "node_modules", ".bin", "supabase");

function fail(message) {
  console.error("[auth-bootstrap] " + message);
  process.exit(1);
}

const email = process.env.FACILITYOS_BOOTSTRAP_EMAIL?.trim().toLowerCase();
const password = process.env.FACILITYOS_BOOTSTRAP_PASSWORD;
const displayName = process.env.FACILITYOS_BOOTSTRAP_DISPLAY_NAME?.trim();

if (!email || !displayName) fail("FACILITYOS_BOOTSTRAP_EMAIL and FACILITYOS_BOOTSTRAP_DISPLAY_NAME are required.");
if (!password || password.length < 12) fail("FACILITYOS_BOOTSTRAP_PASSWORD must be supplied at runtime and be at least 12 characters.");

const status = spawnSync(supabaseBin, ["status", "-o", "env"], { cwd: root, encoding: "utf8" });
if (status.status !== 0) fail("Local Supabase must be running.");

const local = Object.fromEntries(status.stdout.split(/\r?\n/).filter((x) => x.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).replace(/^[\"']|[\"']$/g, "")];
}));

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(local.API_URL ?? "")) {
  fail("Bootstrap is local-only and refuses non-local Supabase URLs.");
}
if (!local.SERVICE_ROLE_KEY || !local.DB_URL) fail("Local Supabase credentials are unavailable.");

const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

let authUser;
const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) fail("Could not inspect local auth users.");
authUser = listed.data.users.find((user) => user.email?.toLowerCase() === email);

if (!authUser) {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) fail("Could not create local auth user.");
  authUser = created.data.user;
}

const client = new Client({ connectionString: local.DB_URL });
await client.connect();
try {
  await client.query("begin");
  const existing = await client.query("select id from iam.user_profile where auth_user_id = $1", [authUser.id]);
  if (existing.rowCount === 0) {
    const now = new Date().toISOString();
    await client.query(
      `insert into iam.user_profile
       (id, auth_user_id, display_name, email_snapshot, status, version,
        created_at, created_actor_type, created_actor_id,
        updated_at, updated_actor_type, updated_actor_id)
       values ($1,$2,$3,$4,'ACTIVE',0,$5,'SYSTEM','local-bootstrap',$5,'SYSTEM','local-bootstrap')`,
      [randomUUID(), authUser.id, displayName, email, now],
    );
  }
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

console.log("[auth-bootstrap] Local FacilityOS user is provisioned. No role or permission was assigned.");

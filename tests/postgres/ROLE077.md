# ROLE077 real PostgreSQL qualification runner

This runner is executable source, not an execution approval. It requires an
already approved isolated PostgreSQL 18.7 fixture destination and Chat13's
installed protected Stores/role package. It never creates a resource, installs
SQL, enrolls people/keys, seeds an owner, or turns on public HTTP routes.

## Commands

From a clean checkout of the exact admitted commit/tree, using the existing
locked dependencies and Node 22:

```sh
node --experimental-strip-types tests/postgres/role077-qualification.ts --describe
node --experimental-strip-types tests/postgres/role077-qualification.ts --run
```

`--describe` has no connections. Missing admission returns exit 2 with every
runtime case NOT TESTED. A reached test failure returns exit 1, stops the campaign
and records which later cases were not reached. Source-only CI never runs `--run`
against a database. No success claim may be inferred from compilation/--describe.

The actual RECEIVE/read/role POST functions are called with real signed Request
objects. The real session verifier, pg driver, SQL catalog, proof issuers,
protected resolver/post/reconcile/read functions and persistence/readback run.
This is a direct-handler integration test, NOT a browser/Next middleware/online
user sign-in milestone. Public middleware remains closed to this profile.

## Admission record

The externally supplied file is exact JSON `{ "payload": "base64url",
"signature": "base64url" }`. `payload` is the original UTF-8 JSON bytes signed
with the authorized Ed25519 admission key. Its exact shape is exported as
QualificationAdmission in lib/hft/roles/role-isolated-profile.ts. No command in
this repository signs an execution approval. Offline tests generate separate
untrusted test signatures only.

Required payload fields are version, fixtureOnly, authorityRef, executor,
issuedAt, expiresAt, target, source, installer, logins, session, proofs,
fixtureSha256 and permissions. Admission expiry is at most 24 hours from issue.
UNASSIGNED is rejected. No default/proposed target is silently accepted.

`target` specifies project, branch, database, host, port, backendPort, pgVersion,
databaseOid and resourceNonce. Database must match
`hft_r1_disposable_role077_[a-z0-9_]{6,24}`; no IP, localhost, retained
branch/database or production deployment is accepted. Use a direct/session-affine
TLS endpoint, not a transaction pooler. The runner checks actual backend identity
and installed binding, not just names. `source` has exact commit and tree.

`installer.role`, `.stock` and `.binding` identify accepted installation sources.
`installer.gateway` preserves the existing approved four-gateway hash.
`installer.fixtureHelpers` is the SHA-256 of the exact committed
HFT-R1-ROLE077-FIXTURE-CONTROLS-NONEXECUTABLE.sql source; deployed helper bodies
must also match it. The STOP guards in both addenda are not permissions to remove
them or instructions to install without the original execution authority.

`logins` contains role, stock, p3 and fixtureExecutor: four distinct restricted
fixture logins, each matching `hft_r1_[a-z0-9_]{2,30}_qual077` with no owner/admin
name. The role login is never owner/member and receives no master/binding UPDATE,
protected writer/helper EXECUTE or stock reads. The fixture executor is also
nonowner/nonsuperuser, without direct protected/role DML. It has only approved
fixture read observation and EXECUTE on the two pinned fixture controls. The
runner checks this rather than using an owner connection for successful writes.

`session` has issuer/audience beginning QUAL077-SYNTHETIC-, publicKeySha256 of the
exact public PEM bytes, and synthetic:true. `proofs` has distinct p0Sha256 and
p2Sha256 of the decoded synthetic HMAC bytes, p0Version/p2Version and synthetic:true.
Synthetic keys/sessions must already be enrolled only in this approved fixture
resource by the existing qualified mechanism. No real enrollment is reused.

`fixtureSha256` hashes the exact UTF-8 fixture JSON file. `permissions` contains
exactly catalog, role-writes, fixture-mutations, trigger-negatives, route-receive,
route-read and concurrency. Actual permission/appointment authority comes from
Chat13/11, not from the mere ability to produce JSON.

## Fixture file and credentials

The file has version:HFT_ROLE077_FIXTURES_V1, fixtureOnly:true, scope, admin,
operator, target, receives and readQuery. Each person has subject, employeeId,
personId, sessionId and numeric sessionExpiresAt. Person/session/scope IDs start
QUAL077-. The three canonical persons must differ. The admin is an already
qualified synthetic fixture role administrator; the runner does not bootstrap it.
The target is a separate synthetic employee for role-write tests. The operator
is the actual authenticated synthetic actor in RECEIVE/read tests.

`receives` has A, B and C: three distinct request IDs with complete valid P0 IN
bodies matching the fixture scope, actual installed fixture invoice/GRN/QC and
independent approval sources. A and C should use distinct item/version/bin/lot
accounts so the first receipt cannot invalidate the other's preapproved account
revision. B is exercised only in denied attempts. `readQuery` is a real exact P0
read query for that same scope. Do not insert genuine stock/documents as fixtures.

Deliver secrets through the approved secure runtime path, never chat/repository.
The runner uses these additional absolute file paths:

* HFT_QUAL077_ADMISSION_FILE (not group/world writable);
* HFT_QUAL077_FIXTURE_FILE (not group/world writable);
* HFT_QUAL077_SESSION_PRIVATE_KEY_FILE (mode 0600/0400, already synthetic/enrolled);
* HFT_QUAL077_EXECUTOR_PASSWORD_FILE (mode 0600/0400);
* optional HFT_QUAL077_RESULT_FILE (outside checkout, created exclusively 0600).

`HFT_QUAL077_ADMISSION_PUBLIC_KEY_PEM`, `HFT_QUAL077_TRUST_ROOT_SHA256` and
`HFT_QUAL077_ADMISSION_SHA256` pin the authorized trust root/file. The runtime
must also supply HFT_QUAL077_SOURCE_COMMIT/TREE, BINDING_INSTALLER_SHA256 and
FIXTURE_HELPERS_SHA256, and the existing role/stock TLS passwords, CA PEMs,
endpoint, database, login, source/installer/ABI and signer variables. Every value
is crosschecked against the signed record by assertRoleQualificationProfile.
HFT_ROLE_APPROVED_ENFORCEMENT_SHA256 must equal the committed
ROLE_ENFORCEMENT_SHA256, independently of the installer/admission hashes.

The distinct mode values are NODE_ENV=production,
HFT_ENVIRONMENT=isolated-role-qualification,
HFT_POSTING_RUN_MODE=ROLE077_ISOLATED_POSTGRES,
HFT_OPS_A2_SOURCE_MODE=ROLE077_ISOLATED_OPERATOR_V1 and BOTH
HFT_STORES_RUNTIME_PROFILE/HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE equal
HFT_R1_ROLE077_ISOLATED_POSTGRES_V1. VERCEL/VERCEL_ENV must be absent.
HFT_AUTH_SOURCE=verified, HFT_OPERATIONS_SOURCE=database,
HFT_LIVE_POSTING_ENABLED=false and ONLINE_TLS/MANAGED_RUNTIME_SECRET remain
mandatory. No legacy test-database/profile aliases or ambient database URLs.

## Executed case definitions (only PASS after an actual run)

A: SELECT-only row-lock conflict is independently reproduced as SQLSTATE 42501;
corrected restricted-role write is saved, separately read back and reopened.
A real RECEIVE posts exactly two fixture ledger legs, then actual read succeeds.

B: actual RECEIVE and read handlers are paused AFTER the preliminary role read
and pool close. Another real session commits revocation. Resuming must give 403,
with no resolver/writer/read callback and no ledger growth.

C: read holds its first stock shared fence; RECEIVE holds its posting-stage
(second) fence. A real revocation waits in pg_locks. The existing operation
finishes first. Subsequent calls are denied. RECEIVE whose later reconciliation
loses to revocation returns 409/no-retry after exactly one command/two legs.

D: actor/employee deactivation, identity binding deactivation/person change and
entity/site/warehouse deactivation each run both winner orders. Mutations before
pre-snapshot admission cause denial/no event. A write already holding the fence
commits before mutation; its later independent readback may be 409 if the admin
or scope was then deactivated, but the immutable event must exist. Concurrent
same-revision assignment/change and assignment/revocation yield exactly one
commit, not two. This uses real PostgreSQL, not a timer-based lock model.

E: absent operation binding prevents the protected callback, missing role profile
rejects the actual RECEIVE route, invalid Ed25519 session is denied, and a damaged
HMAC is rejected by the real existing protected read gateway without ledger changes.

Installed audit suite: missing matching event rejects COMMIT, rollback leaves the
snapshot unchanged, and immutable-event UPDATE is rejected. Trigger negatives
cover disabled audit/constraint, misplaced, replaced and no-op definitions with
actual catalog denial. Exact definitions are restored in finally and reattested.
These tests never mutate retained triggers.

The labels A-E above describe this executable harness. They do not claim parity
with an unavailable external test catalog. Chat13 must reconcile any different
existing case identifiers explicitly, without calling unrun cases equivalent.

## Barriers, restoration, evidence and cleanup

role077-observer.ts exists only under tests/postgres. It wraps real pg query/end
completion, always calls the original method and returns its real result. No
application code imports it. It logs event labels/PIDs, not SQL parameters,
passwords, JWTs, private keys or HMAC bytes. A separate nonowner monitoring
connection observes the exact blocked backend in pg_locks. Polling delays are
not used as evidence of blocking.

A database-local campaign mutex prevents two runners on the same fixture target.
All tests must run with ample admission/session lifetime. No other operator may
use the fixture while mutation/negative tests run. Negative definitions and
fixture states are restored and reattested. If the runner is interrupted or
admission expires, do not activate/reuse that fixture; Chat13's authorized
executor must reconcile exact state and perform the approved cleanup. The
runner never expands expired authority or drops a resource on its own.

Resource lifetime, cost responsibility, original executor appointment and cleanup
must be specified in the recovered target-specific record (or the single execution
decision card). They are not invented here. JSON evidence distinguishes PASS,
FAIL and NOT TESTED, includes actual environment/source identity, ordering
observations, and effective role catalog. No PostgreSQL results exist until an
admitted run completes. Browser C050 regression is separate source CI evidence,
not proof of this runtime campaign or the shared online application milestone.

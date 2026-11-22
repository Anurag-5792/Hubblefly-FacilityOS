# HF16-077 — bounded role-backend correction

Directive: HFT-R1-MASTER-V4-DELIVERY-QUALITY-077.
Reviewed/source baseline: ec21d1625e8490527e9de8290d1aa14d3d3dd0f6.
This is source correction, not installation, activation, independent acceptance
or production permission. Gate R HOLD; Gate A HOLD; production NO-GO.

## ROLE077-SQL-01

All 12 qualified coalesce calls in role-backend.ts are native COALESCE
expressions. Schema privileges use to_regnamespace OIDs, and the epoch column
privilege uses a safe pg_attribute attnum lookup. Missing required schemas are
returned explicitly and rejected as ROLE_REQUIRED_SCHEMAS_NOT_INSTALLED; absence
cannot be interpreted as a zero-danger ACL pass. No dummy schema is created.

The full expanded ROLE_BACKEND_CATALOG_SQL was executed via Neon in an explicit
REPEATABLE READ READ ONLY transaction on the existing retained target:
project wandering-cake-50222227; branch br-shiny-night-b3qgsj8t;
database hft_r1_retained_masters_np077; server_version_num 180007.
At 2026-11-22T15:57:13.582Z, backend 654 returned required schemas
[hft,hft_app_roles,hft_secret] missing, no role tables, no audit triggers.
The query completed without 42883 or 3F000. Connection was the connector's
hft_r1_retained_masters_np077_owner, not an admitted role-service login; the
backend bridge reported tls=false. This demonstrates query execution and safe
absence handling, NOT application TLS/login admission or a usable role backend.

## ROLE077-AUDIT-02

role-enforcement.ts pins trigger relations, event/timing/row bitmasks, ALWAYS
status, constraint/deferral properties, absence of filters/arguments/transition
tables, function schema/name/body/language/config/flags, and matching nonlogin
nonsuperuser hft_r1_roles_owner ownership. Runtime EXECUTE on those trigger
functions is denied. The service cannot be a member of the owning role.
The additional HFT_ROLE_APPROVED_ENFORCEMENT_SHA256 must equal the source-defined
ROLE_ENFORCEMENT_SHA256 (8c5ce22a9d4edb3cc2fc5a48349ac79fe03f4e245a7dfdbdef0b78bf5eeb36ac).
The installer/admission digest requirements are retained; an environment pin
alone does not admit mismatching live catalog definitions.

The STOP-guarded candidate retains both existing audit function bodies, enables
those two triggers ALWAYS and adds BEFORE STATEMENT INSERT/UPDATE/DELETE/TRUNCATE
fences on assignment, identity_binding and scope_lock. Its function obtains an
exclusive transaction advisory lock. No role, grant or enrollment is executed.
Offline metadata regressions reject disabled, replica-only, misplaced,
replaced/no-op, wrong-owner, wrong-events, mutable-search-path, missing/extra,
unbound-constraint and nondeferred audit definitions. They do not disable or
modify retained live triggers. Installed trigger execution is NOT TESTED because
the schemas are not installed and installation is not authorized by this task.

## ROLE077-REVOCATION-03

Request-start eligibility is NOT the authorization/operation boundary.
requireApiBusinessRole now binds the stock pool to a fresh role recheck.
Inside each existing protected stock transaction, after original backend/TLS/ACL
qualification and before the P0/P2/read callback, the STOCK connection acquires
pg_try_advisory_xact_lock_shared(1212568624,77). The fresh role-only connection
then opens its own READ ONLY snapshot and reattests schema/audit/fence admission,
identity/scope and current grant. It never gets stock or helper privileges.

The fence is conservatively database-wide, not a scope-hash approximation.
Both pools must use the exact admitted project/branch/database/endpoint/port.
A missing binding, wrong database/transaction mode or contended fence denies.
A revocation committed after the preliminary read but before the fence is seen
by the new role snapshot. A role/identity/scope mutation arriving after fence
acquisition waits until that SAME stock transaction commits or rolls back.
Connection loss cannot leave a separate authorization lease alive after the
stock transaction. No claim is made that the stock RR snapshot sees new grants.
The role-only connection reads fresh state while mutations are excluded.

Each resolver/post/readback transaction rechecks independently. Revocation
between resolution and posting prevents posting. Revocation after a posting
COMMIT can deny its subsequent readback; the existing 409 reconciliation/no-blind-
retry response remains mandatory. For a read completed before revocation, later
revocation cannot recall bytes already produced. Original P0/P2/P3 proofs,
expiry/HOLD/corporate-person controls, four-gateway ACL and immutable stock ledger
remain mandatory and unchanged. This fence covers business-role/binding/scope
mutation; it does not replace protected identity/signing-key controls.

The actual RECEIVE and read POST handlers and actual protected transaction
envelope are invoked by tests/support/role077-route-worker.ts. Eight deterministic
cases model two sessions: revoke after first completed read; revoke during an
admitted operation (both routes); contended fence; lost COMMIT; independently
reauthorized success; and cross-branch denial. Identity, SQL clients and ledger
callbacks are test doubles. The worker is run by ordinary test discovery through
tests/unit/hft-role-route-fence.test.ts. No PostgreSQL stock transaction or real
role revocation is claimed. Live two-session installed-role execution remains
NOT TESTED, not replaced by these model results.

## Remaining admission/qualification dependencies

Chat 13's restricted role installation must provide the exact four role tables,
three source-pinned functions and five ALWAYS triggers owned by the approved
nonlogin role, separated service/stock logins, authoritative identity bindings,
and unchanged protected gateway/SQL contracts. Every authorized role revocation
writer must retain the exclusive trigger boundary; disabling it invalidates
admission. No real identities, initial owner or grants were created here.

A separately admitted isolated fixture target with these objects is required to
qualify disabled/misplaced/no-op trigger rejection and two-session route races
against real PostgreSQL. Do not mutate live retained triggers for negative tests.
The retained target currently cannot supply that fixture. This is a concrete
installation/execution dependency, not an outside-consultant gate or a request
for another generic owner approval.

No package/lockfile, workflow, canonical migration, protected Stores SQL, signed
approval functions, stock gateway definition, or Role Assignment UI was changed.
Full CI outcome and frozen final SHA belong in the delivery report, not a
self-referential source claim. Historical baseline CI remains preserved.

# HF16-077-ROLE-ISOLATED-RUNTIME-BINDING

23 November 2026. Parent HFT-R1-MASTER-V4-DELIVERY-QUALITY-077.
Starting source: 661e6835403ea70e1dbc4141182f5387ce495ba4.
Starting tree: 0282e6cf226afebc59ef6b5a99076b945ceb6910.

Source correction and executable harness only. Gate R HOLD; Gate A HOLD;
production NO-GO. The shared online sign-in/save/readback/reopen milestone is
still outstanding. This direct-handler qualification is not that online app.

## QUAL077-BIND-01

The new HFT_R1_ROLE077_ISOLATED_POSTGRES_V1 profile is separate from retained
Stores and legacy synthetic test profiles. No retained identifiers, TEST flag,
production or Vercel deployment can activate it. It runs only through an
explicit isolated CLI environment with a signed, expiring admission file.

The signature binds exact source commit/tree, target resource and database OID,
resource nonce, role/stock/binding installers, fixture-helper source, distinct
restricted logins, synthetic session/proof identities, fixture bytes and test
permissions. The runner verifies a clean checkout. The two real clients verify
one immutable installed execution_binding payload against that signed record.
The stock transaction also compares its actual database/OID/address/port with
the fresh role connection receipt. Environment label equality alone is not proof.

The actual RECEIVE/read/role POST exports retain Ed25519 session verification,
managed P0/P2 proof signing, original four-function Stores gateway catalog,
protected callbacks and immutable readback. Every qualified stock transaction
requires the operation fence; a missing binding fails before its callback.
Invalid isolated profile attempts cannot fall through to the legacy test path.
Public middleware remains unchanged and CLOSED to this profile. The runner does
not replace authentication, SQL clients, query results or protected callbacks.

## QUAL077-LOCK-01

The restricted role login still has SELECT-only master/identity access. All
principal/employee FOR SHARE clauses and FOR SHARE OF e,t,w were removed.
FOR UPDATE OF s remains only on the writable application scope_lock row, with
UPDATE(epoch) and no UPDATE authority over other scope columns.

This is not a SERIALIZABLE-only assertion. A write acquires the same database-wide
exclusive SESSION advisory fence before BEGIN, then verifies the same backend
PID and a real granted ExclusiveLock inside the transaction. This prevents a
waiting writer from taking its policy snapshot before a winning mutation commits
and rejects transaction-pool/reset affinity loss. The catalog is reattested under
the fence, then the scope row/epoch and all authority reads/writes follow.

The existing three role mutation statement triggers remain. Four additional
ENABLE ALWAYS statement triggers on hft.employee, hft.legal_entity, hft.site and
hft.warehouse cover INSERT/UPDATE/DELETE/TRUNCATE using the same invoker-only
fence_role_mutation body. Existing master owners install them; no ownership
transfer or application SECURITY DEFINER helper is introduced. Existing master
owners need the installation privileges to attach the trigger function; no such
privileges go to the role service.

The session fence spans COMMIT. Its explicit unlock is checked; every write
connection is discarded, including success, timeout, rollback and uncertain
COMMIT/unlock. No automatic write retry was added. Runtime lock acquisition is
bounded by the existing timeouts. This database-wide fence is deliberately
conservative: it serializes role/dependency writes and can reduce availability
under contention. Qualification does not prove throughput suitability.

The catalog checks effective table AND column writes on protected schemas and
identity bindings, immutable-audit columns, and every non-epoch scope column.
Table or column stock-history/account reads remain forbidden to the role login.

If a revocation wins before the stock fence, the fresh role snapshot denies it.
If a stock transaction wins, mutations wait until its transaction ends. Resolver,
posting and readback transactions reauthorize independently. A revocation after
stock COMMIT can deny reconciliation; that is now an explicit 409/no-blind-retry
outcome, never a clean pre-post denial or another posting attempt.

## Narrow fixture-only helper contract for internal review

The harness never uses an owner connection, owner membership or direct fixture
DML. Two STOP-guarded, fixture-only SECURITY DEFINER controls are proposed in
HFT-R1-ROLE077-FIXTURE-CONTROLS-NONEXECUTABLE.sql:

* role_fixture_control_v1(text,text), owned by existing nonlogin hft_r1_roles_owner;
* master_fixture_control_v1(text,text), owned by the existing nonlogin protected
  master owner (no transfer of table ownership).

Only the separately admitted nonowner fixture executor may execute these exact
helpers. Role and stock logins must NOT execute any hft_qual077 function. Helper
owners need read access to the immutable execution binding; the existing master
owner must be able to mutate the four fixture master relations. No runtime login
receives those privileges. No role creations, ownership changes or GRANTs occur
in this source or harness.

Each helper verifies the exact fixture database, executor session login, expiry,
and signed fixture-file hash before a static enum action. Actions are limited to
specified fixture identities/scopes and audit-trigger negatives/restoration.
There is no arbitrary SQL, identifier, enrollment, owner grant or stock writer.
The installed helper bodies/owners/configurations and effective executor/runtime
privileges are checked before the harness can call them. These helpers are a
fixture addendum to Chat13's package, not production interfaces or an alternative
role authorization path. They require bounded internal installer review.

## Actual evidence boundary at source preparation

The CLI typechecks, --describe runs with no database, and --run without the
required admission exits 2, reporting every SQL/route case NOT TESTED. Offline
signature/catalog/fence tests are explicitly source-only and do not establish
installed SQL or privilege compatibility. Earlier unchanged retained empty-schema
inspection was not repeated.

A current target-specific fixture authority/connection record was not recovered
from the available repository or connected Drive searches. No named executor,
credential custodian, appointment or approval has been invented. No database
installation, trigger mutation, real identity enrollment, role bootstrap,
operational activation, genuine stock posting, merge or production promotion was
performed. Final exact-source CI and checkout provenance belong in the delivery
return; do not infer them from this source document.

## Execution dependency and next owner

Chat13 V2, with Chat11 for original authority/evidence, must recover the existing
fixture package, actual target-specific execution authority, executor and secure
connection delivery. Reconcile only the two installer addenda and new role fence
triggers at this source. Do not activate the reviewed connector on retained or
production resources.

If the actual authority cannot be recovered, return ONE execution decision card:
proposed isolated target; actual executor or UNASSIGNED; permitted installation,
negative and concurrency cases; fixture-only identities/keys/credentials; secure
credential delivery; lifetime/cost owner and cleanup; explicit retained/production
exclusion. This is not a request for another generic business approval.

Run tests/postgres/role077-qualification.ts only after that exact authority exists.
It consumes, and never installs or invents, the approved fixture source data,
separated logins and synthetic enrolled sessions. See tests/postgres/ROLE077.md.

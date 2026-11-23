# HF16-077-MODULAR-ROLE-ASSIGNMENT

Controlling directive: HFT-R1-MASTER-V4-DELIVERY-QUALITY-077.
Source baseline: 9680c887db06a6d1802f2f2b92b9439c2825d0f7.
Source development uses internal iterative review. No external-consultant dependency.

## Delivered source

Settings -> Users & Roles -> Role Assignment: /settings/users-roles.
The UI searches existing active identity-linked employees, selects exact scope,
previews the nine-role catalog, selects compatible multiple roles, edits dates,
assigns/changes/revokes and displays server assignment/history results. It clears
stale results on scope/search changes. No sample employees or grants are supplied.

The server accepts BOOTSTRAP, SEARCH, VIEW, ASSIGN, CHANGE, REVOKE and RECONCILE.
Role changes are immediate authorized application operations, NOT proposals.
Only a successful COMMIT plus a separate connection's matching audit/snapshot
readback returns SAVED_VERIFIED. Unknown commit/readback stays UNCONFIRMED and
never automatically retries. Reason, session, subject, corporate person,
revision, original request ID, effective intervals and before/after history persist.

PostgresRoleStore implements real parameterized SELECT/INSERT/UPDATE and
SERIALIZABLE write/REPEATABLE READ READ ONLY read boundaries. Writes lock and
increment the exact scope epoch before current delegation checks. A stale waiter
must abort rather than use pre-revocation authority. No PostgreSQL execution was
performed by the offline tests; multi-session behavior remains NOT TESTED.

## Permission semantics

Owner Admin manages scoped roles and other administrators; it has no implicit
stock-posting or corporate-approval power. Role Administrator manages operational
roles but cannot grant/revoke administrative roles. The remaining seven roles are
explicit application permissions in role-assignment.ts. Maker roles cannot be
combined with checker/QC in one scope. Corporate-person identity, not only account
name, prevents self-change. Transaction checks require authoritative maker,
checker, inspector and approver people. They do not replace P0/P2/P3 checks.

Future-effective replacement retains earlier access until the boundary. Revoke
cancels all later scheduled grants. Expiry never revives superseded permissions.
Owner Admin cannot have an end date and removal requires another active,
continuing Owner Admin. Internal onboarding must seed the first owner with
verified identity and an immutable audit event; no first-login/email bootstrap.

## Explicit activation status and remaining work

UNCONNECTED / NO LIVE ASSIGNMENTS. The installed HTTP route deliberately uses a
closed store factory (ROLE_BACKEND_NOT_ADMITTED). It does not open a database,
enroll identities, install SQL, create database roles or persist grants.

The next bounded integration is to supply PostgresRoleStore with the admitted
nonproduction pool and same-connection database/login/TLS/ACL admission callback,
install the reviewed candidate separately, populate identity bindings/scopes from
original active records, bootstrap initial owner internally, and wire the factory.
The callback must reject owner/superuser/stock-writer credentials and require
least-privilege role-table access (including UPDATE(epoch) on scope_lock).
All onboarding/deactivation paths must preserve last-owner availability.

RoleService.withApiPermission is the live per-request enforcement boundary:
its callback retains the scope transaction lock, uses current saved roles and
requires original transaction participants for stock duties. Existing accepted
Stores/RECEIVE handlers are intentionally unchanged. Applying these new business
roles to those handlers remains integration work after backend admission. No
claim is made that role assignment already changes existing operational API access.

Gate R HOLD; Gate A HOLD; Production NO-GO. Protected SQL remains STOP-guarded.
Canonical migrations, accepted RECEIVE SQL/gateway/transport and the stock ledger
are unchanged. No protected source was installed. No trust material was enrolled.

## Tests

node --experimental-strip-types --test tests/unit/hft-role-assignment.test.ts
python3 -m unittest discover -s tests -p test_role_assignment_source.py -v

Tests use explicitly offline memory/SQL-client doubles, not corporate evidence.
The repository's existing CI discovers the new Node and Python tests; full CI,
Next.js build and existing mounted-browser results must be checked at the actual
final published HEAD. This file does not predeclare that result.

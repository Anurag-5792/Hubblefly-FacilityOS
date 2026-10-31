# P2 security control implementation boundary
Status: SOURCE PARTIAL / PRODUCTION NO-GO.

The nonexecutable P2 security candidate is a fail-closed foundation only. It removes PUBLIC
EXECUTE from the three Package 1 helpers and the new blocked entrypoint,
retracts PUBLIC schema/table grants and migration-owner future defaults.
It does not grant runtime EXECUTE, nor establish a full protected writer.
The existing TypeScript posting adapter still requires privileged table DML
and must NOT be exposed as a runtime posting route.

**Critical blocker SEC-03:** no independently approved, DB-verifiable
per-human actor proof for shared PostgreSQL connections or approved key custody.
Do not accept an actor string, SESSION_USER (shared runtime login), arbitrary
SET LOCAL parameter, or forged JSON. A securely provisioned PostgreSQL-side
verifier and restricted owned SECURITY DEFINER operation must be reviewed,
then activated with a subsequent forward revision. One user-facing posting
entrypoint may exist only after all approval, current Hold, immutable fragment,
audit/outcome/seal and actual role-denial tests pass.

Required before activation: independent DBA/Chat10 ownership/grant review;
controlled owner role (not app runtime), privilege inheritance and function
default grants for actual creator; trusted individual actor proof including
session, scope, payload hash, expiry, replay; real PG negative and concurrency
results. No database operation authorized by this source document.

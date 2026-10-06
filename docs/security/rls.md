# FacilityOS database RLS and runtime-role enforcement — W0-08

Status: **IMPLEMENTED pending TESTED gate evidence**

W0-08 adds PostgreSQL defence in depth beneath W0-07:

Authentication → W0-07 AuthorizationService → W0-08 RLS/runtime role → persistence.

RLS enforces row/scope isolation. It does not replace capabilities, segregation of duty, Holds,
approval history, recent-auth/MFA, state-machine rules or immutable-record protections.

## PostgreSQL roles and ownership

Supabase CLI imperative SQL migrations remain schema authority. Migration credentials are never
normal runtime credentials.

`facilityos_user_runtime` is ordinary authenticated user-context runtime: NOLOGIN, NOINHERIT,
NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION and NOBYPASSRLS.

`facilityos_security_admin` is a separate explicit elevated foundation/security administration
role. It is also NOLOGIN/NOBYPASSRLS. Ordinary request runtime must never be a member.

Production provisions a separate server-only login outside source control with only the membership
needed to enter `facilityos_user_runtime`; W0-08 creates no passwords.

Migration authority retains table ownership. Runtime/admin roles are not owners. All protected
current Wave-0 core/IAM tables use ENABLE + FORCE ROW LEVEL SECURITY.

Future W0-11 workers receive no blanket bypass. User-scoped workers follow this runtime pattern;
system-owned work needs its own narrow role/policy design.

## Trusted transaction security context

W0-08 does **not** use browser/client-settable business-scope GUCs as authority.

`UnitOfWorkManager.withRlsTransaction` keeps the W0-03 transaction model, executes a fixed
`SET LOCAL ROLE facilityos_user_runtime`, enables row_security locally, then calls the fixed
SECURITY DEFINER `facilityos_security.establish_authenticated_context`.

The function resolves authoritative Supabase Auth UUID → `iam.user_profile` UUID linkage and
replaces any caller-created temp collision with a function-owner-created temporary context table
declared ON COMMIT DROP.

The context contains verified identity plus request/correlation references. It accepts **no**
Organisation, Legal Entity or Site authority. RLS derives scope from authoritative W0-07
assignments, Role lifecycle and assignment validity.

Commit and rollback remove the temp context, so pooled connection reuse starts fail-closed.

## Scope semantics

Strict resource scope mirrors W0-07:
- Organisation resource: ORGANISATION assignment only.
- Legal Entity resource: Organisation assignment or matching LEGAL_ENTITY assignment.
- Site-only resource: Organisation assignment or matching SITE-only assignment.
- Site + Legal Entity resource: Organisation assignment, matching Legal Entity assignment, or
  exact Site + Legal Entity assignment.

Narrower assignments never expand into broader resource scope.

Metadata visibility is deliberately bounded but slightly broader where necessary: an assignment
can reveal its Organisation name; a Site+Legal Entity assignment can reveal that Legal Entity;
a Legal Entity assignment can reveal Sites serving it. Site-only access never reveals every Legal
Entity sharing the Site.

## Shared-Site rule

If Site S serves Legal Entity A and B and a user holds S + A, A@S may pass RLS where application
capability permits and B@S remains invisible/denied. Physical Site sharing is not company authority.

## IAM safety

Ordinary runtime:
- reads only its linked user profile;
- cannot update auth linkage/status or another user's profile;
- cannot mutate Role, Capability, Role-Capability or Role Assignment security state;
- can read Roles/mappings referenced by its own assignments and capability metadata needed by
  W0-07 evaluation;
- can read its own assignments so W0-07 preserves inactive/expired diagnostic semantics.

Only valid ACTIVE assignments and ACTIVE Roles contribute row authority.

## Existing identifier foundation writes

Ordinary runtime receives only the existing identifier operational write surface: INSERT
identifier_sequence, column-limited sequence counter/version/audit UPDATE, and INSERT immutable
identifier_allocation. RLS USING/WITH CHECK enforces scope. W0-07 application authorization remains
mandatory.

## SUPERUSER

`platform.superuser` is not a PostgreSQL role, table owner, service_role or BYPASSRLS principal.
W0-08 does not special-case it. Database visibility remains within its assignment scope.

## SECURITY DEFINER controls

Helpers are postgres-owned, use fixed safe search_path values, schema-qualified objects, no dynamic
SQL and no client-controlled identifier interpolation. PUBLIC/anon/authenticated/service_role
EXECUTE is revoked. Runtime receives only required EXECUTE grants.

## Data API and service_role

`supabase/config.toml` exposes only `public` and `graphql_public`; `core`, `iam` and
`facilityos_security` are not exposed. Schema/table privileges are also revoked from
anon/authenticated/service_role. Tests cover actual anon/authenticated Data API failure.

W0-06 service_role remains isolated to Auth administration; it is not the FacilityOS data path.

## Pooling and AuthorizationService

Tests force one pooled connection, verify the same backend PID is reused, verify no old context
after commit, and verify rollback also clears context.

`AuthorizationService.authorize` enters `withRlsTransaction`.
`authorizeWithin/requireWithin` require matching trusted DB identity. Structural scope validation
uses a bounded boolean SECURITY DEFINER helper so W0-07 can preserve denial semantics without
exposing unrelated rows.

Future protected mutations must enter `withRlsTransaction`, call
`AuthorizationService.requireWithin`, then persist in that same transaction.

## Future-domain RLS adoption guide

For every new protected table:
1. define its Organisation/Legal Entity/Site grain;
2. retain migration-authority ownership;
3. ENABLE and normally FORCE RLS;
4. grant only required DML to the correct runtime role;
5. use `facilityos_security.can_access_scope` or a narrower reviewed helper;
6. never treat requested browser scope as authority;
7. use `withRlsTransaction`;
8. keep capability/SoD/Hold/state logic in application policy;
9. add positive and cross-Organisation/Legal-Entity/Site direct-SQL tests;
10. add pool-reuse and rollback leakage tests.

## Troubleshooting

Unexpected zero rows: verify the RLS transaction, Auth/profile linkage, profile/Role/assignment
status, validity and exact scope.

Permission denied: verify explicit grants and runtime-role membership. Never solve it with postgres,
service_role, ownership or BYPASSRLS.

## Boundaries / limitations

No hosted Supabase/Vercel change, production login/password provisioning, ERP work, legacy Frappe
permission migration/deletion or W0-09 Audit/Approval/Hold implementation is included.

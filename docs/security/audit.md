# FacilityOS canonical Audit — W0-09

Status: **IMPLEMENTED — TEST VERIFICATION PENDING**

W0-09 introduces durable canonical operational Audit evidence in the private `governance`
schema. Canonical Audit is not console/Pino/Vercel/Sentry telemetry and is not the future
W0-11 domain-event/outbox transport.

## Canonical record

`governance.audit_event` stores an immutable UUID, event type/version, recorded/occurred time,
actor type and actor identity, authenticated FacilityOS user where applicable, request/command/
correlation/causation context, explicit Organisation/Legal Entity/Site scope, typed resource
reference, action/outcome, source module, bounded JSON metadata, optional reason and creating
PostgreSQL transaction ID.

Canonical resource identity is `resource_type + internal UUID`; human document numbers are not
canonical identity.

HUMAN actors are resolved from the trusted W0-06/W0-08 database context. Browser actor IDs are
never accepted as proof of authorship. SERVICE/SYSTEM/MIGRATION append is a separate privileged
path and cannot satisfy human approval requirements.

## Append-only enforcement

Normal runtime has no INSERT/UPDATE/DELETE privilege on `audit_event`. HUMAN append uses the
narrow SECURITY DEFINER `governance.append_human_audit_event` function, which resolves the
current active FacilityOS profile, verifies the exact authorizing W0-07 Capability in current
scope and inserts one canonical row. There is no generic `audit.write` grant that permits
fabricating arbitrary history.

A PostgreSQL trigger rejects UPDATE and DELETE even for paths that otherwise acquire table DML.
There is no SUPERUSER delete/repair path.

Governance SECURITY DEFINER functions are owned by the dedicated
`facilityos_governance_executor` role, not by the application runtime. That role is
NOLOGIN/NOINHERIT/NOBYPASSRLS, is not granted to runtime/login roles, and receives only the
specific SELECT/INSERT/UPDATE privileges required by controlled governance transitions.

Audit read is separate from append. `governance.audit.read` plus matching scope is required for
ordinary runtime enumeration. Being authorised to perform an audited business action does not
grant broad Audit read access.

## Atomicity

Future governed domain services must use W0-03 `UnitOfWork` and the W0-08 RLS transaction:
authorization + business/governance mutation + required Audit append commit in the same database
transaction. If Audit append fails, the mutation must roll back. Do not append Audit in a second
normal-path transaction after the business commit.

`AuditRecorder.appendHumanWithin` exists specifically for this adoption pattern.

## Sensitive data

Canonical metadata is supplementary, typed JSON only. Query-critical attributes are normal
columns. Metadata is bounded to 32 KiB. TypeScript and PostgreSQL reject obvious credential-like
keys/values including passwords, tokens, cookies, credentials, authorization material, API/session
keys, Bearer values, JWT-like values and credential-bearing PostgreSQL URLs.

This is a guardrail, not permission to place unrestricted PII or secrets in metadata.

## RLS and Data API

`governance.audit_event` uses ENABLE + FORCE RLS. The `governance` schema is not exposed through
the ordinary Supabase Data API and anon/authenticated/service_role receive no schema/table access.
Runtime remains NOLOGIN/NOBYPASSRLS and does not own the table.

## Retention and scale

W0-09 deliberately does not invent legal purge/retention. Audit is append-heavy and indexed only
for resource, correlation, request and scope/time access paths. Partitioning is deferred until
measured volume justifies it. Any future retention/purge process requires separately controlled
governance and must preserve auditability.

## Troubleshooting

If HUMAN append is denied, verify in order: authenticated FacilityOS user, active profile,
transaction-local W0-08 context, direct Capability (not only `platform.superuser`), exact scope,
resource/action code validity and safe metadata. Do not solve failures by granting table INSERT,
BYPASSRLS, schema exposure or a generic audit fabrication capability.

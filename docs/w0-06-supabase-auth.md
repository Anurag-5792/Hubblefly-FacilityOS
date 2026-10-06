# W0-06 Supabase Auth & FacilityOS User

## Boundary

Supabase `auth.users` is authentication authority. FacilityOS `iam.user_profile` is operational identity only.

W0-06 does not implement roles, permissions, AuthorizationService, RLS, SUPERUSER, approval authority or segregation of duty.

## Session architecture

The target Supabase mode uses `@supabase/ssr` cookie-backed clients:

- browser client: publishable key only;
- server client: publishable key + request cookies;
- route-handler client: publishable key + explicit cookie mutations;
- admin client: service-role key, server-only, provisioning only.

The service-role client is never used for normal authenticated-user requests and is never imported by browser code.

`proxy.ts` refreshes/verifies the Supabase session using `getClaims()`. Server current-user resolution uses `auth.getUser()`, then resolves `iam.user_profile` through the W0-03 PostgreSQL UnitOfWork.

## Trusted HUMAN ActorContext

Client-supplied actor IDs are not trusted. The HUMAN actor ID is the immutable FacilityOS `user_profile.id` resolved from the verified Supabase auth user.

A Supabase account without a FacilityOS profile is not a FacilityOS user. An INACTIVE profile is rejected even while the Supabase session remains technically valid.

## Provisioning

There is no public signup route and local Supabase signup is disabled.

Controlled server provisioning verifies an existing `auth.users` record through the isolated admin client, then creates one `iam.user_profile`.

For development/testing, `pnpm auth:bootstrap:local` provides an explicit local-only bootstrap. It requires runtime environment values:

- `FACILITYOS_BOOTSTRAP_EMAIL`
- `FACILITYOS_BOOTSTRAP_PASSWORD` (minimum 12 characters)
- `FACILITYOS_BOOTSTRAP_DISPLAY_NAME`

The script refuses non-local Supabase URLs and assigns no role or permission. Production bootstrap remains a deployment procedure requirement; no production user is created by migration.

## Email snapshot

`iam.user_profile.email_snapshot` is display/operational metadata only. Supabase remains authoritative for login identity/email. W0-06 does not automatically rewrite the snapshot on every request. Future controlled synchronization may update it without changing authentication authority.

## Auth-user deletion

`iam.user_profile.auth_user_id` has a unique FK to `auth.users(id)` with `ON DELETE RESTRICT`. Deleting an auth account cannot cascade-delete FacilityOS operational identity/history. Operational deactivation is represented separately through profile `INACTIVE`.

## Authorization safety

Supabase-authenticated users receive no FacilityOS roles in W0-06. Existing server guards deny any route that asks for a legacy role when Supabase mode is active. W0-07 must explicitly introduce roles/capabilities/scopes.

## Legacy transition

`FACILITYOS_AUTH_SOURCE` supports:

- `preview` — legacy preview identity;
- `frappe` — legacy Frappe auth;
- `supabase` — target Supabase Auth + FacilityOS profile.

Frappe auth files remain present for migration/reference safety.

## RLS

No W0-06 RLS policy is created. The `iam` schema is not added to the Supabase Data API exposed schema list. FacilityOS profile lookup is server-side PostgreSQL access only until W0-08.

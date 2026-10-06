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

The service-role credential is isolated in a server-only provisioning adapter. That adapter exposes only the bounded W0-06 operation needed by normal application code: resolve an existing Supabase auth user before controlled FacilityOS profile provisioning. It does not export a universal privileged Supabase client. The local bootstrap script uses local-only CLI credentials independently and refuses non-local Supabase URLs.

`proxy.ts` refreshes/verifies the Supabase session using `getClaims()`. Server current-user resolution uses `auth.getUser()`, then resolves `iam.user_profile` through the W0-03 PostgreSQL UnitOfWork.

## Trusted HUMAN ActorContext

Client-supplied actor IDs are not trusted. The HUMAN actor ID is the immutable FacilityOS `user_profile.id` resolved from the verified Supabase auth user.

A Supabase account without a FacilityOS profile is not a FacilityOS user. An INACTIVE profile is rejected even while the Supabase session remains technically valid. Protected operational routes require both a verified Supabase token and a provisioned ACTIVE FacilityOS profile.

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

## Auth-user linkage and account lifecycle

`iam.user_profile.auth_user_id` has a unique FK to `auth.users(id)` with `ON DELETE RESTRICT`.

The linkage is also protected by a database trigger: once a FacilityOS profile is created, its `auth_user_id` cannot be remapped to another account.

Deleting an auth account therefore cannot cascade-delete FacilityOS operational identity/history. Operational deactivation is represented separately through profile `INACTIVE`.

If the Supabase account is disabled/banned, Supabase authentication stops succeeding while the FacilityOS profile remains as operational history. If a provider is unlinked but the same `auth.users.id` remains, the FacilityOS linkage remains unchanged. If an auth identity is deleted/recreated with a new UUID, W0-06 does not silently relink the historical profile; a controlled operational procedure is required.

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


## Protected-route and redirect safety

The Next.js `proxy.ts` follows the Supabase SSR cookie-refresh pattern and verifies the access token with `auth.getClaims()`. For protected FacilityOS operational routes it additionally resolves the server-side `iam.user_profile` and requires `ACTIVE` status before allowing the request through.

The login `next` parameter accepts only same-origin application-relative paths. Absolute, protocol-relative and backslash redirect forms are rejected.

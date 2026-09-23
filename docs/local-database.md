# FacilityOS Local Database & Migration Lifecycle

**Status:** W0-02 local foundation.

This document covers only the reproducible local Supabase/PostgreSQL workflow. It does not link,
push to or modify a hosted Supabase project.

## Authority

The sole schema-migration authority is:

`supabase/migrations/*.sql`

FacilityOS uses **imperative, reviewable SQL migrations through the Supabase CLI**.

Do not introduce Prisma migrations, Drizzle migrations, Kysely migrations, ORM-managed schemas or a
second declarative schema authority.

Kysely is the planned query layer only.

## Local prerequisites

- Node.js 24 LTS
- pnpm 11.27.1
- Docker Desktop or another Docker-compatible container runtime

The Supabase CLI is a pinned project dev dependency. No global CLI installation is required.

## Safety boundary

The package scripts in W0-02 are deliberately local-only:

- they never call `supabase link`;
- they never call `supabase db push`;
- they never use `--linked`;
- they refuse to run when `supabase/.temp/project-ref` contains a linked project reference.

No remote Supabase URL, database password, service-role key or access token is required.

## Routine commands

`pnpm supabase:version`
: Verify the pinned CLI version.

`pnpm supabase:start`
: Start the local Supabase stack.

`pnpm supabase:stop`
: Stop the local stack.

`pnpm db:reset`
: Destroy and recreate the **local** database, replaying all SQL migrations and the local seed file.

`pnpm db:migrate`
: Apply pending migrations to the already-running local database.

`pnpm db:migration:new -- add_example`
: Create a new empty timestamped migration. Names must be lower_snake_case.

`pnpm db:types`
: Regenerate both committed TypeScript database-type artifacts from the running local database.

`pnpm db:verify`
: Start the local stack, reset twice, prove the W0-02 migration is applied, lint the public schema,
regenerate both type artifacts, compare schema fingerprints across resets, verify generated types are
deterministic, stop the stack, and fail if committed generated types drift.

## Migration naming

Use the Supabase timestamp convention:

`YYYYMMDDHHMMSS_lower_snake_case.sql`

Rules:

1. timestamps are UTC;
2. migrations are append-only once shared/applied;
3. do not rename or edit an already-applied shared migration;
4. corrections use a later forward-fix migration;
5. destructive migrations require explicit review and later production recovery planning;
6. W0-02 does not authorise business-domain schema.

The initial W0-02 migration is intentionally infrastructure-only and creates no FacilityOS domain
tables.

## Generated database types

Two generated files are committed:

- `src/platform/db/database.types.ts` — Supabase/PostgREST-shaped TypeScript schema types;
- `src/platform/db/kysely.types.ts` — Kysely server-query types.

Neither is a schema authority. Both are generated derivatives of the same local PostgreSQL schema,
which itself is reconstructed from the committed SQL migrations.

Generated files must never be manually edited. Regenerate with `pnpm db:types`.

CI later treats a generated-type diff as migration/type drift.

## Clean-install verification

`pnpm db:verify` proves:

1. local Supabase starts;
2. an empty local database is rebuilt from migrations;
3. the W0-02 migration is recorded in Supabase migration history;
4. PostgreSQL lint reports no public-schema errors;
5. Supabase and Kysely types generate;
6. a second clean reset yields the same public-schema fingerprint;
7. generated type files are deterministic;
8. the stack is stopped after verification.

## Seed policy

`supabase/seed.sql` is currently comment-only. W0-02 introduces no domain/test data.

Future deterministic fixtures require their own authorised work package.

## Remote environments

W0-02 does not create or link Development, Preview, Staging or Production Supabase projects.

When remote environments are later authorised, remote deployment scripts and credentials must be
separate from these local-only commands.

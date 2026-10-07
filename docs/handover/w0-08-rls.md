# W0-08 handover — RLS / Runtime Database Enforcement

Status: **TESTED**

Included: explicit NOLOGIN/NOBYPASSRLS runtime/admin roles; ENABLE + FORCE RLS on protected current
Wave-0 tables; transaction-local verified identity; Organisation/Legal Entity/Site/shared-Site
policies; explicit grants/revokes; Data API non-exposure; direct-SQL, pool-reuse and rollback tests;
security-aware schema fingerprinting; and handover documentation.

Excluded: W0-09 Audit/Approval/Hold, production DB login/password provisioning, hosted
Supabase/Vercel changes, ERP work, future business-domain tables, and legacy Frappe permission
migration/deletion.

Key files:
- `supabase/migrations/20261007023000_w0_08_rls_runtime_enforcement.sql`
- `src/platform/db/security-context.ts`
- `src/domains/iam/database-security-context.ts`
- `tests/integration/rls/rls.test.ts`
- `docs/security/rls.md`
- `docs/adr/0002-rls-runtime-context.md`

Production DATABASE_URL must use a separately provisioned non-owner/NOBYPASSRLS server login,
never postgres/migration authority/service_role. No production credentials are stored here.

Verification commands:
`pnpm db:verify:runtime`
`pnpm test:rls:unit`
`pnpm test:rls:integration`
`pnpm test:authorization:integration`
`pnpm test:auth:integration`
`pnpm test:core:integration`
`pnpm test:db:unit`
`pnpm test:db:integration`
`pnpm test:platform:unit`
`pnpm typecheck`
`pnpm lint`
`pnpm build`

- [x] Runtime/ownership/BYPASSRLS/FORCE-RLS design documented.
- [x] Trusted context and pool isolation documented.
- [x] Shared-Site and IAM administration safety documented.
- [x] Data API/service_role boundary documented.
- [x] Future-domain adoption guide documented.
- [x] W0-09/ERP/legacy/deployment boundaries documented.
- [x] Dedicated W0-08 CI evidence: GitHub Actions W0-08 run #20 (run 37582388328), 2026-10-07.
- [ ] Production verification — outside this package.


## Final TESTED evidence

- Authorised W0-08 starting SHA: `de07c7a939228fb86a5b7fc7da0752edf4a52842`.
- TESTED gate commit before closure docs: `ca9a744704830af15125e86fb46e9c1d7653899e`.
- GitHub Actions: W0-08 run #20 / run id `37582388328` — SUCCESS.
- Deterministic schema fingerprint: `3eb80fc3cdd6f10a66e63a01a114fa46e68c34571512264f507de1f7bbdea400`.
- All W0-03/W0-04/W0-05/W0-06/W0-07 regression steps inside the W0-08 gate passed.
- Generated type drift, TypeScript, lint, production build, legacy Python compile, 23 legacy
  DocTypes, docs checks, secret-pattern scan and repository drift passed.
- Deployment status: NOT DEPLOYED by W0-08; production verification remains outside this package.

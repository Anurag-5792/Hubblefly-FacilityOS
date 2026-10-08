# CI-BOOT-01 — Post-Merge Documentation-Only Canary

**Record type:** Temporary, non-normative diagnostic evidence.  
**Programme:** Hubblefly FacilityOS & ERPNext Program  
**Workstream:** 15 — Documentation, Handover & Release Governance  
**Bootstrap reference:** CI-BOOT-01, BOOT-AC-06  
**S_BOOT (frozen):** `46d2d74c8744ac7d4949604cdd3b7a0466d22e37`  
**PR target:** `rebaseline/sdlc-v1`

## Purpose

This single Markdown file is a disposable trigger-reachability diagnostic for the CI-BOOT-01 post-merge canary. It is not a normative R1 governance document, business requirement, technical design, product implementation, or change to any runtime behavior. It must not be mistaken for the R1-01 through R1-10 implementation manifest.

## Eight expected GitHub Actions workflows

Every workflow listed below must **execute and conclude SUCCESS**, including all required jobs, on the documentation-only canary PR targeting `rebaseline/sdlc-v1`. Missing, skipped, cancelled, failed, or inconclusive runs do not pass BOOT-AC-06.

1. `FacilityOS CI` — `.github/workflows/ci.yml`
2. `W0-02 Local Database Verification` — `.github/workflows/w0-02-local-db.yml`
3. `W0-03 Database Access Verification` — `.github/workflows/w0-03-database-access.yml`
4. `W0-04 Platform Primitives Verification` — `.github/workflows/w0-04-platform-primitives.yml`
5. `W0-05 Organisation Identifier Verification` — `.github/workflows/w0-05-organisation-identifier.yml`
6. `W0-06 Supabase Auth Verification` — `.github/workflows/w0-06-supabase-auth.yml`
7. `W0-07 Scoped Authorization Verification` — `.github/workflows/w0-07-authorization.yml`
8. `W0-08 RLS Runtime Enforcement Verification` — `.github/workflows/w0-08-rls.yml`

## Limits

This file contains only diagnostic text. It does not authorise a merge, modify CI, change application/database/inventory/ERPNext/security behavior, alter Frappe, or authorise R1 implementation. The canary PR must remain unmerged until a separate MASTER decision, and this temporary file is not to be promoted to the normative R1 documentation set.

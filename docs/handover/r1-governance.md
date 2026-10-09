# Hubblefly FacilityOS — R1-10 Final Governance Handover and Closure Evidence

**Programme:** Hubblefly FacilityOS & ERPNext Program  
**Workstream:** 15 — Documentation, Handover & Release Governance  
**Review authority:** 08 — FacilityOS Canonical Architecture, ADRs & Contracts  
**Programme acceptance authority:** 00 — MASTER  
**Repository:** [Anurag-5792/Hubblefly-FacilityOS](https://github.com/Anurag-5792/Hubblefly-FacilityOS)  
**Publication:** 9 October 2026 (R1-10 preparation; actual PR/run dates are recorded separately)  
**Status:** **R1-10 HANDOVER PROPOSED — INDEPENDENT REVIEW AND FINAL MASTER R1 CLOSURE PENDING**  
**Handover integration baseline:** S_R1 `d5fdbf31be313c4cd16f2a7f2245c3ef0b878f1f`, branch `rebaseline/sdlc-v1`  
**Change authority:** one-file documentation-only R1-10 PR. This document alone authorises **no merge, production rollout, R2–R6 work or governance maturity escalation**.

> Evidence discipline: distinguish a confirmed GitHub event from a programme decision attested by MASTER, and from a pending or inaccessible record. Independent ChatGPT technical review is not an actual GitHub-native APPROVE event. No unspecified waiver or actual production validation is inferred.

## 1. Purpose, accepted scope, normative sources and authority

R1 establishes the programme's reproducible, production-grade **software delivery governance**: authority hierarchy and status language; engineering/contributor rules; 15-point Definition of Ready (DoR) and 16-point Definition of Done (DoD); issue/implementation-plan/PR templates; independent specialist technical review and exact-current-HEAD evidence; independent-team operational documentation; release/schema/ERP compatibility/rollback/recovery policy; and R1-08 Option B ownership/RACI/reviewer prerequisites.

**Current normative governance design:** **MASTER-approved R1 SDLC Governance Design v1.2**, including its complete **Appendices A–C** for Issue, Implementation Plan and PR templates; supported by **MASTER-approved R1 Governance Implementation Plan v1.2**. These full frozen approval-source files are programme-controlled upstream evidence, not generated or modified by this R1-10 PR. **Design v1.1 is historical technical provenance only**; no v1.1 language imposing universal GitHub-native human approval overrides v1.2. The full Design v1.2/Plan v1.2 approval and source-file retention locations still require durable evidence-index confirmation (U-09).

**Decision hierarchy:** 00 — MASTER authorises programme changes and final programme PR acceptance; the implementing chat documents and tests; separate Chat 08/specialist ChatGPT executions inspect **actual** GitHub source and tests at an exact HEAD and return APPROVE / REQUEST CHANGES / BLOCKED; GitHub-native human approval is needed **only if actual verified GitHub rules require it**; the repository owner merges only after MASTER approval and satisfaction of actual platform gates. A new HEAD commit invalidates prior current-HEAD review/CI/Master approval. Final R1 programme **closure** additionally requires a separate R1-10 MASTER decision.

**Boundaries:** R1 provides policies and templates, not new application functionality, database changes, GitHub enforcement settings or deployment. Existing W0-01–W0-08 are **TESTED** (not DEPLOYED or PRODUCTION VERIFIED). W0-09 salvage is preserved only; W0-10+ are not authorised. Legacy Frappe remains preserved.

## 2. Immutable S0 → S_BOOT → S_R1 Git lineage

| Stage | Actual full SHA | Evidence / disposition |
|---|---|---|
| **S0 trusted pre-bootstrap source** | `864fc2c4087b43009433db2c98d3caf3239bb2fc` | [Git commit](https://github.com/Anurag-5792/Hubblefly-FacilityOS/commit/864fc2c4087b43009433db2c98d3caf3239bb2fc); integration branch source before CI-BOOT-01 |
| CI-BOOT-01 PR #7 source HEAD | `7e3ed238e7b09d779bc6dd03fcf43da700cfa32b` | [PR #7](https://github.com/Anurag-5792/Hubblefly-FacilityOS/pull/7), exactly 8 workflow YAML files; actual initial synthetic merge SHA `d655cd83eea4bd51b7c664aa7fa626b6cb855fe5` |
| **S_BOOT, merged PR #7** | `46d2d74c8744ac7d4949604cdd3b7a0466d22e37` | [Git merge commit](https://github.com/Anurag-5792/Hubblefly-FacilityOS/commit/46d2d74c8744ac7d4949604cdd3b7a0466d22e37). Verified parents **[S0, PR #7 HEAD]**. Merged **2026-10-08 17:47:56 UTC** by `Anurag-5792` |
| Documentation-only canary PR #8 | `0c5d2ba5c68bb4a21bd5f7cb757f89783239e6fc` | [PR #8](https://github.com/Anurag-5792/Hubblefly-FacilityOS/pull/8), **closed WITHOUT merging**; synthetic tested ref `309c896425a8873a40c36c02762a7f90741f94ed` with parents **[S_BOOT, canary HEAD]**; not part of S_R1 |
| R1-01–R1-08 PR #9 source HEAD | `1cd4f8cd2094fce8e1cfdcc03b66a83b5c166887` | [PR #9](https://github.com/Anurag-5792/Hubblefly-FacilityOS/pull/9), final independently reviewed HEAD; synthetic tested ref `d84774fb23bd4d9bca5f8ffa018dd57de1486218`; parents **[S_BOOT, PR #9 HEAD]** |
| **S_R1, merged PR #9** | `d5fdbf31be313c4cd16f2a7f2245c3ef0b878f1f` | [Git merge commit](https://github.com/Anurag-5792/Hubblefly-FacilityOS/commit/d5fdbf31be313c4cd16f2a7f2245c3ef0b878f1f); parents verified **[S_BOOT, PR #9 HEAD]**. Merged **2026-10-08 18:58:08 UTC** by `Anurag-5792`. Frozen integration base for this handover |

The integration branch `rebaseline/sdlc-v1` was re-read before opening the R1-10 branch and found to be **exactly S_R1**; source/merge/PR refs are distinguished (a synthetic tested merge is **not** an actual merged integration commit). No direct `main` cutover is established.

## 3. CI-BOOT-01 — narrowly accepted reachability, evidence and exclusions

**CI-BOOT-01 is ACCEPTED and CLOSED by MASTER.** Its distinct, bounded PR #7 altered only `on.pull_request` target reachability for `rebaseline/sdlc-v1` and governance/template path filters where applicable in these **eight** workflows:

1. `.github/workflows/ci.yml` — FacilityOS CI
2. `.github/workflows/w0-02-local-db.yml` — W0-02 Local Database Verification
3. `.github/workflows/w0-03-database-access.yml` — W0-03 Database Access Verification
4. `.github/workflows/w0-04-platform-primitives.yml` — W0-04 Platform Primitives Verification
5. `.github/workflows/w0-05-organisation-identifier.yml` — W0-05 Organisation Identifier Verification
6. `.github/workflows/w0-06-supabase-auth.yml` — W0-06 Supabase Auth Verification
7. `.github/workflows/w0-07-authorization.yml` — W0-07 Scoped Authorization Verification
8. `.github/workflows/w0-08-rls.yml` — W0-08 RLS Runtime Enforcement Verification

PR #7 preserved job definitions, tests, Node/pnpm/action versions, security gates, repository permissions, push triggers and `sync-frappe-deploy.yml`. The original bootstrap PR's **8/8 workflow runs** were independently queried and all concluded `completed/success`. No per-check initial-trigger exception is documented as requested or granted; the final accepted bootstrap path proceeded with the actual tests running.

**BOOT-AC-06 canary:** PR #8 added exactly one non-normative temporary diagnostic file, `docs/governance/ci-boot-01-canary.md`, on a branch made from S_BOOT. The canary had **8/8 successful workflow runs and all eight required jobs passed**. It was **closed without merge**, so its diagnostic file never entered `rebaseline/sdlc-v1`. Its PR discussion, HEAD, tested merge ref, and run/job evidence remain historical evidence; do not delete or merge the canary to complete R1.

### 3.1 Historical eight-workflow run index (all rows terminal SUCCESS)

| Existing workflow / required job | PR #7 bootstrap run | PR #8 docs-only canary run | PR #9 R1-01–R1-08 run |
|---|---:|---:|---:|
| FacilityOS CI / `build` | [37815964921](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37815964921) | [37819750506](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37819750506) | [37824423906](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37824423906) |
| W0-02 / `local-db` | [37815964818](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37815964818) | [37819746549](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37819746549) | [37824423972](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37824423972) |
| W0-03 / `database-access` | [37815964935](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37815964935) | [37819746511](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37819746511) | [37824423890](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37824423890) |
| W0-04 / `platform-primitives` | [37815964855](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37815964855) | [37819746539](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37819746539) | [37824423876](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37824423876) |
| W0-05 / `organisation-identifier` | [37815964937](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37815964937) | [37819746504](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37819746504) | [37824423871](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37824423871) |
| W0-06 / `auth` | [37815964791](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37815964791) | [37819746602](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37819746602) | [37824423999](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37824423999) |
| W0-07 / `authorization` | [37815965082](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37815965082) | [37819746509](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37819746509) | [37824423951](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37824423951) |
| W0-08 / `rls` | [37815964871](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37815964871) | [37819746524](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37819746524) | [37824424013](https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/37824424013) |

Run conclusions for all 24 references were re-read as `completed/success` during R1-10 preflight. For PRs #8 and #9, required-job terminal PASS is also independently recorded in prior workstream verification and the R1-09 report; that evidence is linked through those PR histories. The **new R1-10 PR must have its own eight successful runs and required jobs**; historical success never substitutes for its current HEAD.

**Critical lifecycle distinction:** CI-BOOT-01 **reachability = CLOSED/ACCEPTED**. Future required-check naming, check consolidation, workflow redesign and R5 parity proof **remain OPEN for the separately authorised R5/R2 phase**. This is not permission to reopen CI-BOOT-01 or alter CI in this R1-10 PR.

## 4. R1-01 through R1-08 accepted package inventory and exact 18-file manifest

The merged PR #9 GitHub commit comparison `S_BOOT...S_R1` returns precisely **18 approved paths**: **17 new documentation/template files plus a four-line navigation addition to README.md**. R1-10 creates the **nineteenth** path in a **separate later PR**; no earlier R1-01–R1-08 file is modified here.

| Package / acceptance IDs | Exact integrated paths under S_R1 | Proven evidence |
|---|---|---|
| **R1-01** Governance foundation / R101-AC1–3 | [`docs/governance/README.md`](../governance/README.md), [`docs/governance/authority-and-phase-boundaries.md`](../governance/authority-and-phase-boundaries.md), [`README.md`](../../README.md) (navigation only) | Governance authority, status language, current v1.2/legacy v1.1 precedence, R2–R6 boundaries, existing documentation index |
| **R1-02** Engineering / R102-AC1–3 | [`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`docs/governance/engineering-standards.md`](../governance/engineering-standards.md) | Compile-time inward imports versus runtime call order; W0-03 UnitOfWork and dependency, security, source rules |
| **R1-03** DoR/DoD / R103-AC1–3 | [`docs/governance/readiness-and-done.md`](../governance/readiness-and-done.md), [`docs/governance/exception-and-transition-register.md`](../governance/exception-and-transition-register.md) | DOR-01–15, DOD-01–16, READY FOR IMPLEMENTATION workflow gate, no-waiver rules and transition risks |
| **R1-04** Templates / R104-AC1–4 | [`.github/ISSUE_TEMPLATE/implementation.md`](../../.github/ISSUE_TEMPLATE/implementation.md), [`docs/templates/implementation-plan.md`](../templates/implementation-plan.md), [`.github/PULL_REQUEST_TEMPLATE.md`](../../.github/PULL_REQUEST_TEMPLATE.md) | Normative Design v1.2 Appendices A/B/C; three parity checks; AC→positive/negative-test→evidence; no unconditional native human approval |
| **R1-05** Independent review / R105-AC1–4 | [`docs/governance/review-and-evidence.md`](../governance/review-and-evidence.md), [`docs/templates/review-evidence.md`](../templates/review-evidence.md) | Separate actual-source specialist inspection, findings, exact HEAD/base/tested ref, durable CI artifact and MASTER decision proof |
| **R1-06** Documentation / R106-AC1–3 | [`docs/governance/documentation-and-handover.md`](../governance/documentation-and-handover.md), [`docs/templates/module-handover.md`](../templates/module-handover.md) | Product vision/business value, actors, workflow, support, ADR history, reproducing build/tests/recovery and maturity/limitations |
| **R1-07** Release/recovery / R107-AC1–3 | [`docs/governance/release-deployment-recovery.md`](../governance/release-deployment-recovery.md), [`docs/templates/release-manifest.md`](../templates/release-manifest.md) | Immutable release identity, app/schema/ERPNext/config/worker compatibility, approvals, migration/rollback, backup/PITR/recovery evidence |
| **R1-08** Option B ownership / R108-AC1–4 | [`docs/governance/ownership-and-approvals.md`](../governance/ownership-and-approvals.md), [`docs/governance/reviewer-prerequisites.md`](../governance/reviewer-prerequisites.md) | Mandatory truthful RACI and verified-prerequisites policy; **CODEOWNERS file and enforcement belong to R2**, no invented accounts |

**R101–R108:** Independent Chat 08's read-only PR #9 R1-09 technical review returned **PASS for every package**, with no blocking implementation findings. The report is held as a separately provided programme artifact, titled *MASTER CHAT UPDATE — R1-09 Independent Governance Implementation Review* (8 October 2026); its durable canonical archive link is **not yet supplied** and is a U-09 archival item, not a fabricated PR review.

**Preservation:** No changes were merged through PR #9 to runtime source, application, database schemas/migrations/SQL, W0-03 persistence, W0-07 authorization, W0-08 RLS, Inventory/ERPNext implementation, package/dependency lockfiles, workflows, CODEOWNERS, deployment configuration, or legacy Frappe source. A policy-only merge does not prove future policy enforcement.

## 5. R1-09 independent technical review and PR #9 MASTER decision

**Independent reviewer:** Chat 08 — FacilityOS Canonical Architecture, ADRs & Contracts. **Actual source reviewed:** PR #9 at `1cd4f8cd2094fce8e1cfdcc03b66a83b5c166887` against S_BOOT; synthetic merge `d84774fb23bd4d9bca5f8ffa018dd57de1486218`. **Verdict: APPROVE** for R1-01 through R1-08; **18/18 paths**, **3/3 template comparisons**, **8/8 workflow and required-job passes**, **no blocking technical findings**, **N-01 and N-02 non-blocking**. R109-AC1 and AC2 marked PASS. At the **review moment** R109-AC3 and AC4 remained partially pending the *separate later* MASTER/platform/archival stages; do not rewrite that historical verdict as a GitHub approval.

**MASTER decision and owner execution:** 00 — MASTER has confirmed the exact-HEAD PR #9 approval and successful owner-authorised merge, as stated in the 9 October 2026 R1-10 instruction. GitHub independently records PR #9 `merged=true`, merge commit `d5fdbf31be313c4cd16f2a7f2245c3ef0b878f1f`, actual merge timestamp 2026-10-08 18:58:08 UTC, and merging account `Anurag-5792`. The archived stand-alone MASTER approval record or ID was **not independently retrieved from GitHub**; its durable programme-evidence location remains to be attached under U-09. This does not overturn MASTER's direct confirmation.

**GitHub-native human approval/platform gate evidence:** A read-only check of PR #9's native review submissions returned **zero native review entries**; this cannot be presented as a GitHub-native APPROVE. The integration branch metadata reports `protected=false` and the repository rulesets collection returned `[]`, but the GitHub connector's classic branch-protection endpoint returned **403 (not accessible by integration)**. Therefore the owner-authoritative classic-protection and conditional native-approval disposition supporting the historical merge is **not archived in the evidence accessible here**. Preserve this **platform-evidence gap** honestly for U-02/U-03/U-05 and R2; do not retroactively invent a waiver or infer permission to bypass any actually enforced rule. Future R1-10 merge decisions still require current owner-authoritative platform verification.

### 5.1 R1-09 non-blocking observations resolved for handover (not re-implementation)

| Independent observation | Historical source | R1-10 disposition |
|---|---|---|
| **N-01 — prior OPEN CI status repeated in prerequisite history** | `docs/governance/reviewer-prerequisites.md` reproduces Design v1.2 historical U-07 row even after recording CI-BOOT-01 acceptance | **RESOLVED AS HANDOVER INTERPRETATION:** pre-BOOT `OPEN` is historical only. Narrow PR reachability is **CLOSED/ACCEPTED** at S_BOOT after 8/8 canary; later required-check naming and R5 consolidation remain **OPEN**. No rewrite of the merged source |
| **N-02 — historical "future CI-BOOT-01" wording** | `docs/governance/authority-and-phase-boundaries.md` quotes older approved design-era future prerequisite language | **RESOLVED AS HANDOVER INTERPRETATION:** historical wording records the design decision at its original time, not a current instruction or a request to restart bootstrap. Actual sequence `S0 → PR #7 → S_BOOT → canary → PR #9 → S_R1` controls current status. No source modification |

Both N-01/N-02 were LOW severity and did not require PR #9 source remediation. This R1-10 interpretation is documentary only. Neither authorises the R5 consolidation or the R2 required-check enforcement.

## 6. Authoritative templates and independent-team use

The normative template files **at S_R1** are:

- **Issue — Design v1.2 Appendix A:** [`.github/ISSUE_TEMPLATE/implementation.md`](../../.github/ISSUE_TEMPLATE/implementation.md). Business objective/actor/lifecycle, accepted design, authoritative data facts, all DOR-01–15, AC-to-test/evidence, prerequisites and implementation scope.
- **Implementation Plan — Design v1.2 Appendix B:** [`docs/templates/implementation-plan.md`](../templates/implementation-plan.md). Dependencies/paths, reproducible commands, security/ERP/Inventory/legacy impact, stop/rollback and traceable approvals.
- **PR — Design v1.2 Appendix C:** [`.github/PULL_REQUEST_TEMPLATE.md`](../../.github/PULL_REQUEST_TEMPLATE.md). All DOD-01–16, exact 40-character source HEAD, base and tested merge refs, CI run/job IDs, independent specialist review, conditional **native** GitHub approval, MASTER final PR decision and owner merge records.

Implementer and independent Chat 08 both verified these three templates' parity with approved Design v1.2 Appendices A–C; Chat 08 reported exact match **after trailing-whitespace normalisation**. These source templates retain original v1.1 architecture/security/Inventory/ERP and traceability requirements, but v1.2 **controls** PR review authority. Historical v1.1 is not another live template standard.

### 6.1 Independent engineering-team onboarding and reproduction

1. **Recover why this exists:** Read [governance index](../governance/README.md), [README](../../README.md), [contributor guidance](../../CONTRIBUTING.md), approved Design/Plan v1.2 and the original requirement. Record vision, business and operational problem, user, capability, measurable value, end-to-end states, accepted/superseded ADRs and maturity.
2. **Understand architecture:** [Target architecture](../target-architecture.md), [W0-03 database access](../database-access.md), [W0-07 authorization](../security/authorization.md), [ADR-0001](../adr/0001-capability-based-scoped-authorization.md), [W0-08 RLS](../security/rls.md), [ADR-0002](../adr/0002-rls-runtime-context.md), existing [W0-07](w0-07-authorization.md) and [W0-08](w0-08-rls.md) handovers. Treat legacy [architecture.md](../architecture.md) as **SUPERSEDED / LEGACY REFERENCE** where marked. Target `src/modules/` is frozen; existing structures are not moved until R4.
3. **Know the authority split:** FacilityOS owns operational physical locations, containers, serial/batch, GRN/IQC and manufacturing consumption/execution. Inventory Management is **mandatory**. Keep IQC `Accepted/Rejected/Hold/Return`, reservation, issue, adjustments and **ERP posting eligibility** separate. ERPNext alone owns **official stock ledger, valuation, accounting**; FacilityOS must **never write ERPNext's database directly**. ERP transactions use authorised API contracts, idempotency, reconciliation and official references.
4. **Preserve security/data boundaries:** Inward compile-time dependencies, W0-03 UnitOfWork application transaction ports; W0-07 default-deny server-scoped authorisation, distinct-human segregation of duties; W0-08 RLS/FORCE RLS, non-bypass ordinary DB roles, security-negative tests. No `platform.superuser` DB bypass, no exposed protected private schemas/Data API, no hidden production bypass. For migrations, check role grants, SECURITY DEFINER, search_path, isolation and generated-type/fingerprint drift.
5. **Set up an authorised non-production checkout:** Node.js **24.x**, pnpm **11.27.1**, exact `pnpm-lock.yaml`, local isolated Supabase/PostgreSQL and Docker if DB suites are run. Use non-production test credentials/fixtures, never production ERP/DB/data. Approved commands are supplied below.
6. **Follow governance:** Requirement and issue DoR → approved plan and bounded MASTER implementation authority → source/tests → current-HEAD GitHub CI → independent specialists inspect actual files and negative tests → platform-native approval only if actually enforced → MASTER final programme PR acceptance → authorised owner merge/provenance → separate release/deployment authority. After **every** HEAD commit re-run all applicable reviews/checks.
7. **Operate/support/recover:** Use [module handover template](../templates/module-handover.md) and [documentation standard](../governance/documentation-and-handover.md) for environment, API, security, logging/alerting, runbooks, health, known limitations and decision history. Use [release/recovery policy](../governance/release-deployment-recovery.md) and [release manifest template](../templates/release-manifest.md) for app/schema/ERP/API/worker/config compatibility, backup/PITR restore evidence, stop and rollback/compensation (ERP correction through official ERP API documents, not SQL). No production recovery tests are established by R1.

### 6.2 Safe reproducibility command catalogue (illustrative; run on permitted isolated checkout)

```bash
git clone https://github.com/Anurag-5792/Hubblefly-FacilityOS.git
cd Hubblefly-FacilityOS
git fetch origin --prune
git checkout --detach d5fdbf31be313c4cd16f2a7f2245c3ef0b878f1f
git rev-parse HEAD
node --version
corepack enable
corepack prepare pnpm@11.27.1 --activate
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm test:db:unit
pnpm test:platform:unit
pnpm test:core:unit
pnpm test:auth:unit
pnpm test:authorization:unit
pnpm test:rls:unit

# LOCAL TEST DATABASE ONLY; require authorised Docker/Supabase setup:
pnpm db:verify:runtime
pnpm test:db:integration
pnpm test:core:integration
pnpm test:auth:integration
pnpm test:authorization:integration
pnpm test:rls:integration
pnpm supabase:stop
```

These are **reproduction instructions**, not claims that every local command was re-executed by this handover. The GitHub workflows above are the confirmed historical execution evidence for source heads of PRs #7–#9; R1-10 must pass its own HEAD/CI checks.

## 7. Outstanding U-01 through U-10 — updated status, owners and gates

These IDs come from approved Design v1.2 §14 and Plan v1.2 §12. Do **not** erase original `OPEN` wording in archived pre-execution design documents. The table below is the later **as-of-S_R1 / R1-10 preparation** execution status.

| U ID | Current disposition | Owner and required future evidence | Release/phase gate |
|---|---|---|---|
| **U-01** | **OPEN:** adoption/cutover of `main` not authorised | 00 — MASTER + R2 branch strategy, approval/rollback record | No implicit `main` deployment or merger |
| **U-02** | **CONDITIONAL, platform evidence incomplete:** native GitHub reviewer account(s) required only if actual verified branch protection enforces it. PR #9 had **no native GitHub review entries**; do not invent them | Repository owner/admin obtains authoritative rules, records `REQUIRED / NOT REQUIRED / UNVERIFIED` and separately eligible approving human if REQUIRED | Any future merge with an unverified/enforced requirement |
| **U-03** | **OPEN for R2:** reviewer numbers/roles, CODEOWNERS and required checks enforcement | MASTER/R2 confirmed GitHub ruleset/review matrix; programme's independent ChatGPT reviews and final MASTER authority are already determined | Future R2 enforcement |
| **U-04** | **DECIDED — Option B implemented as R1 policy.** Actual CODEOWNERS and identities deferred | R1-08 policy and register at S_R1; R2 verifies real handles/eligibility/teams and installs controls only after new authority | No CODEOWNERS requirement for R1 documentary closure |
| **U-05** | **OPEN for future policy:** PR #7 and PR #9 used actual owner-created merge commits, verified; general future merge/bypass method and audited controls remain not frozen for R2 | MASTER/owner/R2 approve merge strategy, bypass policy, branch/rules proof | Future governed merges |
| **U-06** | **PARTLY FIXED:** selected target root `src/modules/` is final; migration/reconciliation of existing `app/`, `lib/`, `src/domains/` remains **OPEN** | Architecture/R4 inventory/porting plan with preserved tests and accepted data migration | R4 only, not R1 structural move |
| **U-07** | **SPLIT:** CI-BOOT-01 **PR reachability CLOSED and ACCEPTED** at S_BOOT after PR #7 and PR #8 8/8 canary. Future required-check naming, overlapping W0 checks and R5 CI/test consolidation **OPEN** | MASTER/CI owner and R2/R5; required-check policy and equal-or-stronger test coverage proof | Future R2/R5 only; do not re-run bootstrap as unfulfilled |
| **U-08** | **OPEN:** hosted deployment, ERPNext API versions, backup/PITR/RPO/RTO, restore evidence and production reconciliation remain unverified | Platform + ERPNext integration + release owners must produce verified environment/restore and compatibility evidence | Production-readiness and release; not documentary R1 |
| **U-09** | **OPEN:** final retention duration, custodian delegation/access, immutable archive and evidence-expiry controls not accepted | MASTER/governance owner must name durable storage/access/retention, archive Design v1.1/v1.2, Plan v1.2, Chat 08 reports, MASTER approvals, PRs and ephemeral Actions logs/artifacts | Final archive quality and continuing audit; must receive an explicit MASTER risk/closure disposition |
| **U-10** | **DECIDED and implemented:** R1-08 mandatory Option B; ownership/RACI + truthful prerequisite register in S_R1, CODEOWNERS R2 | MASTER scope approval and R1-08 source evidence | No remaining A/B choice |

No unverified U-item should be silently converted to `CLOSED` merely because PR #9 merged. In particular, **U-07 reachability** has a closed sub-gate and a **different open R5 sub-gate**, while **U-09 remains an outstanding archival/retention decision**.

## 8. Evidence custody, proof index and remaining archival risks

| Evidence | Identifiable current source | Custody / unresolved archive task |
|---|---|---|
| Approved Design v1.2/Plan v1.2 and historical Design v1.1 | MASTER-approved programme files (outside this one-file PR), normative template copies at S_R1 | Preserve signed/versioned source bytes/hashes and exact approval decisions under U-09 |
| CI-BOOT-01 code/diff and owner merge | [PR #7](https://github.com/Anurag-5792/Hubblefly-FacilityOS/pull/7), [S_BOOT](https://github.com/Anurag-5792/Hubblefly-FacilityOS/commit/46d2d74c8744ac7d4949604cdd3b7a0466d22e37), workflow run IDs in §3.1 | Retain PR discussion, review and archived CI artifacts/logs outside future Actions TTL |
| BOOT-AC-06 canary | [PR #8](https://github.com/Anurag-5792/Hubblefly-FacilityOS/pull/8), source HEAD, synthetic merge and eight terminal runs | **Closed without merge**; preserve temporary branch/commit evidence and do not re-introduce the diagnostic file as normative |
| R1 implementation and release provenance | [PR #9](https://github.com/Anurag-5792/Hubblefly-FacilityOS/pull/9), [S_R1](https://github.com/Anurag-5792/Hubblefly-FacilityOS/commit/d5fdbf31be313c4cd16f2a7f2245c3ef0b878f1f), all 18 paths, `3.1` jobs | Archive exact-source review report and MASTER source-HEAD approval record with immutable IDs |
| R1-09 independent specialist review | *MASTER CHAT UPDATE — R1-09 Independent Governance Implementation Review* (8 Oct 2026), Chat 08 verdict APPROVE at `1cd4f8cd...`, N-01/N-02 | Report was supplied separately to the programme; no invented native GitHub review URL; archive exact report before programme closure |
| Native GitHub review/protection evidence | GitHub review query PR #9: 0 entries; branch metadata `protected=false`; repo rulesets `[]`; classic protection GET returns 403 to current connector | Owner-authoritative snapshot/requirement and PR #9 merge-gate disposition **not presently archived/verified through this access**; track U-02/03/05 |
| R1-10 implementation and closure | This file at exact R1-10 PR HEAD (to be recorded), eight fresh current-HEAD workflows, independent Chat 08 review, MASTER final closure | **PENDING**; no R1-10 approval, merged integration SHA or final closure decision may be filled in before events occur |

**Recommended evidence custodian:** 15 — Documentation, Handover & Release Governance for index assembly; 00 — MASTER accepts its final duration/access/retention under U-09; GitHub repository owner maintains the native PR/CI source and owner-attested platform snapshots. This is an operational proposal, **not** a falsely finalised retention policy. GitHub Actions logs/artifacts may expire; export and hash evidence before expiry under an authorised archival mechanism. No secrets, credentials, production business data, personal-ID documents or private logs should be committed into public handover Markdown.

## 9. R2–R6 and future-product handoff (all require separate authority)

| Phase | Next owner and bounded deliverable | Explicit R1-10 prohibition |
|---|---|---|
| **R2** | MASTER/GitHub owner: repo branch strategy, actual protection/ruleset snapshots, conditional native approval, CODEOWNERS, merge/release enforcement | No GitHub settings/accounts/CODEOWNERS edits under R1 |
| **R3** | MASTER/classification owner: only approved KEEP/REFACTOR/MIGRATE/ARCHIVE/REMOVE cleanup | No deletion or reclassification in this PR |
| **R4** | Architecture owner: preserve accepted target `src/modules/` while mapping/reconciling existing source and docs; independently test migrations | No moving `app/lib/src/domains` or modifying ADR decisions |
| **R5** | CI/test owner: consolidate/rename checks only with independent equivalent-or-stronger coverage proof, while preserving accepted eight-workflow current gate | No CI YAML edits or regression-gate weakening; U-07 future facet OPEN |
| **R6** | W0-09 salvage authority: separate full review and KEEP/PORT/REWORK/DROP disposition prior to any reintroduction | No W0-09 or W0-10 continuation/merge under R1 |

**Production and operational states:** No R1 document merge proves Inventory runtime acceptance, production ERPNext posting, real backup restore, recovery RPO/RTO, operational UAT, rollout or on-prem/hosted production verification. The governance work's factual status is **IMPLEMENTED in repository and TESTED by required CI** (R1-01–R1-08); **R1-10 document under review**; **DEPLOYED / PRODUCTION VERIFIED not established**.

## 10. R110-AC1 through R110-AC4 proposed closure acceptance matrix

| Criterion | Required proof | Evidence / current disposition |
|---|---|---|
| **R110-AC1** | R1-01–R1-08 mandatory deliverables plus R1-09 independent actual-source APPROVE and MASTER exact-HEAD PR #9 acceptance | **EVIDENCED:** 18-path S_R1 commit, 3 normative templates, Chat 08 APPROVE at `1cd4f8cd...`, eight PR #9 current-HEAD runs, MASTER-confirmed prior PR decision. Native/platform detail retained as separately flagged incomplete archival evidence |
| **R110-AC2** | Authorised actual PR #9 merge source HEAD, exact S_R1 integration SHA, no unapproved changed path | **PASS — GitHub VERIFIED:** PR #9 merged by `Anurag-5792`, parents `[S_BOOT, 1cd4f8cd...]`, integration S_R1 `d5fdbf31...`, exactly 18 approved files |
| **R110-AC3** | Readable independent-team handover: v1.2 template precedence, v1.1 history, CI/SHAs, Index, reproducibility, security, Inventory, ERP, legacy, recovery, U-items and R2 handoff | **PREPARED FOR INDEPENDENT REVIEW:** this one-file report plus `6` operating guide; final PASS is **PENDING R1-10 PR checks and Chat 08** |
| **R110-AC4** | Explicit 00 — MASTER R1 programme closure/status decision, accepted independent R1-10 review, current-head CI, evidence-retention/open-item disposition; R2–R6 and production frozen | **PENDING MASTER:** not automatically accepted by previous PR #9 merge or this report; no permission to merge the R1-10 PR |

These statuses intentionally distinguish already-completed historic governance acceptance from the **not-yet-completed** R1-10 PR current-head CI, separate specialist technical review and MASTER final closure.

## 11. R1-10 execution and final acceptance instructions

**R1-10 authorised branch:** `docs/r1-10-handover`, **created from exactly S_R1**. **Single permitted new path:** `docs/handover/r1-governance.md`. Target `rebaseline/sdlc-v1`. The implementer will provide actual PR #, source HEAD, base SHA, synthetic merge SHA/parents, one-file diff and **eight new workflow + required-job PASS records** after this Markdown is committed and the PR is opened. Those values must be recorded in the PR's evidence comment, not invented in this pre-PR text.

**Independent Chat 08 review** (read-only) must inspect actual single-file source diff, links, all evidence records, package/AC traces, N-01/N-02, U-01..U-10, frozen S_R1 ancestry and all eight current-head runs/jobs; returns APPROVE / REQUEST CHANGES / BLOCKED with exact HEAD and evidence. Any HEAD change invalidates its verdict and current-HEAD CI record.

**00 — MASTER** decides whether to accept this R1-10 PR at its exact reviewed HEAD and **separately** whether the programme has satisfied R110-AC1..AC4, including any explicit U-09 archival risk disposition. The repository owner must **NOT MERGE** this R1-10 PR under its creation authority; any later merge would require its own exact-HEAD decision plus actually applicable verified GitHub platform requirements.

**R1-10 closure is therefore NOT YET ACCEPTED.** Retain this distinction after creation of this document and even if all eight CI checks pass.

# Independent Specialist Reviews, Exact-HEAD Evidence and MASTER PR Decision

**Programme:** Hubblefly FacilityOS & ERPNext Program  
**Implementation package:** R1-05  
**Authoritative source:** MASTER-approved R1 SDLC Governance Design **v1.2**, 8 October 2026; historical Design v1.1 technical content remains incorporated in v1.2.  
**Implementation baseline:** S_BOOT `46d2d74c8744ac7d4949604cdd3b7a0466d22e37`; integration target `rebaseline/sdlc-v1`.  
**Status:** R1 DOCUMENTATION IMPLEMENTATION — PENDING INDEPENDENT R1-09 REVIEW AND MASTER PR ACCEPTANCE.

> This implements the previously approved governance contract. It does not itself authorise product changes, GitHub settings, R2–R6, W0-09/W0-10, a merge or a production deployment.

## 5. Independent specialist review, MASTER acceptance and exact-SHA evidence

### 5.1 Four non-substitutable roles

1. **Implementing chat / implementer:** implements only its authorised bounded scope, commits under identifiable provenance, executes reproducible local tests, produces exact changed-file list, PR link and AC-to-test-to-evidence trace. It **cannot issue an independent verdict on its own work**.
2. **Independent specialist ChatGPT reviewers:** assigned separately from the implementing chat; each inspects the **actual repository source at the full PR HEAD SHA**, all relevant PR changes, CI/test output and risks, not solely an implementer-written summary. Review scope includes architecture, security, database, Inventory, ERPNext and/or release as appropriate. They return one evidence-backed verdict: `APPROVE`, `REQUEST CHANGES` or `BLOCKED`.
3. **00 — MASTER:** independently reads the PR, review reports, current-head CI results, acceptance criteria, unresolved risks and platform status. MASTER provides the **final programme PR acceptance decision**, never merely forwards a reviewer vote. A specialist APPROVE or green CI is insufficient without this decision.
4. **Repository owner and GitHub platform:** owner executes merge **only after** MASTER accepts that exact HEAD and all actually applicable GitHub rules are satisfied. Actual native GitHub `APPROVE` reviews, when required, must come from eligible, separate GitHub accounts; chat/AI prose never counts as a native approving event.

### 5.2 Technical reviewer independence and identity

- The implementing chat/agent and final reviewing chat/agent must be **distinct conversations/executions** with separately assigned responsibility; changing a role label or prompt in the same implementer session does not establish independence.
- Each reviewer declares its reviewing chat identifier, model/agent if known, role/specialism, source access method, independence from implementation, PR number, full reviewed HEAD SHA, base SHA, examined files/diff, tests/CI runs, findings and time. Do not invent human identities, GitHub usernames, tool access, executed commands or test results.
- For critical changes, independently assigned specialist reviews cover each implicated trust/authority boundary; reviewers can disagree, and their disagreement is evidence rather than a vote to be averaged. Reviewers must not approve without inspecting code, and must not infer security or functional correctness solely from a passing test count.
- Same provider/model does not by itself invalidate separation if independently assigned chats, source inspection and provenance are demonstrable; a shared implementation agent/session or report based only on its own summary **does** invalidate independence.
- AI reviewers do not act as human GitHub accounts. No forged GitHub events or surrogate approvals.

### 5.3 GitHub-native approval is a conditional, distinct platform gate

Before requesting a merge, an authorised operator must obtain evidence of **actual** repository branch protection/rulesets, required reviews and who may approve on the current target branch. `No rulesets` alone is not proof that classic branch protection is absent. Connector permission limitations must be recorded as `UNVERIFIED`, not assumed disabled.

- **If GitHub approval is enforced** (or separately frozen as a required platform-level control): obtain the requisite real `APPROVE` review(s) from eligible, separate GitHub identities, with commit currency and dismissal rules validated. If accounts are unavailable, `BLOCKED`; the owner cannot self-approve an owner-authored PR or bypass enforcement.
- **If not enforced:** record the verified configuration/time/evidence and state `GitHub-native approving review: NOT REQUIRED`. Programme acceptance instead requires independent specialist ChatGPT review(s), GitHub CI and explicit MASTER final decision. Do **not** claim a native GitHub approval occurred.
- **If status cannot be verified:** `BLOCKED` for merge until admin-capable verification or a separately authorised platform-governance resolution. A missing connector permission cannot be treated as a waiver.
- This R1 policy does not change GitHub settings; **R2** owns setting, checking and later enforcing the branch/ruleset/CODEOWNERS policies.

### 5.4 Minimum review and programme gates

For every bounded PR: current-head reachable CI required; one or more genuinely independent specialist ChatGPT technical reviews appropriate to the changed surface; all applicable high-risk specialists; all blocking findings resolved; verified GitHub platform-gate disposition; explicit **00 — MASTER final PR APPROVE**; and subsequent owner merge with recorded SHA.

For critical architecture, IAM/RLS, DB privilege/migration, ERPNext write paths, Inventory quality/approval/reconciliation, audit/evidence, release/recovery or legacy cutover changes, obtain separately assigned relevant specialist technical sign-offs and adversarial/negative testing. An independent technical APPROVE does not neutralise another outstanding `REQUEST CHANGES` or `BLOCKED` verdict.

### 5.5 Exact-HEAD inspection and revalidation

Each reviewer record identifies repository, target/base ref and SHA, full **40-character PR HEAD SHA**, commit/file/diff scope inspected, command/test result provenance, GitHub Actions workflow/run ID, conclusion, relevant AC IDs, evidence artifacts, risk, findings, timestamp and verdict. For `pull_request` checks, record the actual tested merge-ref/commit and its provenance back to this PR HEAD and intended base; never label a synthetic merge SHA as the source HEAD. Include both full SHAs.

**Every new HEAD commit** invalidates prior technical verdicts, specialist sign-offs and MASTER acceptance for the new HEAD; rerun all applicable CI, independently re-inspect code, reissue each required current-head verdict, obtain a new MASTER final decision and, if enforced, valid current native GitHub approvals. This applies even to an alleged typo-only commit. A changed base/merge context that invalidates CI requires refreshed check evidence. No blanket prior approval survives a HEAD change.

### 5.6 Disagreement, failed review and escalation

- Any required reviewer `REQUEST CHANGES` or `BLOCKED`, any material conflicting reviewer claims, unexplained CI failure, or unverified platform status stops acceptance.
- Implementer may remediate only within authorised scope. New HEAD triggers complete revalidation. An unresolved interpretation dispute goes to architecture/security owner as appropriate and to MASTER for a recorded adjudication; MASTER may require an additional independent specialist review.
- MASTER may **REQUEST CHANGES** or **BLOCK** regardless of reviewer consensus; it may accept after documented findings resolution and mandatory technical/platform checks. MASTER cannot turn an open critical defect or active GitHub required-review rule into a false pass by assertion.
- No majority voting, no self-review substitution and no silently dismissed blocking findings.

### 5.7 Evidence retention and non-waivable controls

Persist linkable issue→requirement→AC→commit→test→CI run/checked-ref→independent reviewer verdicts→MASTER decision→native GitHub review (if enforced)→owner merge SHA. Capture reviewer chat identity/execution provenance, separate roles, risk resolution and accepted caveats. Export short-lived GitHub artifacts before expiry to approved evidence storage; U-09 governs retention duration and custody. **Independent specialist review, accurate evidence, current-head testing, MASTER final programme acceptance and compliance with actually applicable GitHub gates are non-waivable.**

## Review checklist and evidence gates

## 6. Security, tests and architecture review checklists

### 6.1 Architecture checklist

- [ ] Source imports obey inward dependency direction; domain/application contracts have no infrastructure/Next.js/Kysely/Supabase/PostgreSQL imports.
- [ ] Runtime call sequence distinguished from source imports; existing W0-03 UnitOfWork contract preserved.
- [ ] One canonical write owner per fact; ERP official stock and FacilityOS operational physical truth separated.
- [ ] Domain invariants outside React/HTTP adapters; no generic business-rule-free direct CRUD escape.
- [ ] Transactions, outbox, concurrency, retry/idempotency and external failure/compensation appropriate.
- [ ] API versions/migrations/ADR, legacy impact and cutover handled without R1 restructuring.

### 6.2 Security checklist

- [ ] Server-trusted actor identity; no client role/capability/scope granting authority.
- [ ] W0-07 server-side scoped authorization and default deny; SUPERUSER never bypasses explicit policy or SoD.
- [ ] W0-08 RLS, FORCE RLS and non-owner/NOBYPASSRLS runtime; direct SQL and pooling negative tests.
- [ ] Migration-function ownership, SECURITY DEFINER fixed search paths/EXECUTE grants, privilege escalation and role-membership checks.
- [ ] Secrets excluded from browser/logs/commits, fail-closed privilege behaviour, controlled public errors.
- [ ] Human dual approval, hold/release and irreversible evidence behaviour negative-tested when applicable.

### 6.3 Testing checklist

- [ ] AC-ID-to-test-to-evidence coverage table complete; tests validate domain invariants, not just counts.
- [ ] Unit, service/adapter contract, database integration and relevant negative/security cases.
- [ ] Fresh migration and upgrades, generated-type/drift/fingerprint, security/role behaviour.
- [ ] ERP API retry/idempotency, partial failure, duplicate prevention and reconciliation when relevant.
- [ ] Inventory reject/hold/return, shortage, count exception, same-human approval denial, post-failure truth.
- [ ] Existing W0-01–W0-08 regression coverage reachable, legacy Frappe Python/23 DocType structural checks preserved.
- [ ] UI/E2E/UAT requirements stated; synthetic/demo data never misrepresented as production verification.

### 6.4 Code-review checklist

- [ ] Scope/design/base SHA matches approved issue and implementation plan.
- [ ] No unrelated mass formatting, dependency, architecture or legacy deletion changes.
- [ ] Types, errors, input validation, pagination/query allowlisting, logging and config safe.
- [ ] DB schema, transactions, concurrency, idempotency and security boundaries are correct.
- [ ] Documentation, test evidence, review signatures and current HEAD are consistent.

### Specific evidence that must survive tool-link expiry

- Actual source HEAD SHA and base SHA; tested synthetic merge-ref full SHA and parents.
- Complete changed-file/patch manifest; exact source file paths, test coverage and AC IDs inspected by reviewer.
- Workflow name, GitHub Actions run/job IDs, status and final terminal conclusions; artifacts and test outcomes.
- Reviewer chat/session identity, separation basis, specialization, source access and reasoned verdict.
- Conflicting specialist findings, owner/MASTER adjudication, new-HEAD re-review outcomes.
- Actual verified native GitHub-review requirement `REQUIRED / NOT REQUIRED / UNVERIFIED`; separate real approval URL only when enforced.
- MASTER final programme PR verdict and SHA; repository-owner merger identity and merge commit, recorded **after** merge.
- Never represent an AI technical report as native GitHub `APPROVE`; do not infer approval from a green CI run.

Use [review evidence record template](../templates/review-evidence.md); retain durable evidence index with approved custodian/retention policy U-09.

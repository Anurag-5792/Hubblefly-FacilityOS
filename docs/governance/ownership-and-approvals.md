# R1-08 — Ownership, RACI and Approval Policy

**Programme:** Hubblefly FacilityOS & ERPNext Program  
**Package:** R1-08 — Ownership and reviewer prerequisites, MASTER-approved Option B.  
**Source:** MASTER-approved R1 SDLC Governance Design v1.2, 8 October 2026; historic v1.1 technical provenance.  
**Baseline:** S_BOOT `46d2d74c8744ac7d4949604cdd3b7a0466d22e37`.  
**Status:** Documentation implementation awaiting R1-09 independent review and MASTER exact-HEAD acceptance. No CODEOWNERS/GitHub configuration authorisation.

## 9. R1-08 Option B, CODEOWNERS and responsibility model

**MASTER decided Option B.** R1-08 must deliver an ownership/responsibility policy and a factually verified prerequisite register; it does **not** create `.github/CODEOWNERS`, invite collaborators or enable enforcement. R2 owns real CODEOWNERS configuration, rulesets, required-review policy, branch-protection verification and merge enforcement. Unverified GitHub identities do not block completion of an honest R1-08 *policy artifact*, but do block any merge whose verified GitHub rules require an unavailable independent approving human.

**Responsibility/approval distinction:** implementing chat = implementation and self-tests; independent specialist ChatGPT chats = read-only actual-code technical review, current-HEAD findings; domain/architecture/security/ERP reviewers = appropriate specialist expertise; 00 — MASTER = final programme PR decision; eligible human GitHub account = native GitHub approval *only when enforced*; repository owner = actual GitHub merge after MASTER approval and applicable platform gates; R2 = configuration/enforcement owner. No one may invent the identity, independence or approval status of another role.

**GitHub account prerequisites (R1-08 register):** verify current repository ownership, candidate human GitHub handles, invitation acceptance, separate identity, actual write/review permissions when needed, branch restrictions and available admin evidence. On a personal repository, independent human CODEOWNERS (if later selected) must be individually eligible collaborators; an organisation team requires a real visible organisation team with appropriate repository access. `@Anurag-5792` can illustrate syntax but not independence for a PR it authors. A team/handle must never be fabricated.

Illustrative **syntax only**, never a committed R1 CODEOWNERS file:

```gitignore
# Global fallback — syntax demonstration only; not independent for owner-authored changes
* @Anurag-5792
# Existing repository directories
/docs/adr/ @Anurag-5792
/supabase/migrations/ @Anurag-5792
/frappe_app/ @Anurag-5792
```

GitHub CODEOWNERS is **not** a technical reviewer and is not sufficient to replace MASTER approval. `#` introduces comments; `/#` is not a valid comment. Future architecture reconciliation toward already-approved `src/modules/` belongs to R4, not to this ownership policy.

## Responsibility/decision matrix

| Role | Programme responsibility | Independence / operational authority |
|---|---|---|
| Implementing Chat 15 | Authorise-bounded docs changes, issue/AC trace, local and GitHub CI evidence | No independent technical approval of its own implementation |
| Independent Chat 08 | Separate actual GitHub source/PR diff/test/architecture/security inspection at exact HEAD; APPROVE / REQUEST CHANGES / BLOCKED | Cannot merge, cannot act as native GitHub human reviewer |
| Other assigned specialist reviewers | Domain, Inventory, ERPNext, database, auth/RLS, release where implicated | Separately assigned reviewer role and source-inspection evidence |
| 00 — MASTER | Final programme design/implementation/PR acceptance and release authority | Reviews evidence independently, explicitly accepts exact HEAD |
| Eligible native GitHub reviewing human | Actual GitHub APPROVE **only if verified enforced** | Separate eligible account/write access; self approval prohibited |
| Repository owner / merge operator | Only a verified-platform-compliant merge after MASTER's final exact-HEAD acceptance | Records actual resulting integration SHA, never invents approvals |
| R2 owner | CODEOWNERS, branch rulesets and GitHub review/merge enforcement | No R2 mutation under R1 authorisation |
| QA/platform/security/ERP release roles | Specialist verification and separately approved deployment | No implicit production authority |

## R1-08 completion versus future R2 enforcement

R1-08 is **mandatory Option B** and may close only with this policy and the [reviewer-prerequisite register](reviewer-prerequisites.md). No `.github/CODEOWNERS` or fictitious GitHub accounts are created. R2 separately verifies real human reviewer eligibility and configures branch rulesets, protection, CODEOWNERS and merge enforcement if authorised.

An AI specialist report is programme technical evidence, **not** a GitHub-native APPROVE. If native GitHub approval is verified required, a real separate eligible human must submit it; if verified not required, evidence-backed NOT REQUIRED is recorded; if unknown, BLOCKED for merge. Independent specialist AI review and MASTER's final programme PR acceptance are always required.

If two required specialists disagree or one returns REQUEST CHANGES/BLOCKED, acceptance stops until adjudication and any required current-HEAD re-review. Repository owner cannot merge before MASTER final acceptance and verified platform gates.

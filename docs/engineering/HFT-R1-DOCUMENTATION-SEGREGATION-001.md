# HFT-R1-DOCUMENTATION-SEGREGATION-001 — Two-part documentation policy

**Authority:** HFT MASTER V2 / owner, 29 October 2026.  
**Status:** Binding documentation and engineering acceptance requirement.  
**Release state:** HFT R1 production NO-GO; original 26 October 2026 live-use target missed and not replaced.

## 1. Two distinct documentation deliverables

**Part A — INTERNAL ENGINEERING DOCUMENTATION (restricted).** Complete source-level traceability belongs here, including source rights and provenance, precise original and adapted files, versions and checksums, code review, architecture, schemas, API contracts, modifications, dependencies, security findings, test evidence, build and recovery details, maintenance history and accountable approvers. Preserve the original source snapshot or a protected immutable locator where permitted. Record all material reuse, not merely copied files. Maintain a per-module internal dossier alongside the engineering work, not after release.

**Part B — HANDOVER DOCUMENTATION (recipient-facing; no source).** Provide product descriptions, approved functionality and limitations, installation/administration procedures, configuration, access roles, user guides, business workflows, image/Item Master operating procedures, operation and support, backup and recovery instructions, release/acceptance records and troubleshooting as appropriate to the recipient. Do **not** include original or adapted source code, donor repository or developer account details, source file paths, commit hashes, source-to-target diffs, private architectural secrets, raw security findings or build-system internals. An explicitly separately contracted software delivery is governed outside the handover documentation, not embedded in it.

| Property | Internal engineering | Recipient handover |
| --- | --- | --- |
| Audience | Qualified HFT engineers, security and QA, controlled reviewers | Authorized HFT operational/customer recipients |
| Source records | Required, exact, versioned and rights-checked | Excluded |
| Design/test traceability | Full developer evidence, failures and resolutions | Operational acceptance summary and supported limits only |
| Security material | Restricted architecture, reviewed issues and remediation evidence; no live secrets in documents | Supported roles, operational safeguards and procedures; no exploit or key custody specifics |
| Data | Approved synthetic evidence and controlled pointers only | Instructions and blank templates; no unauthorized employee or DD information |
| Document lifecycle | Changes with each adaptation and every relevant source revision | Prepared for approved releases, independently reviewed, versioned and handed over |

## 2. Access and storage boundary

**Important current state:** The existing HFT FacilityOS GitHub repository is PUBLIC. A folder named `internal` or `engineering` inside that repository does not restrict access. Existing `docs/engineering/` and `docs/adr/` are engineering source records, not a secure confidential vault. They may retain nonconfidential engineering control information, but **must not receive copies of private DD source, private vulnerability specifics, personal records, proprietary source archives or credentials**.

Detailed internal dossiers and source snapshots must be held only in an approved restricted repository or document system with company-authorized access, history, backups and disclosure controls. Until that restricted destination is confirmed, mark any confidential dossier PENDING STORAGE and do not publish its content to the public HFT repository. A public nonconfidential record may link by controlled evidence ID without disclosing restricted content or access tokens.

This policy does not authorize a repository visibility change, cross-company data access, code transfer, source-ownership transfer or any additional release permission.

## 3. Mandatory internal dossier for every reuse decision

Use the controlled template `docs/engineering/templates/HFT-R1-REUSE-DOSSIER-TEMPLATE.md` **as a schema only**. Fill in source names, hashes, copies, license/rights records, security review and findings in restricted internal storage. The public PR may contain a sanitized summary with a dossier identifier and an honest acceptance state.

Minimum internal dossier: requirement and owning legal entity; original repository and exact immutable source snapshot; source file inventory and licenses/rights; copy/adapt/reject decisions; source-to-HFT code map and architectural differences; HFT-owned data and zero DD-runtime-connection boundary; threat model and security remediation; API/schema/version and migration impacts; unit/DB/negative/concurrent/build/browser tests with actual run results; configuration and operational support impact; QA/security/business sign-offs; license notices; ownership and future maintenance history.

For inventory, HRMS and attendance reuse, never carry a second stock ledger, a shared DD database, a DD runtime API, DD employee data or foreign login credentials into HFT. HFT implementation and review are independent.

## 4. Handover-only publishing contract

The sole handover document content root in this repository is **`docs/handover/`**. Handover packaging is allowlist-based and must exclude all other repository paths, regardless of filename. Do not copy the internal dossiers, engineering registers, raw source or private reports into this folder.

The publication pipeline must:

1. Build handover output using only the approved handover content root and explicitly approved external operational attachments.
2. Validate all included documents using the handover source-reference checker and independent human disclosure review. Pattern checks are a backstop, not a privacy or classification guarantee.
3. Verify that feature steps accurately reflect the qualified release, with version-specific functionality, tested operational actions and known limitations. Draft features may be described only as **NOT YET AVAILABLE**, never as qualified functionality.
4. Confirm there are no private company, workforce, supplier, account, source, vulnerability or credential disclosures.
5. Record the document revision, product release, recipient, reviewer approvals and handed-over artifacts in the restricted internal release record.

**Release approval remains separate:** documentation quality cannot authorize a migration, live stock posting, source handover, workstation installation or deployment. HFT R1 remains production NO-GO until all established gates pass.

# HF16-V7-077 — Retained Masters APPLY / First-Scope Bootstrap Review Handoff

Directive: `HFT-R1-MASTER-V4-DELIVERY-QUALITY-077`  
Engineering state: **SOURCE CANDIDATES ONLY — STOP GUARDED — NOT INSTALLED**

## Source candidates (independent review required)

1. `db/security/HFT-R1-P3-NONEMPLOYEE-APPLY-NONEXECUTABLE.sql`: separate, domain-separated `ITEM`, `SUPPLIER`, `WAREHOUSE`, and `LOCATION` decision protocol; governed request, human, policy, revision, nonce, audit and P3 owner controls. Does **not** grant an executable runtime path.
2. `lib/hft/masters/p3-nonemployee-decision-proofs.ts`: strict 13-field decision and separate nine-field proof issuance; not connected to a runtime endpoint and issues nothing without verified in-process operator.
3. `db/security/HFT-R1-P3-FIRST-SCOPE-CORPORATE-BOOTSTRAP-NONEXECUTABLE.sql`: separate first entity/site/warehouse corporate order/receipt and HMAC source contract. Independent original corporate document, two genuine people, signer and enrollment proof required before **any** order may exist. The candidate does not enroll any facts or keys.
4. `tests/unit/hft-p3-nonemployee-decision-contract.test.ts` and `tests/test_p3_nonemployee_apply_077.py`: synthetic contract checks; not PostgreSQL acceptance.

Existing employee decision/apply function, protected R77 stock SQL and canonical `0001`–`0006` remain unchanged.

## Hard release boundaries and known gaps

- **No independent installer acceptance** for either new SQL candidate, no database parser/catalog acceptance, no effective P3 role grant, no new signer key enrollment and no authenticated browser execution.
- **Warehouse CREATE is not supported by the current P3 change scope.** It binds `recordId===warehouseId`, while SUBMIT requires that warehouse already active; the candidate **denies** new Warehouse CREATE. Independent corporate bootstrap can establish the **first** approved scope only. A subsequent new Warehouse requires a separately accepted anchor/target contract and approvals.
- **Location ACTIVATE is deliberately blocked** until independently certified P0 physical hierarchy, rack/level/position/bin authority, parent and floor evidence can be verified in the protected database. A stored Location row is not a certified stock bin.
- **Item ACTIVATE requires** independently governed product-version catalog and approved PRIMARY photographs, including a complete version census. Neither the generic Item change request nor a photo filename activates it.
- **Stock-linked structural changes remain restrictive.** Existing account, GRN and serial history are reason to deny unsafe Item/Warehouse/Location changes; additional independent QA must prove all relevant source/custody edges before activation.
- **A policy requiring a third CHECKER currently denies** pending a separately qualified checker proof; maker and approver may never be the same human under multiple usernames.
- **The existing P3 runtime catalog still allows exactly three entrypoints**: SUBMIT, READ, Employee APPLY. The fourth protected APPLY function is **not** added to runtime allowlists or middleware. That expansion requires exact Chat 10 qualification and independent installer/role/postflight.
- **Production stock APIs and R77 are unaffected.** No stock-account, stock-entry, opening stock or RECEIVE invocation has been enabled.

## Review assignments

**Chat 10 V2 Security:** Examine SECURITY DEFINER ownership, issuer role, exact grants, append-only state, MAC domain separation, session identity, HMAC key custody, query privilege leaks and effective ACL under real PostgreSQL. Reject broad runtime DML or owner membership.

**Chat 11 V2 Governance:** Verify real first-entity/source/bootstrap approval and two independent corporate people; nonemployee qualified maker/approver scopes; mandatory-checker policy; Item/version photo approvals; warehouse and physical location certification contracts. No synthetic original evidence.

**Chat 17 QA:** Execute independent PostgreSQL 18.6 CREATE/EDIT/ACTIVATE/DEACTIVATE positive/negative tests, duplicate/revision/race/replay, parent-cycle and stock-history holds, immutable audit/nonce and role denials. A parser/static test alone is not acceptance.

**Chat 13 V2 Infrastructure:** No new Neon retained resource currently created by Chat 16. Bind the separately authorized retained resource, exact P3 executable installer hash, TLS, roles, backup, separate restore, application endpoint and retained-state persistence. Never use the existing archived `production` or `vercel-dev` branches as targets.

**MASTER release policy:** Owner entry is GO only for an explicitly accepted, deployed capability proven with an actual signed session, real PostgreSQL database, save, fresh read, edit, reread and restart persistence. Employee APPLY needs independent person approval. Unapproved nonemployee proposals are not usable masters.

## Parallel R77 installer review candidate — separate stream

Chat 13 V2 review branch `review/hf13-v2-077-r77-installer-candidate`, commit
`f1c1dfa730019adc564cc2f72cb571a54453bc5a`.
Manifest `review-candidates/hf13-v2-077/manifest.EXECUTION-REVIEW.json`
lists independently reviewable stage 50/60/70/80 SQL candidates, **unreviewed and unexecuted**.
Reviewers must use the exact SHA-256 values in the manifest, not substitute Chat 16 Masters files.
Chat 10 must review privileged installation and Chat 17 actual R77 acceptance before any independent execution approval.

## Actual results at review handoff

Neon inventory: PostgreSQL 18 project `red-silence-36758131`, only archived
`production` and `vercel-dev` branches retrieved. No new retained
Masters project or R77 disposable resource was verified.

Vercel query for Hubblefly projects returned an Investor Relations project,
not a verifiable deployed FacilityOS Masters application.

No retained Masters deployment URL, PostgreSQL P3 installation, authenticated
real database save/readback, restart persistence or backup/restore result is proven.
None may be claimed GO from source-only CI.

**Gate R HOLD · Gate A HOLD · Production NO-GO.**

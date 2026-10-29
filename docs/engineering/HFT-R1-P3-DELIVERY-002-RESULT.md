# HFT-R1-P3-DELIVERY-002-RESULT — Employee Master source engineering

**Directive:** HFT-R1-MASTER-P3-DELIVERY-002  
**Execution mode:** Authorized NONPRODUCTION SOURCE ONLY  
**Starting source:** 7a4bc733853957a89cd84d2021a6275a2becabbb  
**Engineering source checkpoint:** ac5330cc6352b06396f776357f4d3b49c1276ad9 (final register commit follows)  
**Branch:** engineering/hft-r1-stores-foundation, PR #11 Draft and unmerged  
**Production:** NO-GO.

## Delivered Employee source — NOT operationally accepted

1. Existing '/stores/masters' source now links '/stores/masters/approvals'. Reviewer queue and decision screen use the same verified signed session, no fake role/account.
2. Existing POST '/api/hft/masters' signs a READ-specific proof for LIST/GET/REQUESTS/REVIEW_QUEUE. Real DB function 'hft.p3_read_masters_v1' verifies the signed scope/active P2 session, persisted warehouse permission and qualified human for reviewer queue. Runtime direct master/view/grant SELECT is withdrawn in the SQL candidate. A stolen database login alone cannot construct a valid read proof without the separately held signer key.
3. New '/api/hft/masters/decision' invokes the reviewed single protected candidate 'hft.p3_decide_apply_employee_v1'. Existing P2 registered human IDs and revocation facts distinguish preparer from approver even across login aliases. Missing independent approved action policy/qualified human/valid signed proof means reject.
4. CREATE request stays PENDING_APPROVAL, then approved Employee record is INSERTed INACTIVE (version 1). EDIT preserves employee/site identity and active status, increments exact version. ACTIVATE increments version only after independent approval. DEACTIVATE increments version but never deletes history/custody and blocks if custody outstanding. DENIED creates immutable decision evidence but no Employee mutation.
5. Protected Employee writer checks current source fingerprint/expected version, policy epoch and issuer, serializable master/scope gates, then commits employee row, P1 employee_revision, P3 master_revision, original decision, nonce, APPROVED/DENIED and APPLIED audit facts together. DB function checks exact presence of revision/audit before RETURN.
6. 'db/security/HFT-R1-P3-MASTERS-REVIEW.sql' remains NONEXECUTABLE SOURCE, outside manifest. No migration 0007, extension, keys, roles, credentials, real DML or deployment.

## Incomplete governance and security gates

- P2 human registration/qualified enrollment, P3 policies, action-specific approvers and signer keys require separate governance/DB authorization. No real human, policy, key or session was provisioned.
- If an action policy mandates a CHECKER, it is denied until an independently signed checker evidence/issuance workflow is qualified. There is no implicit checker waiver or fabricated second person.
- Decision evidence SHA-256 is signed and bound, but the underlying external artifact chain and issuer custody have not been operationally verified. Independent retention/recovery audit remains a release gate.
- 'hft_r1_p3_master_owner' is nonlogin SECURITY DEFINER owner. Shared P3 runtime has no direct master, view, grant, key, sequence or generic helper access in candidate ACL; only three protected functions. Effective privilege tests and adversarial DB read attempts have NOT RUN.
- No authorized isolated PG15+ host/schema, real connection/driver execution, PostgreSQL parser, client login, migration, actual INSERT/UPDATE/transaction/readback or clean browser test has occurred.
- P3 candidate scope assumes separately accepted P2 identities and eligible actors. PR #11 independent exact-revision Chat 10/11/17 review remains outstanding. Source corrections not substitutes for those reviews.

## Test and dependency evidence

**Authored:** Node synthetic cryptographic and persistence tests (including scoped reads, forged actor, independent decision and lost COMMIT); PostgreSQL real-login denial/catalog, two-human CREATE/ACTIVATE, forged proof/self-approval and audit reconstruction SQL sources. All PostgreSQL tests NOT RUN.
**Executed:** 63 read-only source-backed JS assertions against exact GitHub source checkpoint, 63 passed, 0 failed. Connector tool returned success; shell exit code N/A. This is NOT Node unit test, TypeScript build or database qualification.
**Local tool availability:** node --version v22.16.0 exit 0; npm --version 10.9.2 exit 0; tsc --version 5.8.3 exit 0; psql --version exit 127 (not installed). Pinned pg 8.23.1 and @types/pg 8.23.1 in package.json. No package-lock.json, npm install, CI, Next build or clean package install.
**Prohibited operations:** none performed: no real PG SQL, key provisioning, pgcrypto installation, new branch/PR, push force, production posting or live data.

## Delivery register

Original live-use milestone: **26 October 2026 — MISSED**.
New target: **NONE AUTHORIZED**.
Employee Master: source-coded / not independently reviewed / not PostgreSQL qualified / not operational.
Remaining Items, Supplier, Warehouse, Location governance, GRN/QC, Issue, Return, reconciliation: follow after Employee acceptance, same codebase and sole protected stock writer. No demo-only release.

## Review handoff — exact final SHA must be taken from PR after this register commit

- Chat 10: signed read proof, P3 runtime all-relations ACL, keys/session/human and concurrent revocations.
- Chat 17: SQL parser/role grants/serializable behavior, denied/stale revisions, Employee immutable revisions, real-positive/negative tests, lost COMMIT handling, API and browser.
- Chat 11: maker/approver person independence, action policy, denied/blocked, checker-required fail closed, external evidence custody and outstanding custody on deactivation.

**GO/NO-GO:** source review candidate; **PRODUCTION NO-GO**.

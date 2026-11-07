# HFT-R1-P2-COMPLETE-002 — bounded independent source review request

**Primary code revision:** `42a934b32ec6b34848e67097d06e2870c8be7a4b`.
**Repository:** `Anurag-5792/Hubblefly-FacilityOS`. Existing PR #11 DRAFT and unmerged.
**Reviewed P1 baseline:** `a64b29473cdb7bb0b80a419e9e60da341713cd45`.
**Scope:** 16 source additions and the three exact SQL/test corrections. Reuse prior 67-file review and earlier P2 checks; no full rescan or source writes.

**Chat 10 — SECURITY:** Assess exact HMAC length-prefixed fields, independent pgcrypto verifier, active/revoked session, nonce/idempotency, key custody and rotation, DB proof signer abuse, safe function ownership/search_path, global default privilege repeal, effective grants and inheritance, PUBIC/runtime helper access, trusted admin boundary, actor spoofing and protected role login.

**Chat 17 — QA/DB:** Assess original P1 seal integration, single runtime writer vs nonproduction legacy DML adapter, atomic command/entry/outcome/audit/seal, partial ISSUE/RETURN fragment/serial/custody ceilings, source revision triggers, cumulative invoice/GRN checks, lock order and concurrent revocations, SERIALIZABLE and connection cleanup; identify SQL parsing/trigger/privilege errors with exact lines.

**Chat 11 — GOVERNANCE:** Assess immutable approved scope digest distinct from full payload digest, human separation, approval revocation and Hold-policy generations, audit outbox evidence and traceability.

**Needed test evidence:** P2-SEC-T01..T06 as actual restricted-runtime/DBA PostgreSQL negative/positive tests on an approved synthetic disposable DB, never just SQL snippets; current Python 5/5 + Node 6/6 source tests are NOT real DB qualification.

Return separate ACCEPT/REQUEST CHANGES by H1, H2, M1–M4, SEC-01–04; source path+line; real tests NOT RUN; exact code SHA; any required corrections. Only after source acceptance should MASTER authorize a canonical forward 0007 with immutable digest, approved roles/key/pgcrypto prerequisites and separate execution authority.

**No merges, production, company stock, ERPNext posting, KES access or U-09 action. Production NO-GO.**

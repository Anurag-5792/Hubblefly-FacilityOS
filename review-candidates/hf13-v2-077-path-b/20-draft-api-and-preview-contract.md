# HF13 Path B — draft-only DB/API contract (16 November 2026)

**This is a draft intake system, not P3 activation.** Neither this file nor the SQL source grants approval, activation, stock, manufacturing or production authority. All visible records must display **DRAFT — NOT APPROVED**.

## Exact existing resource

Neon `wandering-cake-50222227` / `br-shiny-night-b3qgsj8t` / `hft_r1_retained_masters_np077`; endpoint `ep-hidden-fire-b324s21q.c-4.ap-southeast-1.aws.neon.tech`, PG `180007`. No new Neon project. Existing Vercel team `team_GZjiGpLO7uRSKAEfW18JkCWS`, project `prj_6KRIqjoTbLlVMUWOmWIid56U4BAf`; Preview only, no production mutation.

The source installer `10-hft-draft077-install.EXECUTABLE-CANDIDATE.sql` creates ONLY schema `hft_draft077`, provisional scope, actor grants/revocations, draft HMAC key/revocation, one-use write nonces, records and immutable revision history. It creates NOLOGIN `hft_draft077_owner`, credentialless `hft_draft077_api_login` and credentialless `hft_draft077_enroller_login`. No operational `hft` objects, P3 approval functions or stock accounts are altered.

**Technical installation is separately approval-gated.** It requires exact-sha DBA permission for role/schema/extension/DDL/grants; a genuine issuer and draft HMAC key enrolled separately in managed secrets; a provisional scope and authentic user grant enrolled by an authorized administrator; external TLS hostname/CA proof; and a recoverable encrypted baseline with independent restore evidence. The original STOP-guarded companion is not to be installed. No credential, scope, real person or key is generated in source.

## Backend API (Chat 16 integration)

The independently authorized app server must validate the genuine Ed25519 `__Host-hft_session` cookie (issuer, audience, subject, jti, expiry), same-origin request and scope grant before generating the draft DB HMAC. It must NEVER accept a caller-provided identity header or trust browser-supplied actor. Use only the direct Neon host and exact unprivileged `hft_draft077_api_login`, with PostgreSQL authenticated TLS; P3/R77/stock routes remain disabled.

**SQL-only allowlist:**
- `SELECT hft_draft077.save_draft_v1($1::text,$2::jsonb)` in `BEGIN ISOLATION LEVEL SERIALIZABLE`; COMMIT.
- `SELECT hft_draft077.read_drafts_v1($1::text,$2::jsonb)` in a fresh `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`.

$1 is the **exact UTF-8 serialized JSON string** signed by the server and forwarded unchanged to SQL. $2 is a nine-string proof object: `proofVersion,actorSubject,sessionId,payloadSha256,issuedAt,expiresAt,nonce,keyVersion,macSha256`. HMAC-SHA-256 uses an independently enrolled draft-only key over the 4-byte big-endian length-prefixed UTF-8 strings `["HFT-DRAFT077-HMAC-V1", "WRITE" or "READ", actorSubject, sessionId, SHA256(bodyText), issuedAt, expiresAt, nonce, keyVersion]`. Proof expiry at most 60 seconds; write nonces are consumed atomically and cannot replay. This HMAC must only be minted after verified human sign-in. The browser never sees the HMAC key or database credential.

**CREATE/EDIT body** has exactly eight keys:
```json
{"operation":"CREATE","scopeId":"<enrolled-provisional-scope-uuid>","kind":"EMPLOYEE","recordKey":"<employee-code>","expectedVersion":"0","values":{"fullName":"<real name>","department":"<department>","designation":"<designation>"},"requestId":"<fresh-request-uuid>","source":"MANUAL"}
```
EDIT uses `operation=EDIT` and the original `recordKey` with the committed `expectedVersion`. Kinds: `LEGAL_ENTITY,SITE,EMPLOYEE,ITEM,SUPPLIER,WAREHOUSE,LOCATION`; source: `MANUAL,CSV,XLSX`. Unique `(scopeId,kind,recordKey)` prevents duplicates; optimistic revision checks prevent stale edits; every accepted revision is immutable. No first-active-warehouse P3 bootstrap is needed for this provisional draft scope.

**GET/LIST/HISTORY body** has exactly seven string keys:
```json
{"intent":"GET","scopeId":"<same-scope-uuid>","kind":"EMPLOYEE","recordKey":"<employee-code>","search":"","limit":"1","offset":"0"}
```
LIST can use `kind=ALL`; page with limit <=100 and offset <=100000 for complete database export. A genuine CREATE/EDIT requires a fresh signed GET from a separate read-only DB transaction after COMMIT. On ambiguous COMMIT, never auto-retry: reconcile the original identity using a fresh read.

## CSV/XLSX reuse (no new parser)

Chat 16 should reuse `lib/hft/masters/p3-csv-transfer.ts` and `p3-xlsx-transfer.ts` only for the existing bounded CSV/XLSX encoding, decoding, preview and spreadsheet safety. Remove P3-specific active-warehouse and P3 activation assumptions in the **new** draft adapter. Add draft LEGAL_ENTITY/SITE formats. Per-row import must map validated rows to one signed draft CREATE request/transaction, show saved/rejected/invalid rows; export MUST page across actual DB GET/LIST results, not the local preview. Blank/fictional sample CSV/XLSX and required/optional/temporary field markers remain Chat 16 UI concerns.

## First real record acceptance

One actual authorized user signs in, creates Employee draft v1, independently rereads it, edits to v2, independently rereads and confirms both immutable revisions. Then confirm duplicate CREATE denial, second unauthorized user's denial, no direct runtime table SELECT/INSERT, valid/invalid CSV and XLSX batch outcomes, actual stored-row CSV/XLSX export, logout/login and app restart persistence. All records remain **DRAFT — NOT APPROVED**. No auto-P3 import, no production or stock access.

**Install/credential/Preview execution status:** not authorized by the earlier blank-project creation; must be admitted as a single exact-scope Path B technical decision.

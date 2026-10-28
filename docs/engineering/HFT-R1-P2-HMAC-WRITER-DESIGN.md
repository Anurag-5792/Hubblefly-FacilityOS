# HFT-R1-P2-COMPLETE-002 — HMAC protected writer source design

**Authority:** HFT-R1-MASTER-P2-COMPLETE-002. **Scope:** NONPRODUCTION SOURCE ONLY.
**Production:** NO-GO. **Database execution:** NOT AUTHORIZED / NOT RUN.
**Canonical executable migration sequence:** 0001–0006, unchanged. Pending review,
`db/security/HFT-R1-P2-ONE-WRITER-REVIEW.sql` is explicitly **NOT AN EXECUTABLE
MIGRATION** and has no manifest entry. The earlier security proposals remain
historical inputs, not automatically promoted. No extension, role or key is created
by this ChatGPT source exercise.

## One actor-proof protocol

`lib/hft/security/posting-invocation-proof.ts` is the **one** deterministic byte
contract. It produces `payloadSha256` by hashing the 25 fixed-order `PAYLOAD_FIELDS`
as UTF-8 fields, each prefixed with a four-byte unsigned **big-endian length**.
It never signs `JSON.stringify`/JSONB rendering. Proof HMAC-SHA-256 signs another
19 fixed-order length-prefixed fields including domain `HFT-R1-P2-HMAC-SHA256-V1`,
authenticated subject and session, exact command ID/idempotency/kind, payload hash,
source revision, entity/site/warehouse, source document and line, fragment and
quantity, issuedAt/expiry, 192-bit nonce and key version. All numeric values are
canonical decimal **strings**; typed JSON numbers and extra properties are denied.
Expiry is <= 60 seconds, server clock skew at most 30 seconds. The separately
provisioned signer must be accessible only to the trusted server boundary.

`posting-proof-issuer.ts` calls the existing verified Ed25519 session adapter
and only signs after the immutable verified operator scope passes. No forwarded
actor string or app-provided `SET LOCAL` value can issue a proof. PostgreSQL independently
recomputes the payload SHA-256 and HMAC via explicitly schema-qualified
`hft_crypto.digest` and `hft_crypto.hmac` from the PostgreSQL 15+ **pgcrypto** extension.
It checks expiry, active key version, revoked key status and `posting_session`
row, then inserts a unique `(key_version, nonce)` fact. Reused proof/nonce is rejected.
A fresh, separately authenticated proof may return an exact idempotent persisted
result without posting a second movement; uncertain COMMIT uses a new-connection
readback, **never** an automatic posting retry.

The included synthetic public fixture `tests/fixtures/hft-p2-invocation-v1.synthetic.json`
contains deliberately unusable TEST-ONLY key text. Independent Python and Node
checks reproduce identical payload digests and MACs. **PostgreSQL proof verification
has NOT executed**; those vectors are necessary, not sufficient, evidence.

## Key custody, replay and redaction

A separately controlled DBA/key authority must install pgcrypto in a locked
`hft_crypto` schema, create required NOLOGIN roles, provision the app signing key
via an approved secret service and copy active version material into an isolated,
restricted `hft_secret.invocation_key`. This source contains no real credentials.
`hft_secret` is never granted to application runtime or audit reader. Only a
non-login, nonsuperuser `hft_r1_posting_owner` may read it through reviewed
`SECURITY DEFINER` code. Version rotation requires overlap of approved keys for
outstanding short proofs, explicit revocation, and immutable nonce history for
at least the maximum proof/recovery horizon. Changes to session/role/key/grant
must be governed and audited. Never log the key, proof MAC, cookie, bearer token
or raw encrypted material. Mask correlation details in SQL error/output logs.
DB owners/DBAs remain trusted administrators; security does not claim to resist
an adversarial table/extension owner. A PostgreSQL HMAC bytea equality comparison
requires Chat 10 timing-side-channel consideration before activation.

## Database privileges and writer

The candidate requires `hft_r1_posting_owner` (NOLOGIN, no CREATEROLE,
non-superuser), `hft_r1_app_runtime` (NOLOGIN group), and `hft_r1_audit_verify`
(NOLOGIN). Runtime login must be an approved nonowner member of the runtime group,
never a member of migration/function owner groups. The migration owner remains
`hft_engineering`, separate. Function owner is granted only required protected
ledger DML, never table ownership. Runtime has **no protected table DML**, schema
CREATE, trigger-control or helper function EXECUTE. The single
`hft.post_stock_command_protected_v1(jsonb,jsonb)` is the only runtime EXECUTE
allowance. It uses `SECURITY DEFINER SET search_path=pg_catalog,pg_temp` and
schema-qualified object references. `hft_secret` is never exposed to runtime.
Global `ALTER DEFAULT PRIVILEGES FOR ROLE ... REVOKE EXECUTE ON FUNCTIONS FROM
PUBLIC` applies to the **actual object-creating roles**. Per-schema REVOKE alone
is ineffective against the global PUBLIC default. Existing helper/function PUBLIC
EXECUTE and runtime EXECUTE are independently revoked. Test catalog grants,
role membership/inheritance, function owner, public/default grants, schema
USAGE/CREATE, function-level EXECUTE, protected table DML, and real attempts
under **actual restricted runtime credentials** (not just SET ROLE simulation).

## One canonical transaction and partial fragments

`lib/hft/persistence/protected-stock-posting.ts` sends exactly one database
function invocation in an isolated serializable transaction; it does not
reimplement stock ledger writes. The legacy per-table TypeScript adapter is
nonproduction synthetic/test-only and MUST NOT be a runtime route. There is
no new public HTTP API or production activation. The one SQL writer obtains
locks in this source-defined order:

1. Scope gate (existing `HFT:GATE` scope lock).
2. Stock identity (`HFT:STOCK` legal entity/warehouse/item/lot/serial).
3. Persisted source, approval, current Holds/policy and employee validity.
4. Account rows in deterministic UUID order, then serial/custody records.
5. Unique command, immutable fragment, two exact stock entries, document
   counters, immutable outcome/audit/outbox and original P1 seal in one transaction.

Changes to actor-grants/Holds and approval revocations serialize on the same
scope gate and advance the policy generation. A newly-effective prohibition
before posting is rejected. A posting that serializes and commits first may
precede the governance change; it does not silently bypass a committed Hold.
`40001`/`40P01` are rollback conditions, not invitations for blind automatic
retry. Failed rollback or uncertain COMMIT discards the connection and requires
an explicitly authorized fresh readback. No session variable is an identity token.

Each partial ISSUE/RETURN has a unique `fragmentId`, source line, command ID,
approval digest, revision and quantity; the SQL candidate drops the old
`(entity,document,line)` uniqueness only once and adds immutable
`(entity,document,line,fragment)` uniqueness, while P1’s GRN receipt uniqueness
stays in force. The writer locks the parent line and enforces cumulative ceilings.
Return additionally locks the original ISSUE fragment custody and checks remaining
employee custody; serial-controlled units remain indivisible. A separate source
revision tracks protected field edits while legitimate posting counters advance.
Migrations 0001–0006 and the accepted P1 H3–H5 seals are never rewritten.

## Known remaining gates and reviewer decisions

This ~800-line candidate is **UNCOMPILED, UNEXECUTED PostgreSQL SOURCE** and has
not passed PostgreSQL type/trigger/concurrency checks. Independent Chat 10 and
Chat 17 must validate SQL semantics, audit owner/grant chains, HMAC agreement,
source revision bump triggers, proof/replay/rollback behavior and nested P1
seal lock order. Chat 11 must validate approval/segregation and policy audit.
The SQL cannot become a canonical executable 0007 until a source-reviewed
checksum, role/extension/key dependency contract, explicit MASTER signoff and
independent DBA acceptance exist. In particular, this plan cannot activate
without secure DB-side pgcrypto verification and separately approved key custody.

The read-only/protected-role/actor spoof/Hold race/deadlock/seal cases
P2-SEC-T01 through T06 are authored under `tests/pg/`, but have **NOT RUN**.
The full application dependency lock, install/build, KES/PostgreSQL acceptance,
production identity/session lifecycle, real backfill, approved partial flow UI,
backup/restore and human release authority remain separate workstreams.

**Next single security-design prerequisite:** Chat 10 + designated database
owner accept the exact HMAC/pgcrypto key/role custody contract and candidate
function-owner/ACL model. No production GO or database migration is implied.

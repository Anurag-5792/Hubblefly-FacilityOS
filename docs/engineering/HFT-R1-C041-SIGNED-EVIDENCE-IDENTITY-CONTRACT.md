# C041 — Signed PostgreSQL evidence and Ed25519 public-key identity correction

Directive: `HFT-R1-MASTER-V3-C039-EVIDENCE-IDENTITY-CORRECT-041`  
Date: 4 November 2026  
Starting frozen HEAD: `3535218f1bfafedc29e8dcc7c4ace7f8ea3ad88f`  
Scope: authorized **nonproduction source engineering only**. Neon, PostgreSQL,
branch, roles, backups, restore, migration, production and PR merge remain HOLD.

## 1. C041-01: exact original-transport versus signed-envelope identity

The existing signed `HFT_R1_BOOTSTRAP019_PREDECESSOR_COLLECTION_V1`
artifact and `HFT_R1_BOOTSTRAP019_HISTORY_MANIFEST_V1` schemas remain
unchanged. No new history scheme, reference or trust authority is introduced.

`tools/hft_c039_history.py::verify_collection()` loads the original
predecessor artifact as byte-exact SHA-256 verified canonical JSON and
extracts the original PostgreSQL single-snapshot JSONL transport.

That original JSONL is replayed through the **existing actual**
`hft_c028_catalog.collect(..., include_phase=True, evidence_out=...,
branch_id=authorized_target)` implementation. The same 30-category
catalog, full role/member/grantor OID integrity checks, phase and revision
verification and one-session `REPEATABLE READ READ ONLY` protocol are
preserved. The replay does not connect to PostgreSQL.

The verified collector, not the signed claimant, independently derives:

- Exact collector source SHA-256 and C037 cluster-local evidence schema.
- Authorized branch and database, session and current database user.
- PostgreSQL server version, backend process ID and snapshot identity
  from the original packet identities.
- Original JSONL transport SHA-256.
- Verified raw role/grant OID SHA-256 and portable semantic stage SHA-256.
- Collected phase-state and canonical revision hashes.

The verifier reconstructs the **entire** signed `collection_envelope`
from `evidence_out` and compares its canonical bytes against the claimed
signed envelope. Every required field must match. The `collection_id` is
then computed from the reconstructed envelope, **not** the claimant-supplied
values. A changed signed `backend_pid` or `snapshot` cannot be accepted
by recomputing and signing a fabricated `collection_id`.

Existing canonical-JSON, predecessor-chain, stage, role-OID continuity,
manifest/collector source, actual detached signature and Gate A V3
bindings remain required. No historical source verifier can issue Gate A
or enroll corporate credentials.

## 2. C041-02: Ed25519 cryptographic public-key identity

The historical verifier retains the two independently pinned, corporate
trust records from the accepted Recovery V2 architecture.

Before accepting either witness or collector identity, the verifier:

1. Requires a single well-formed PEM PUBLIC KEY block for each pinned key.
2. Parses each using the existing OpenSSL public-key implementation:
   `openssl pkey -pubin -inform PEM -outform DER`.
3. Requires the exact RFC 8410 Ed25519 SubjectPublicKeyInfo structure:
   `302a300506032b6570032100` followed by 32 raw public-key bytes
   (44 DER bytes overall).
4. Compares SHA-256 of canonical DER SPKI bytes as the key identity.
5. Rejects identical underlying keys even when PEM whitespace or base64
   line wrapping differs. Invalid PEM, unsupported key algorithms, parser
   failures and unavailable verification tooling fail closed.

The accepted OpenSSL `pkeyutl -verify -pubin -rawin` detached-signature
mechanism remains unchanged. Algorithm parsing and identity comparison do
**not** replace or bypass actual signature verification, corporate trust
enrollment, witness/custodian independence, protected-custody requirements
or prior approved trust pins.

A SHA-256-matching test-created trust record is not a real corporate
enrollment; test-only Ed25519 and RSA keys are created only in ephemeral
GitHub Actions source-test fixtures.

## 3. Actual runner and pre-mutation rejection

The production runner source `tools/hft_neon_staging_bootstrap.py` continues
to call `authenticated_history_gate()`, which invokes the corrected
`hft_c039_history.validate_history()` before protected database mutation.

The test `tests/test_hft_c041_signed_evidence_identity.py` verifies
that properly re-signed but contradictory predecessor artifacts are rejected
by the actual history verifier **and actual runner main() before any
PostgreSQL transport call**. Only external Gate A and provider control-plane
I/O are substituted by synthetic fixtures; the new historical authenticity
checks and real detached-signature checks are not mocked.

Tests include:

- Positive original transport reconstruction and distinct valid Ed25519
  public keys/signatures, plus legitimate S0–S5 signed-chain acceptance.
- Backend PID and snapshot substitutions, including re-signed artifacts with
  recomputed collection IDs and manifest/witness SHA-256s.
- Contradictions in database or session user, PostgreSQL version, transport,
  phase and canonical revision hashes.
- Identical PEM, leading/trailing whitespace, and differently wrapped
  base64 PEM strings representing one identical Ed25519 key.
- RSA (non-Ed25519), malformed, truncated and missing PEM keys, incorrect
  detached signature, and two otherwise valid signatures made using the
  same underlying key despite different claimed identities.

The complete source pipeline independently verifies C032 consistent
snapshots, C035 full predefined-role census, C037 portable semantic stage
digest, C039 signed historical continuity and Recovery V2 source contracts.

## 4. Immutable protected boundaries and remaining qualifications

No new migration or permission change. All six S0–S5 reference files,
review, execution, catalog, collector-trust and witness-trust pins remain
`HOLD`; none are populated or changed. The existing 30-category catalog,
C032 snapshot implementation, C037 portable semantic fingerprint, existing
Gate A V3 source-hash binding and recovery/ledger/transaction protections
remain intact.

**Not source-qualified by C041:** genuine PostgreSQL 18.6 reference
capture, real independently enrolled corporate keys, immutable original
collection custody, human witness independence, trusted original capture
timestamps, recovery Gate R, operational Gate A or production acceptance.
No source-only synthetic test is a substitute for those obligations.

Gate R: HOLD. Gate A: HOLD. Production: NO-GO.

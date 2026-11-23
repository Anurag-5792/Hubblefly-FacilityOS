# C039 — Authenticated historical role-OID continuity evidence

**Directive:** HFT-R1-MASTER-V3-C037-HISTORICAL-CONTINUITY-CORRECT-039  
**Date:** 4 November 2026  
**Starting frozen commit:** `e164d2b5fb4c08dddb1534d0d8879553d64e2c69`  
**Mode:** Nonproduction source only. No PostgreSQL, Neon, backup, restore,
migration, security grants or production deployment authorized.  
**Gate R:** HOLD. **Gate A:** HOLD. **Production:** NO-GO.

## 1. Controlling distinction

C037 semantic stage SHA-256 fingerprints remain portable across independent
clusters. Matching a semantic role name **does not prove physical continuity**
within a target. C039 closes the previous gap: a continuity JSON containing
claimed prior OID strings and SHA-256 strings cannot itself authenticate the
historical collection.

The runner now requires original, independently signed and pinned historical
collection evidence, not just an asserted predecessor role map.

## 2. Versioned original collection evidence

`tools/hft_c039_history.py` defines:

- `HFT_R1_BOOTSTRAP019_PREDECESSOR_COLLECTION_V1`
- `HFT_R1_BOOTSTRAP019_HISTORY_MANIFEST_V1`
- `HFT_R1_BOOTSTRAP019_HISTORY_FILE_MAP_V1`
- `HFT_R1_BOOTSTRAP019_PREDECESSOR_WITNESS_V1`

The original predecessor collection artifact is canonical, UTF-8, sorted-key,
compact JSON with one trailing newline. It includes exact project, branch,
database, historical stage, capture timestamp, prior signed collection hash,
full 30-category catalog (including all role/explicit-membership OIDs),
phase, canonical revision ledger (where applicable), raw-OID evidence,
the C037 versioned collection envelope and ID, and the original PostgreSQL
single-snapshot JSONL transport bytes.

Validation replays those **original JSONL bytes** through the real
`hft_c028_catalog.collect(..., include_phase=True)`. This enforces the
accepted C032 same-backend, read-only repeatable-read packet protocol and
actual packet identity without executing PostgreSQL. The replayed catalog,
phase and revisions must exactly match the signed original artifact.
The original transport SHA, collection ID, raw OID representation, portable
semantic digest, server version and database/session/backend identity must
all cross-match. Role/grant OID mapping and stage policy are revalidated.

`build_collection(...)` is only an unsigned source-artifact builder. It
does not provide a trusted timestamp, authentication, provenance, corporate
enrollment or Gate A approval.

## 3. No parallel trust authority

The verifier **reuses the existing Recovery V2** corporate Ed25519 trust
records, pinned by existing protected trust controls:

- `config/hft-recovery-v2-collector-trust.sha256` (**HOLD**)
- `config/hft-recovery-v2-witness-trust.sha256` (**HOLD**)

The collector's corporate identity trust is
`HFT_R1_INDEPENDENT_CATALOG_COLLECTOR_V1`. The human witness trust is
`HFT_R1_INDEPENDENT_HUMAN_TRUST_V2`.

Both must have canonical exact bytes and externally approved SHA-256 pins;
the corporate identity issuer is `HFT_CORPORATE_IDENTITY`, enrollment
status is `ACTIVE`, with separate verifier IDs, enrolled public keys
and valid enrollment timestamps. The collector and human witness must
use distinct enrolled public keys; historical capture must not predate either
enrollment. These asserted trust-record properties
are *not* evidence of independent corporate enrollment unless the actual
protected trust hashes are independently qualified.

The original predecessor artifact bytes must verify under the approved
collector Ed25519 key using the reviewed OpenSSL
`pkeyutl -verify -pubin -rawin` mechanism. A separately signed
`PREDECESSOR_WITNESS_V1` attestation must verify under the enrolled
human witness key and cover the exact original collection SHA-256 and ID,
collector signature SHA-256, source, scope, role-independent witness identity,
operator identity, custodian identity, protected-custody status and
witness timestamp.

The witness, operator, custodian and collector must be distinct. The
witness/collector independently pinned trust records must be ACTIVE.
The witness, operator and custodian IDs must also equal identities in
the separately authorized and hash-pinned Gate A artifact. A named
witness/custodian without cryptographic and approved identity bindings
cannot authorize execution.

The signed custody claim is independently authenticated source evidence;
the repository journal is **not** an immutable corporate evidence store.
Corporate entitlement, real custody protection, enrollment and human
independence remain external qualifications.

## 4. Complete authenticated S0–S5 history chain

For proposed current state S0, the manifest must contain one separately
qualified **S0_BASELINE** original predecessor. It must have the exact
approved target-local baseline SHA-256 explicitly bound to Gate A, and
a canonical stage semantic fingerprint equal to the independently
qualified S0 reference. S0 trust is **never** initialized from its current
catalog or an unsigned on-demand local snapshot.

For proposed S1, the manifest must contain signed
`S0_BASELINE -> S0` artifacts. For S2, it must contain
`S0_BASELINE -> S0 -> S1`; and likewise through S5
(`S0_BASELINE -> S0 -> S1 -> S2 -> S3 -> S4`).

For every history link the verifier enforces:

- Same exact project, branch, database, authorized PG18.6 collector source
  and stage-bound approved semantic reference.
- Actual predecessor bytes match the separately Gate-A-approved manifest.
  Each signed collection's prior SHA exactly chains to the preceding
  signed original collection, and collection IDs cannot be replayed.
- Capture times strictly increase and follow preceding witness signatures;
  trust enrollment precedes signatures, witnesses attest no later than
  15 minutes after capture, and the complete chain precedes Gate A.
- The latest signed predecessor must predate validation by at least 60
  seconds, be no older than 24 hours, and the root baseline must be no
  older than 30 days under the current source policy. These are bounded
  policies, not permission to self-certify an old timestamp.
- Every existing role name must retain exactly the same local role OID.
  S1 may add only the five protected-bootstrap HFT roles. All other
  unqualified creation, removal or same-name recreation is rejected.
- A target from another project, Neon branch, database or stage cannot be
  substituted; the current collection ID cannot be replayed as an
  independently collected historical predecessor.

An independent reference cluster may legitimately assign different raw
OIDs while producing the same portable stage fingerprint; it cannot
replace the *target-local signed history chain*.

## 5. Actual runner, Gate A and review binding

`tools/hft_neon_staging_bootstrap.py` adds:

- Required `--historical-manifest` and `--historical-file-map` inputs,
  in addition to the existing C037 `--role-continuity-evidence`.
- Mandatory `authenticated_history_gate(...)` before SQL for all five
  mutating phases and the independent read-only S5 check.
- A real history-verification return value containing the authenticated
  predecessor original SHA, root SHA, witness SHA, approved collector
  source, and role-OID map derived from the **signed original catalog**.
  Claimed values in the existing continuity JSON must match that result,
  including its target identity, or the runner stops.
- Existing C037 `verify_stage` still checks the current target-local
  OID continuity. The current collection also rejects replayed historical
  collection identities.
- Journal events record authenticated predecessor evidence identities
  before any protected mutation. These journal entries are **not** new
  independently signed approvals or an immutable custody system.

Execution authorization schema is now
`HFT_R1_MASTER_V3_BOOTSTRAP019_EXEC_AUTH_V3`. Gate A must independently
bind the exact history-manifest SHA-256, the approved root baseline SHA,
and the exact C039 historical-verifier source SHA-256. It continues to
bind the C037 collector/source, six stage references and their
V2 phase-bundle identity, reviewed transition SQL, canonical migrations,
runner identity, continuity artifact and Recovery V2 evidence/validator.
Earlier V1/V2 authorizations are not compatible.

Authenticating source structure, predecessor artifacts, cryptographic
signatures and trust records does **not** independently issue Gate A.
S5 checking is not a human release or authorization to deploy.

## 6. Evidence security and remaining holds

All source tests use explicitly generated **test-only** Ed25519 keys,
synthetic signed original PostgreSQL JSONL transports and test-only
reference/trust pins. No test signs or enrolls a production identity.
The real files `hft-bootstrap019-stage-s0.sha256` through `s5.sha256`,
review/authorization pins, recovery witness and collector pins remain HOLD.
No real baseline collection, historical signature, corporate custody receipt
or Gate A record has been created or approved by this correction.

The actual proof still needs independent corporate trust enrollment,
protected original-byte preservation and recovery, valid witness/custodian
qualification, appropriately witnessed PostgreSQL 18.6 source references,
historical collection/readback authenticity, independent security/governance
review, Gate R and a separate operator-authoritative Gate A decision.

**No DB/resource execution. No PR merge. No production GO.**

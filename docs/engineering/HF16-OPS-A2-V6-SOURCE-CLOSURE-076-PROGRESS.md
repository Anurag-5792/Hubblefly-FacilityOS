# HF16-OPS-A2-V6-SOURCE-CLOSURE-076 — bounded progress, not closure

Directive: HFT-R1-MASTER-V4-OPS-A2-V6-SOURCE-CLOSE-076.
Baseline: b1ac58c401d96ddb79d05c06db8b0f0c5ff55d09.
Branch: engineering/hft-r1-stores-foundation. PR #11 remains draft/unmerged.
Gate R HOLD. Gate A HOLD. Protected SQL installation HOLD. Production NO-GO.

## Implemented source delta

1. `lib/hft/security/ops-a2-recovery-fence-076.ts`: externally signed ADMIT and
   RELEASE receipt verification and a bounded, buffering recovery client.
   No default coordinator, reader, enrolled key, DB pool, HTTP route or live
   activation. This is a candidate client, NOT an installed revocation fence.
2. `tests/unit/hft-ops-a2-recovery-fence-076.test.ts`: 21 offline tests using a
   public RFC 8032 test seed and a test-only serialization model. The tests do
   not create corporate keys, approvals, PostgreSQL sessions or witness facts.
3. `tools/hft_ops_a2_076_evidence_contract.py`: original-archive hash checks;
   duplicate-key rejection; separately named negative-control matching;
   ledger-history reconstruction; immutable pre/post equality; explicit F07
   positive entry 1 and foreign-scope no-disclosure checks; actual-SQL-session
   attestation shape/pin checks and six-role separation checks.
4. `tests/test_ops_a2_076_evidence_contract.py`: 15 offline tests. Success returns
   STRUCTURALLY_CONSISTENT_PENDING_ORIGIN_AND_INDEPENDENT_REVIEW, never PASS.

The first source commit is 3915a222547866db28a3f1f51fb869a9a7a57dd4. Its exact-head
PR workflow 43409316515 succeeded. The final review SHA and final CI evidence
must be taken from the accompanying MASTER report, not inferred from this
intermediate result. Existing failed workflows remain historical evidence.

## Recovery ordering contract

The separately qualified authority must serialize admission, revocation and
release over ALL resources involved in a read: current actor/session,
reviewer entitlement, scope signing key, original approval, corporate person
and policy. A timestamp, cached policy generation or signed JSON alone cannot
establish that ordering. A durable multi-resource coordinator is still missing.

ADMIT must authenticate the fresh reader independently, inspect the exact
original command/proof/nonce/approval/entity/site/warehouse/item/version scope,
and persist a single-use lease. The client binds that complete request, source
SHA, separately approved migration hash and a random challenge into the receipt.
An ordinary warehouse reader's possession of an old proof is not entitlement.

The protected reader must acquire a NEW REPEATABLE READ READ ONLY snapshot
AFTER admission. It buffers at most 1 MiB, never streams output, and uses one
connection identity. Both elapsed-time and signed-wall-time limits are checked.
The maximum lease is 30 seconds. There is no renewal or retry path.

RELEASE must atomically recheck authority and consume the lease in the SAME
ordering system as revocations, recording the exact evidence hash, admission
hash, boot ID, sequence, connection, backend/session and snapshot. The client
verifies a fresh release challenge and copies the evidence before returning it.
No receipt, wrong binding, expired lease, timeout, provider error or failed
cancellation can return buffered evidence. Expiry is checked before initiating
the release call, not only after it has already been started.

Revocation before admission: deny the read. Revocation ordered before RELEASE,
including during reconciliation: deny release and discard buffered evidence.
RELEASE ordered before revocation: the exact already-authorized evidence stays
a historical delivery; the later revocation prevents new admissions/releases.
The durable RELEASE event is the authorization linearization point. This is
NOT a claim to atomically retract network bytes already sent or prevent an
already-authorized in-flight response from arriving after a later revocation.
A different required delivery policy needs an independently reviewed protocol.

Every revocation writer must enter the common ordering system BEFORE its
protected DB change can become effective. Pending/uncertain revocations must
block new admission/release. Crash recovery must retain tombstones and consumed
leases; split-brain/failover cannot restore authority. These are implementation
and qualification prerequisites, NOT guarantees established by this client.

Existing PostgreSQL recovery entrypoints and ACL candidates are unchanged.
No-bypass DB role/ACL integration is still required; this wrapper is NOT a claim
that direct SQL callers are fenced. The existing SERIALIZABLE writer and
nonlocking read-only verifier are preserved.

## Historical signer policy remains open

The current SQL helper calls corporate-person/session qualification. This
increment does not change its semantics or claim that an expired original
signer's session is accepted. Tests of external signer rejection verify only
client failure behavior. Original issuance-time authentication, current person/
role revocation and the fresh independent reviewer's authority must be reconciled
in source and real PostgreSQL before acceptance. Original posting authority
must never be renewed by recovery.

## Evidence and session verification boundaries

Evidence checks require distinct positive COMMIT and adverse transaction IDs,
original capture hashes, backend/session identity, exact SQLSTATE/control/phase,
rollback capture and reconstructed unchanged committed facts. EXTERNAL legs
must have no account version. A one-digit entry must occur in original movement
facts. F07 must also show a different denied scope with zero rows/bytes disclosed.

The checker cannot authenticate original DB execution by inspecting self-
reported fields. Original captures must be independently signed, retrieved and
bound to the actual gateway execution; verifier/witness and custody remain
mandatory. It is not wired into the existing 067 runner in this increment.
No unsupported fault may borrow another fault's expected error; unqualified
subcases fail closed. Fault constructors themselves are not supplied here.

Session checks reject preliminary-socket observations. Required attested inputs
include the SQL-running connection ID, fresh challenge, TLS exporter digest,
verified hostname, peer/CA hashes, provider project/branch and exact server.
Actual channel binding must be SCRAM-SHA-256-PLUS, not the word "require" from
configuration. All six roles must have separate identities, effective-grant
hashes, no superuser/BYPASSRLS/posting-owner membership, and verified forbidden
role-switch denials. Ordinary observers must lack constructor EXECUTE and DML.
The actual driver/provider capture adapter is still missing. A matching report
is a structure check, not cryptographic proof of connection identity.

## Findings disposition and explicit remaining source work

| Requirement | This increment | Still needed |
|---|---|---|
| GOV-069-H02 / SEC-068-F01 | PARTIAL — SOURCE: signed client and offline races | Durable coordinator, revocation writers, SQL ACL integration, historical signer policy |
| QA070-01 | Existing F06 source preserved; no new constructors | Other positive/adverse fixture transaction implementations |
| QA070-02 | PARTIAL — SOURCE: exact evidence and reconstruction validator | Authenticated capture acquisition, gateway dispatch, signer/witness integration |
| QA070-03 | Existing hash inventory preserved | Approved installation-artifact verifier and dependency/owner/rollback qualification |
| QA070-04 | PARTIAL — SOURCE: actual-session and six-role contract validation | Same-connection driver/provider attestation and real privilege probes |
| QA070-05 | PARTIAL — SOURCE: F07 explicit negative evidence assertions | Real foreign-scope fixture, execution and original no-disclosure capture |
| QA070-06 | PARTIAL — SOURCE: nine immutable rejection subcases | Complete constructors and source-specific expected errors for all other fault types |
| QA070-07 | Exact observer allowlist preserved | Actual database ACL and integration qualification |

HF17-PG-F01 through F08 and A2-PG-01 through 16 remain NOT TESTED. No fixture
is promoted to COMPLETE by overlapping IDs or a structural validator.
ORIGINAL SIGNED HF17 FIXTURE EVIDENCE UNVERIFIED.

External blockers: approved disposable PostgreSQL 18.6 resource; exact
installation authority; independently operated coordinator and capture service;
current trust registry/public-key enrollment; separately scoped credentials;
corporate issuer/verifier and accountable witness. These do NOT excuse the
remaining source implementations identified above.

No protected SQL, canonical migrations, existing STOP guards, stock writers,
production gates, trust pins or deployed resources are changed by this increment.
Independent Security/Governance/QA acceptance is PENDING. Directives 074/072/076
remain OPEN.

Reference for snapshot semantics (not evidence of local SQL acceptance):
https://www.postgresql.org/docs/18/transaction-iso.html

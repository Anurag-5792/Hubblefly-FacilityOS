# HFT R77 RECEIVE — independent fixture admission (SOURCE ONLY)

Controlling directive: `HFT-R1-MASTER-V4-DELIVERY-QUALITY-077`.
This contract does **not** issue proofs, grant roles, enroll keys, install SQL,
create a database, certify a supplier invoice, or authorize a posting.
No original data, private proofs or credentials are committed to this repository.

## Required real fixtures

The independent fixture issuer must register distinct, genuine, previously
unposted source receipts and independently approved proofs:

- `BULK_5`: one genuine accepted 5.000000-unit, nonserial physical receipt.
- `SERIAL_1`: a different genuine accepted 1.000000-unit serialized
  physical receipt, with global serial identity and an attested zero account.
- `LATE_ROLLBACK`: another independent, never-posted, approved RECEIVE
  receipt whose real protected writer completes before an intentional SQL
  error, then gets rolled back before COMMIT.
- `INVALID_ACTOR`, `WRONG_BIN`, `CHANGED_QUANTITY`,
  `FORGED_RECEIPT`, `INVALID_APPROVAL`: separately pre-signed
  negative payload/proof pairs, each admitted to invoke the protected
  writer and expected to fail the **specified protected rule**, not a
  generic gateway/ACL denial.
- `REPLAY`: a separately admitted, deliberately attempted **original**
  posted payload and nonce; no new nonce, no reposting on uncertain COMMIT.

## Original-database and paper/electronic provenance

Chat 11 must independently compare the original **supplier invoice**
(including supplier, legal entity, invoice key, item and quantity), original
**GRN + all GRN lines**, original **accepted QC decision**, real
`grn_partial_receipt.id` + quantity + receipt key/line, **physical bin**,
item version/serial/batch and human approval/decision revision. The three
SHA-256 document digests `invoiceEvidenceSha256`, `qcEvidenceSha256`,
`physicalReceiptEvidenceSha256` must be calculated from the actual
original evidence bytes by an independent trusted reviewer, not invented
by the driver or inferred from the applicant's strings. Decision
`approvalDecisionSha256` must match the original stored governance decision.

Chat 10 and Chat 13 must independently verify and admit the SHA-256 of
the **exact executable approved migration**, **exact approved role/ACL
installation**, the **PostgreSQL 18.6 disposable resource attestation**,
 and independently signed fixture admission, and privately
insert the matching `hft_qa077.receive_fixture_v1` row with original
payload and SHA-256 of the original posting-proof JSONB. These hashes and
`admission_authority` fields are **attestation inputs, not self-validating
cryptographic proof**. No acceptable signed admission means NO EXECUTION.

The QA login must have membership in `hft_r1_app_runtime` solely to meet
the protected database `session_user` contract; it must have **no**
posting-owner or gateway-owner membership, direct protected EXECUTE,
table DML, fixture DML, role-switch rights or bypass privileges.

A separately approved **NOLOGIN** `hft_r77_gateway_owner` owns the
STOP-guarded `hft_qa077` SECURITY DEFINER wrappers and receives only
exact protected writer, recovery and read EXECUTE. Installation/GRANT
source is **not** authorized by this commit. The existing 067 gateway
cannot substitute for a protected posting gateway; it only observes or
queues fault requests. Independent Chat 10 review must settle the exact
ACL amendment before Chat 13 installs anything.

## Private fixture format and source entrypoint

Validate private one-case JSON against
`tests/fixtures/hft_r77_receive_admission.schema.json`.
The input provides original approved 33-field V2 payload, original
nine-field signed proof, the matching source/admission identities and
four **fresh signed read proof pairs**: before BALANCES, after BALANCES,
MOVEMENTS, and original-nonce recovery (the last is not required for a
negative test). Each proof has a short validity window. Never publish a
populated fixture, original HMAC, connection password, signing key,
session token or recovery entitlement.

After independent admission, invoke one case at a time with:
`node tools/hft_r77_receive_pg18_acceptance.mjs --execute --case BULK_5`.
The driver requires `HFT_R77_APPROVED_RESOURCE_SHA256` equal to the
independent resource-admission SHA in both private fixture and registered
database observation. It supports `HFT_R77_TRANSPORT=LOCAL_TLS` with
`PGHOST=127.0.0.1`, or `HFT_R77_TRANSPORT=ONLINE_TLS` with
`PGHOST=HFT_R77_APPROVED_ENDPOINT_HOST`; both require verified CA,
`PGSSLMODE=verify-full`, an approved backend port and exact attested
database/session identity. These environment values do not replace the
separately signed resource admission.
The driver requires independently qualified disposable DB identity,
PostgreSQL 18.6, verified TLS, exact gateway ownership and no forbidden
direct function EXECUTE. It does not install or enroll anything.

For each case, Chat 17 retains the private execution record, exact SQL
error, original independent pre/post read snapshots, GRN/line and invoice
counters, physical receipt, stock account quantity/version, serialized
registry (if applicable), original nonce, command, two ledger legs, seal,
audit and delivery. A source-driver success is **not independent QA PASS**.
Unknown COMMIT or failed authenticated readback means **NO RETRY** and
reconciliation under the original signed nonce.

**Gate R HOLD · Gate A HOLD · Production NO-GO.**

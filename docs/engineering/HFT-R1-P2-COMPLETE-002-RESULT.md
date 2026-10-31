# HFT-R1-P2-COMPLETE-002-RESULT v0.1

**Status:** Bounded nonproduction SOURCE contribution; H1/H2 NOT CLOSED, production NO-GO.
**Repository:** `Anurag-5792/Hubblefly-FacilityOS`; branch `engineering/hft-r1-stores-foundation`; PR #11 DRAFT/unmerged.
**MASTER directive:** HFT-R1-MASTER-P2-COMPLETE-002, authority HFT-R1-ENG-SCOPE-006 / AMENDMENT-002.
**Starting HEAD:** `c36de6454b10aca3cfcfa81a59297e5a2e859964`.
**Primary source commit:** `616451f3cd379fde0713b816040dcf43c2185838`.
**Source correction commit:** `42a934b32ec6b34848e67097d06e2870c8be7a4b`.
**Local KES checkout:** Not inspected or changed; only remote branch/PR were reconciled.

## Implemented source
16 initial changed paths across `lib/hft/security`, `lib/hft/persistence`, `db/security`, `tests/unit`, `tests/fixtures`, `tests/pg`, `tests` and `docs/engineering`; 3 targeted source corrections in second commit. Exact diff and source IDs are available from GitHub compare.

HMAC-SHA-256 testable proof source binds verified actor/session, exact payload hash, doc revision, action, command/idempotency, scope, fragment/qty, issued/expiry, 192-bit nonce and key-version. Encoding is domain-separated and length-prefixed UTF-8 in fixed field order, independent of JSONB serialization. App signer calls existing signed-session verifier first. Independent Python+Node golden vectors agree. DB SQL candidate invokes pgcrypto HMAC from an approved isolated schema and checks active session, provisioned key state and nonce uniqueness. No real key generated/provisioned.

Protected SQL is **NOT a migration**: `db/security/HFT-R1-P2-ONE-WRITER-REVIEW.sql`. It proposes separate migration admin, nonsuperuser NOLOGIN definer owner, restricted runtime/audit group, global function-default revocation for both creators, explicit helper PUBLIC/runtime revocations, no runtime DML, and sole SEC DEFINER function `hft.post_stock_command_protected_v1(jsonb,jsonb)` with fixed safe search_path. It implements candidate persisted proof/source/actor/grant/approval/Hold/policy and employee checks, cumulative immutable fragment and custody ceilings, one stock command with exact entries/outbox/outcome and P1 seal. It is NOT SQL-parsed against PostgreSQL, source accepted, provisioned, executed, or deployed. Effective privileges, trigger semantics and role memberships require independent and real DB validation.

The TypeScript protected adapter performs one SQL function call in a bounded serializable transaction, attests database login/loopback and discards the connection on failed rollback or ambiguous COMMIT. The original per-table DML candidate is not a production route; after review it must be retired or further isolated before activation.

## QA and known blockers

- H1: SOURCE DESIGN AUTHORED / open until DB-verifiable proof, persisted approval binding and human segregation tested.
- H2: REVIEW-ONLY SINGLE WRITER / open until approved 0007, actual function ownership and runtime SQL denial tested.
- SEC-01–04: source intent implemented in protected candidate; no independent security ACCEPT, no PostgreSQL proof/privilege/concurrency evidence.
- M1: fragment model existed; SQL partial issue/return/custody source authored, unexecuted.
- M2: entity command uniqueness previously implemented; not re-tested this turn.
- M3/M4: existing endpoint and connection cleanup guards reused; new protected envelope source added; real driver tests absent.
- P1 H3–H5: accepted source preserved; actual database tests pending.

## Exact tests
- **Executed:** `node --experimental-strip-types --test /mnt/data/hft_p2_complete/tests/unit/hft-posting-invocation-proof.test.ts`, Node 22.16.0, 6 PASS / 0 FAIL / exit 0, bounded source staging only.
- **Executed:** `python3 -m unittest discover -s /mnt/data/hft_p2_complete/tests -p test_p2_invocation_contract.py -v`, Python 3.13.5, 5 PASS / 0 FAIL / exit 0, independent reference vector + source assertions.
- Staging source proved byte-equal to exact committed file contents via 16/16 remote GitHub retrievals at the corrected source commit.
- **Authored, NOT RUN:** `tests/unit/hft-protected-posting-transaction.test.ts`, P2-SEC-T01..T06 SQL. T04/T05 are concurrency schedules, not executable acceptance suites until separately authorized fixtures and orchestration are supplied.
- **NOT RUN:** any PostgreSQL migration, credential/key provisioning, extension install, SQL catalog/permission tests, full app npm/typecheck/lint/build, browser E2E, actual driver fault/recovery, KES operations, production deployment.

## Review and single next dependency
Chat 10 and the designated PostgreSQL DBA must independently accept source actor-proof/key custody/pgcrypto location/SECURITY DEFINER ownership, ACL/default-grant/role inheritance, nonce/replay and lock-order design before any proposed SQL can become canonical migration 0007. Chat 17 reviews changed implementation, fragment data integrity and test design; Chat 11 reviews approvals, Holds, audit and real-human segregation. Reviews have not yet returned.

**Separately gated later:** Chat 13 accepted disposable PostgreSQL and explicit DB migration/testing authority. No new installation authority arises from this report.

**Final disposition: PARTIAL SOURCE PROGRESS; REQUEST CHANGES/NO-GO for runtime and production.**

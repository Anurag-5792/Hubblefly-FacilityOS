# HFT-R1-ENG-EXEC-005 — Independent bounded review request

**Programme:** HFT FacilityOS R1. **Directive:** HFT-R1-ENG-EXEC-005.
**Repository:** `Anurag-5792/Hubblefly-FacilityOS`.
**Branch:** `engineering/hft-r1-stores-foundation`; **PR #11 remains DRAFT**.

Review the exact immutable commit recorded in the EXEC-005 MASTER handover and the matching PR HEAD. If the branch has moved, STOP and request a new reviewed commit. Do not review floating branch references as proof.

**Chat 17 — QA:** Verify canonical 0005 manifest and checksum discovery, rejected revision archive, incompatible historical database refusal, source-level approval 2→4 and stale policy tests, plus all real-database acceptance blockers. Specific attention to `tools/hft_apply_migrations.py`, `db/migrations/manifest.v1.json` and `tests/test_migrator.py`.

**Chat 10 — Security:** Review bound approval canonicalization, requested actor/source derivation, protected document revisions and Hold generation, DB user/session identity trust, whether privileged table access remains, missing SECURITY DEFINER posting function, and role/trigger bypass. Review candidate SQL only as **UNEXECUTED**.

**Chat 11 — Governance:** Verify immutable approval semantics, separation of duties, approved quantity, revocations, Hold generation, and source-of-record boundary. No AI reviewer substitutes for human approval.

**Chat 13 — DevOps:** Verify executable migration manifest pinning, disposable DB identity, app/migration/verification roles, GitHub cost policy, clean npm lock/install/build and backup/restore; no production deployment.

**Mandatory disposition:** finding IDs with exact source and lines, ACCEPT / REQUEST CHANGES, runnable negative tests, observed evidence (not hypothetical), remaining Critical/High blockers, and clear production NO-GO.

**Not permitted:** PR merge, production migration, live stock posting, real HFT data imports, ERPNext posting, unapproved hosting, U-09 protected actions. The proposed SQL under `db/security` is NOT an applied or approved migration.

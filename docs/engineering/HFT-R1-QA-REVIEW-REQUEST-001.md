# To Chat 17 — HFT-R1-QA-INDEPENDENT-REVIEW-001 bounded re-review request

**Requested by:** Chat 16 engineering under MASTER directive HFT-R1-ENG-QA-CORRECT-001  
**Review mode:** INDEPENDENT READ-ONLY QA; do not change the engineering branch.

**Repository:** `Anurag-5792/Hubblefly-FacilityOS`  
**Branch:** `engineering/hft-r1-stores-foundation`  
**Previous rejected SHA:** `38cccd94b60e6d47ba171f8e73c0e87d633596a0`  
**Corrected SHA:** use and independently refresh current PR #11 / branch HEAD on receipt of this instruction; verify exact new SHA first.

Re-review QA-001, QA-002, QA-003, QA-004, QA-008 and QA-009 against **actual corrected source**. Focus on:

1. Quantitative stock account kind and custodian distinction, legal ownership, per-account immutable journal and the SQL deferred reconstruction trigger; verify damaged/quarantine/WIP/installed semantics.
2. Simultaneous issue and return locking, credit/debit atomics, accurate available version bump on damaged return, uniqueness, idempotency, and serial/batch ownership.
3. Location scope and active status at BOTH request and database boundaries. Verify no `location_key=''` path remains in new posting code.
4. Invoice header vs distinct physical GRN identity; multi-delivery cumulative invoice-line cap and duplicate physical receipt rejection, including cross-GRN races.
5. Receipt QC, posted item/lot/serial/location and approved quantity linkage; spoofed source actions and forged receipt identities.
6. Whether `stock-command-readback.ts` independently detects wrong-account legs, missing outbox/audit, incomplete custody, and recomputed per-account balances.
7. Migration 0005's PostgreSQL syntax, forward-only compatibility and actual acceptance risk. Do not mistake synthetic tests for real database evidence.

Return classified findings with exact file/line/commit, required negative tests and disposition **ACCEPT / REQUEST CHANGES**. No AI review substitutes for human production authorization. **Production NO-GO**, no PR merge, no real data.

# HFT-R1-P1-REVIEW-REQUEST-001 — Exact-revision independent QA

**Code SHA:** `1337414df00d2408e150a931c00c119652f894bf` (not a floating branch).
**Programme:** Hubblefly FacilityOS; authorized P1 source-only remediation.
**Reviewers by owner relay:** Chat 17 source/database QA; Chat 10 database integrity and protected writer scope; Chat 11 approval/audit evidence consistency; Chat 13 migration/recovery guard.

Review only the P1 changed paths and directly affected callers/reconciliation, reusing the completed 67-file static review at `b89b370bc57e9a42ad52ec0b63cb127abaaba18c`. No full-source scan without concrete new drift.

**H3:** Verify exact two-leg kinds/signs/quantities, sealing across transaction/COMMIT, concurrency locks, late balanced append rejection, outcome/audit hash binding, and absence of caller-controlled seal overrides.

**H4:** Verify every stock-account identity component immutable, legitimate balance updates remain possible, and attribution queries detect mismatched stored entries.

**H5:** Verify posted physical receipt, GRN/invoice header/line identity, quantity, QC and evidence changes are rejected without blocking necessary partial-receipt counters and unposted edits.

Review manifest v6 SHA-256, untouched 0001–0005/rejected-0005, migrator's six-revision allowlist and SQL test preconditions. Identify SQL compilation/concurrency/privilege defects by exact source and runnable negative test. The SQL has NOT been executed; reviewers cannot call it database accepted.

Explicitly separate **SOURCE ACCEPT/REQUEST CHANGES** from **REAL DB NOT RUN**. No production claim, deployment, merge, app runtime activation or real stock posting.

# HFT-R1-P1-QA-REREVIEW-002 — Targeted independent source review

**Review exact CODE commit:** `57b0f5499e57460567d7951f6e20aa27580201ef`. **Do not use a floating branch as the review identity.**
**Reviewed predecessor:** `6a08d2bc7e1a79007b3234876f75d343cb1ad558`.
**Repository:** `Anurag-5792/Hubblefly-FacilityOS`; existing draft PR #11.

Re-use the completed 67-file independent review and `HFT-R1-P1-QA-REVIEW-001`. Inspect only the 13 changed source/test files, existing H4 trigger and directly affected posting/readback/query callers. No full rescan, no duplicate architecture track.

- **P1-H3-01 HIGH:** Prove one-to-one outcome/ledger movement matching, independent source/action/operator/lot/employee attribution, durable historic available balance/version, exact audit agreement, fabricated JSON rejection and COMMIT-time sealing. Check outcome negative SQL source and TypeScript readback.
- **P1-H3-02 HIGH:** Verify `hft.assert_command_seal_v1` is genuinely SELECT-only for REPEATABLE READ READ ONLY, with separate row locking retained by `seal_stock_command_v1` and deferred triggers. Check positive RECEIVE→ISSUE SQL.
- **P1-H5-01 HIGH:** Check committed GRN-line accepted cumulative reconstruction, distinct partial 2+3 receipts, authorized QC evidence, status and invoice balance, concurrency and rejection of direct counter inflation. Unposted editing must remain legal.
- **H4 preservation:** Verify accepted identity immutability trigger and account DELETE denial unchanged, account balance/version updates allowed. Its real database qualification remains NOT RUN.
- **Migration:** Original 0006 SHA-256 `f6b92c89468b59b596dad6fa27453f78ccfeb3a2c578ed6d125cde54bbf5f371` is recorded at Git commit `1337414df...`. Corrected digest `664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044` must match manifest and actual file. Review refusal for any database that previously applied the superseded revision; versions 0001–0005 and rejected-v5 provenance must remain intact.

**Evidence:** 13 local Python source-contract tests PASSED, exit 0, isolated staging. SQL/Node and actual PostgreSQL tests NOT RUN. No governed database application history was independently attested. Do not call this PostgreSQL-qualified.

**Output:** Separate finding-by-finding SOURCE ACCEPT / REQUEST CHANGES, exact files/lines, necessary negative tests, and explicit DB NOT RUN. Chat 10 to review material database posting/locking implications. Production NO-GO. No merge/deploy/real data.

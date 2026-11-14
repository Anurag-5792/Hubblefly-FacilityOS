# HF13 V2 — engineering source advancement after retained-P3 installer pin

**14 November 2026**. Current exact engineering HEAD: `22ef10aa6aee80ae92f83142ee18e6f8643a1f72`. Two latest exact-head source-verification runs: SUCCESS.

The HF13 retained-P3 review SQL in this branch remains pinned to
`5b45cc3fe9f62b56906a0820afcf1397f7b7f254`, original P3 raw source
SHA-256 `33eac12f493ca70463ffe50cfec62377e904d9a84d51e1c6eedb6797f34bb4c1`,
derived candidate SHA-256 `acbe2b778c30b3cc044be7d3ff028f88977f26c195baaa6b5392ba77234b0389`.
**Do not silently rebase or assert that later source inherited review approval.**

The eight additional engineering commits added these two STOP-guarded **source candidates**:

- `db/security/HFT-R1-P3-FIRST-SCOPE-CORPORATE-BOOTSTRAP-NONEXECUTABLE.sql` — 197 lines, corporate-signed original legal entity/site/first-active-warehouse authority. NOT INSTALLED; independent source documents, person/signature enrollment, owner privileges and nonlogin SECURITY DEFINER must be reviewed.
- `db/security/HFT-R1-P3-NONEMPLOYEE-APPLY-NONEXECUTABLE.sql` — 393 lines, independently approved APPLY candidate for ITEM/SUPPLIER/WAREHOUSE/LOCATION. NOT INSTALLED; no runtime GRANT, no verified HTTP binding or database acceptance.

The corresponding TS contract, Node and Python source tests also changed; exact-head source CI passed.
**Active non-Employee Masters remain NO-GO** pending independent review, accepted executable installation, final runtime route/service integration, genuine signed maker/checker, fresh database readback and restart persistence. PENDING_APPROVAL request states are not active Masters.

Update dependency and release sequence, subject to Chat 10/11/17 review:
1. Original reviewed corporate signature and nonlogin bootstrap-owner policy are not substitutable by generic pending Master change.
2. Install/bootstrap original active legal-entity/site/warehouse first (after canonical/P2 dependencies); independently verify no stock quantities posted.
3. Install base retained P3 with separate external technical admission, then exact nonEmployee APPLY candidate with independent role and HMAC domain separation. App route must use protected function only.
4. Qualified original Employee APPLY remains distinct; master audit/revision and no stock writes.
5. Independently test all five master kinds, duplicate rejection, edit/version conflict, maker/checker independence, fresh readback, restart persistence, backup/restore.

No provider project, branch, role, key or database was created/enrolled in this workstream. Neither added source file was executed. The R77 disposable QA resource remains separate and unadmitted.

**Chat 10:** review P3 bootstrap owner/function access, NonEmployee function ACLs and signer/role separation.
**Chat 11:** attest original corporate legal entity/site/warehouse authority and approval evidence.
**Chat 17:** positive/negative persisted+active APPLY and restart/readback acceptance.
**Chat 16:** wire authenticated bounded HTTP decision route without stock posting and maintain exact-head source parity.

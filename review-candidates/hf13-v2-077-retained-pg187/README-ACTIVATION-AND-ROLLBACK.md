# HF13-V2-077-RETAINED-MASTERS-ACTIVATION — Exact PG18.7 Installation Handover

**Directive:** `HFT-R1-MASTER-V4-DELIVERY-QUALITY-077`  
**Date:** 14 November 2026  
**Decision:** SOURCE-BUILT SQL INSTALLATION REVIEW CANDIDATES; **TECHNICAL INSTALLATION ADMISSION HOLD**.  
**Original engineering HEAD:** `5fe71565a2b0343ffd4a2ec5a25be5e0dfce27cc`; two source CI runs PASS, not SQL execution.

## 1. Verified actual Neon facts (read-only SQL against exact project)

- Organization: `org-broad-glade-52476265`
- Project name / ID: `hft-r1-masters-retained-np-077` / `wandering-cake-50222227`
- Branch / ID: `retained-masters-nonproduction` / `br-shiny-night-b3qgsj8t` (READY)
- Database: `hft_r1_retained_masters_np077`
- Endpoint / direct host: `ep-hidden-fire-b324s21q` / `ep-hidden-fire-b324s21q.c-4.ap-southeast-1.aws.neon.tech` (ACTIVE)
- Region: AWS Singapore `aws-ap-southeast-1`
- SQL `server_version_num=180007`, PostgreSQL **18.7**; not `180006`
- SQL session `session_user=current_user=hft_r1_retained_masters_np077_owner`, loopback backend `127.0.0.1/32:5432`, not in recovery
- SQL inspection tool reports `pg_stat_ssl.ssl=false`. This **only describes the provider's internal SQL inspection session**, not the remote TLS endpoint. Do not use this tool as evidence of application TLS, or run protected SQL through it.
- SQL catalog: no `hft` schema, no `hft.schema_revision`, no `hft.p3_submit_master_change_v1`, no `hft_r1_p3_master_runtime`.
- Role inventory: only `hft_r1_retained_masters_np077_owner` surfaced by provider. No independent P3 roles or signer enrollment.
- No data rows, keys, schema or permissions modified by Chat 13 V2 in this handover.

## 2. Hash-bound installation source

The definitive candidate hashes and all six canonical migration hashes are in `manifest.REVIEW.json`. Verify **actual bytes** of every source and generated file, exact engineering commit, and independent review SHA before any DDL. No STOP-guarded original file in `db/security` was edited.

| Candidate | SHA-256 |
|---|---|
| 40 Corporate-signed first scope | `1c3f2d9e082ec6121adb173834ed224c39cbdbf825942a00f8cabbbd3bb76a79` |
| 50 Retained P3 base | `2062447980c8bdfd46f9bb0d77e840569244c7afd5b96e1b4078b28bfefba4ce` |
| 60 Nonemployee APPLY | `a1db7102f5a4d90153b311ae00833fa9ccba882f5eb28697860ff3b5a0359976` |
| 70 Owner/ACL closure — deliberately STOP guarded | `e8236b472296bc4135996f37af4385d72da4f04c07ad913e47a2f6e9a0671e5e` |

**The stage 40/50/60 SQL files are executable-shaped review candidates, not approved executable migrations.** Each derives from an exact original STOP source or reviewed P3 source and adds a PG18.7, retained-database, live TLS SQL session, empty-stock and canonical V6 identity preflight. They have NOT been parsed or run on PG18.7. Stage 70 intentionally cannot execute; Chat 10 must review and close its ACL grant scope first.

These files are **not** in `db/migrations` and must never be picked up by the canonical migration runner. Original `tools/hft_apply_migrations.py` is disposable-loopback-only; no accepted remote retained-PG transport presently exists.

## 3. Exact dependency and admission order

1. **Qualified off-database resource identity:** independent external TLS CA/hostname verification against direct endpoint, project/branch/compute binding, SQL `180007`. Provider's internal `pg_stat_ssl.ssl=false` must not be mistaken for actual deployment-session evidence.
2. **Admit exact remote installer transport:** bound source commit, canonical migration SHA-256s, restricted migration role, controlled TLS and transaction/COMMIT reconciliation. Avoid credential URLs in logs and all ambient libpq overrides.
3. **Before canonical DDL:** independent encrypted custom-format baseline backup and empty-catalog facts; witness restore into a **separate approved** disposable destination; record original checksum, recovery method and external protected custody.
4. **Canonical 0001–0006:** only independently approved exact-source installer with revision ledger readback. The database is currently completely blank. Neither original canonical files nor source manifest are modified.
5. **Restricted roles and dependency closure:** independently install qualified nonlogin P2 posting owner / corporate issuer, P3 owner/runtime and corporate bootstrap owner/runtime with exact role memberships. P2 `posting_session`, approved HMAC length-prefix codec, restricted `hft_crypto` pgcrypto, `hft_secret` and governed original human/custody contracts must exist. No application runtime stock-posting grant or direct table DML.
6. **Corporate authority:** separately verify original corporate document bytes, independent maker/approver and external signatures, approved scope order and key custody with Chat 11. Install stage 40 only after Chat 10 owner/ACL acceptance. Corporate order enrollment and one-time protected bootstrap **are separate privileged operations**, neither implied by installing function DDL. Bootstrap active legal entity/site/warehouse without stock effect; independently reread resulting records.
7. **Base retained P3:** install stage 50 under independently accepted hash and role catalog; admit separate signed actor/session and P3 REQUEST/READ/Employee decision keys. Existing P3 SQL supports protected PENDING_APPROVAL requests and Employee independent APPLY. No direct INSERT into operational master tables from UI.
8. **Nonemployee APPLY:** install stage 60 and exact P3 function/role ACL closure only after Chat 10/11/17 accept independent corporate persons, distinct nonemployee decision HMAC domain, policy/current revision, proof, nonce and stock-history denials. **Current runtime function allowlist has only 3 P3 entrypoints**, and Chat 16 must separately wire the fourth authenticated decision API. A SQL function alone does not authorize browser APPLY.
9. **Independent catalog postflight and DB login adversarial QA:** check actual `proowner`, `prosecdef`, function `search_path`, exact EXECUTE for named P3 runtime, no PUBLIC/inherited extra helper, absence of stock/secret table SELECT/DML, zero elevated role membership, no `SET ROLE` privilege. Test actual signer custody. No source-only postflight acceptance.
10. **Backup, restore and owner-data protection:** encrypted `pg_dump -Fc` via authenticated TLS; checksum and independent protected storage, restore to distinct isolated destination; cross-check canonical revision/role ACL and original master rows. Neon point-in-time retention is supplemental, not independently witnessed backup. Uncertain COMMIT: freeze request identity, query authoritative outcome on fresh signed read, **no automatic retry**.
11. **Nonproduction Vercel binding:** existing team `team_GZjiGpLO7uRSKAEfW18JkCWS`, project `prj_6KRIqjoTbLlVMUWOmWIid56U4BAf`. READY preview (as observed) `hubblefly-facility-d0dl7t30e-drone-destination.vercel.app`, source `5fe71565a2b0343ffd4a2ec5a25be5e0dfce27cc`. Must separately admit preview deployment binding; use exact retained Masters environment profile, `HFT_MASTERS_APPROVED_PG_SERVER_VERSION_NUM=180007`, direct endpoint `PGHOST` matching `HFT_ONLINE_DB_ENDPOINT_HOST`, pin `PGPORT=5432` only after external TLS port confirmation, `HFT_ONLINE_DB_BACKEND_PORT=5432` only after runtime SQL proof. Runtime login must be distinct from Neon owner. Store connection password, CA, signed Ed25519 issuer and P3 HMAC keys only in approved secret facility. Set `HFT_LIVE_POSTING_ENABLED=false`, `HFT_POSTING_RUN_MODE=RETAINED_MASTERS_ONLY_NO_STOCK`. No stock route access.
12. **Real owner acceptance:** authenticated UI `/stores/masters` on approved preview URL, fresh signed POST `REQUESTS`, independent Employee approval, fresh POST `GET`, EDIT/versioning, duplicate/scope denial, application restart and fresh readback. Nonemployee APPLY only after reviewed API and physical/Item version gates. Show exact HFT values and audit evidence, not CSV/offline tests.

## 4. Specific technical authorizations still required

**Already authorized and completed:** creating exactly one retained nonproduction Neon project. **Do not create another**.

**Not authorized by project creation:** remote installer/role/enrollment execution; canonical/P2/P3/corporate/APPLY DDL; installer member roles; pgcrypto; signer/HMAC keys; original corporate order/first-scope bootstrap; protected table grants; Vercel environment-secret changes; live preview deployment; or stock mutations.

**Master needs exact admission of:** independently reviewed remote canonical + P2 + P3 executable package and hashes, required role/key grant changes, original bootstrap enrollment and execution, independent backup/restore destination and custody, preview binding. Chat 10 reviews new OWNER/ACL/function trust boundary; Chat 11 reviews original corporate source/signatures and nonemployee maker/checker; Chat 17 checks real PG18.7 DDL and actor/ACL/negative/immutable audits. No broad architecture restart.

## 5. Known source risks requiring correction, not an implied GO

- Original `hft_r1_retained_masters_np077_owner` is a provider account and cannot be the P3 runtime.
- The first active warehouse requires a separate corporate original-source bootstrap; P3 itself cannot create the initial scope.
- The nonemployee SQL source **rejects new Warehouse CREATE**, **rejects Location ACTIVATE without P0 certification**, and Item ACTIVATE requires governed version + approved PRIMARY photo. A generic APPLY label cannot override these.
- Current nonemployee APPLY SQL candidate has no installed runtime EXECUTE; the latest web service still does not invoke the fourth protected function.
- The proposed owner ACL closure script is STOP guarded and requires independent proof of exactly its table, helper and key access. Some `FOR UPDATE` source reads may require special grants; Chat 10 must verify exact PostgreSQL behavior and immutable guards.
- The provider query's internal SQL session is not authenticated external TLS. The stage 40/50/60 preflights intentionally fail closed there.
- Existing READY Vercel preview is a build state, not authenticated database persistence.
- **No PostgreSQL DDL, custom-format backup, restored database, authenticated real UI write/readback or restart acceptance was executed in this workstream.**

**Gate R HOLD · Gate A HOLD · Protected SQL HOLD · Production NO-GO.**

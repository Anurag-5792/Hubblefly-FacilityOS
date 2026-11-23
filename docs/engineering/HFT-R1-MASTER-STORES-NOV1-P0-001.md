# HFT MASTER V2 — Stores operations minimum release, 1 November 2026

**Decision ID:** HFT-R1-MASTER-STORES-NOV1-001  
**Decision date:** 29 October 2026  
**Binding first-use target:** **1 November 2026**  
**Owner authorization:** PRODUCTION GO ISSUED on 29 October 2026 for this exact minimum release, effective target 1 November 2026. No duplicate owner authorization is required. **Technical release gate:** NO-GO until independent qualification passes.

## P0 scope

From 1 November, the required HFT operating process is to record **all Stores material IN and OUT through FacilityOS**. Material counted physically must be identified and associated with its complete actual storage location. This date is a target, not authority to deploy untested software.

**IN:** supplier/invoice, GRN/receipt, item, product version, quantity/UOM, batch/serial, quality condition, actual receiving user, warehouse and destination location; only QC-accepted and duly approved material becomes AVAILABLE.

**OUT:** item/version/serial/batch, quantity/UOM, actual source location, active employee or manufacturing work order, issuer/receiver, purpose, approved issue, immutable balance/custody and audit; employee acceptance stays ACK_PENDING until genuine acknowledgement.

**COUNT:** unique count session/epoch, operator/time, actual leaf location and full hierarchy, item/version, batch/serial, quantity/UOM, condition, evidence and variance. Same item in multiple bins has separate count lines. Count is evidence, not an automatic increase/decrease in authoritative stock. Verified independently approved opening-stock cutover must prevent double counting.

**LOCATION:** legal entity → site → warehouse → rack/approved area → level/shelf → position → stack slot → bin/container → item/version/batch/serial. Support BN bins, BX cartons and BB battery cartons under a typed governed leaf-location model. Only physically inapplicable nodes may use an approved explicit exception, not invented identifiers. Each posted quantity must resolve to a valid active scoped leaf location. Location changes to existing stock require a reviewed transfer/reconciliation preserving old and new locations and audit history, never a silent overwrite.

## Required working UI

Actual authenticated screens, APIs and durable readback for: Receiving/IN, issuing/OUT, physical count, stock lookup by QR/item/serial, location hierarchy management and authorized location transfers. The product must report pending approvals, holds, QC, count variances, insufficient stock, missing version/photo status and errors truthfully. No hardcoded balances, preview-data substitution or second posting engine.

## Acceptance

- Receive 5 units into R01/L02/P03/S1/BN04 after QC/approval; verify available balance and exact location.
- Issue 2 from that bin to a genuinely active scoped employee or authorized work order; verify available 3, custody/consumption 2, audit and pending acknowledgement.
- Count quantities in two different bins as two count facts; verify no stock movement occurs solely from counting.
- Move 1 unit between two bins through an authorized conservation-preserving stock transfer; read back both balances.
- Reject invalid rack/bin, cross-entity access, duplicate serial/receipt, stale approval, Hold, wrong QC, oversubscription, forged count and conflicting concurrent issues without partial stock facts.
- Prove idempotent replay, uncertain COMMIT reconciliation, actual PostgreSQL authorization/concurrency, full application build/browser, backup/clean-host recovery and valid distinct-human approvals before live use.

## Workstreams and gates

**Chat 16:** integrate P1/P2/P3, build operational UI/API, location path and qualified transfer/count contracts on existing branch/PR. **Chat 04:** physical warehouse layout and Stores acceptance, counting/cutover. **Chat 10/11:** real identity, RBAC, approvals and Holds. **Chat 13:** existing MSI installation hold and approved environment/deployment. **Chat 17:** independent database/concurrency/build/browser/recovery evidence. **MASTER/owner:** preserve the already-issued owner production GO, verify the exact release against mandatory technical, human-approval and operational acceptance evidence before enabling live posting.

Current source has no live Stores In/Out/count routes, no executed qualified protected posting migration, no accepted database/build/browser evidence, and a separate installer hold. This is a **critical schedule risk** requiring immediate escalation. Failure of a safety/authority gate remains NO-GO: the November 1 date grants no waiver.

The original 26 October milestone remains MISSED. The owner separately establishes 1 November as the new P0 live-operations target. ERPNext is Phase 2. DD code may be copied/adapted after review, never connected to HFT runtime. Internal engineering documentation records source provenance in restricted storage; recipient handover documentation contains no source code or donor references.

## Explicit owner PRODUCTION GO and quality boundary

The owner has already **authorized production use** of the P0 Stores IN/OUT/count/location release for **1 November 2026** and instructed engineering to make it happen to international production-grade quality. Do not ask the owner to repeat this production approval for the same scope. This is a management deployment decision, **not a substitute for factual security/DB/concurrency/build/recovery acceptance**. A qualified engineer may not claim technical GO from an unrun test. If required gates remain blocked at the cutover, report the failure immediately; do not bypass holds, invent an independent approver, use shadow stock posting or silently move the deadline. The separate owner assignment of genuinely distinct eligible human approvers and accepted stock opening/cutover evidence must still be evidenced.

The P0 scope remains **all real material IN and OUT plus physical item counts with exact rack, level, position, stack slot, bin/container location**. Real warehouse counting is not a shortcut around posting authority; opening inventory and location changes require distinct accepted movements.

# FacilityOS Inventory MVP — UAT Plan v0.1

## UAT rule

A UAT case passes only with real Frappe/ERPNext evidence. Sample-mode screens and synthetic data do not count as production proof.

No UAT case may post opening stock.

## Environment prerequisites

- FacilityOS Frappe app installed and migrated
- `/admin/integrations` shows FacilityOS Backend = Ready
- test Inventory user with **FacilityOS Inventory**
- separate test Admin user with **FacilityOS Admin**
- optional MIS user with **FacilityOS MIS**
- default company = Hubblefly Technologies Limited
- default warehouse = HFT Store
- `FACILITYOS_AUTH_SOURCE=frappe`
- `FACILITYOS_MIS_SOURCE=frappe`
- `FACILITYOS_OPERATIONS_SOURCE=frappe`

## Authentication and authorization

### UAT-AUTH-001 — Inventory login

1. Sign in as Inventory user.
2. Open Inventory.
3. Open Reconciliation / Validation.

Expected:
- authenticated identity is shown
- role = inventory
- count/save actions are available
- Admin approval is unavailable

### UAT-AUTH-002 — Admin separation

1. Inventory user validates one count session.
2. Sign out.
3. Sign in as a different Admin user.
4. Approve the same session.

Expected:
- Admin approval succeeds only after Inventory validation
- Admin actor is written to validation history
- opening-stock gate becomes Ready for Approval only when blocking exceptions = 0

### UAT-AUTH-003 — Same-user segregation

Assign both roles to one test user only for this negative test.

Expected:
- the same user who performed Inventory validation cannot Admin-approve that same session

### UAT-AUTH-004 — Guest protection

Open a protected Inventory/Admin URL without a FacilityOS session.

Expected:
- redirect to sign-in
- no validation or persistence API can be used anonymously

## QR resolver

### UAT-QR-001 — Serial

Scan a known serial.

Expected:
- resolves as Serial
- correct item code
- live ERPNext serial/item data returned

### UAT-QR-002 — Batch

Scan a known batch.

Expected:
- resolves as Batch
- correct item code
- live ERPNext batch/item data returned

### UAT-QR-003 — Position

Scan a Facility Position.

Expected:
- resolves as Position
- opens Position detail
- current containers/loose contents match FacilityOS

### UAT-QR-004 — Container

Test BN, BX and BB.

Expected:
- correct container type
- current position
- contents
- movement history

### UAT-QR-005 — Unknown QR

Expected:
- no write is performed
- user receives a controlled unrecognized-QR result

## Physical count

### UAT-COUNT-001 — Serialized item count

1. Scan a serial.
2. Enter physical qty = 1.
3. Validate.
4. Save Count to FacilityOS.

Expected:
- count is persisted in a Draft Facility Physical Count Session
- quantity other than 0/1 is rejected
- ERPNext stock ledger is unchanged

### UAT-COUNT-002 — Batch count

Expected:
- batch target and item identity are stored
- quantity persists to count session
- ERPNext stock remains unchanged

### UAT-COUNT-003 — Position/container count

Expected:
- target identity, location/container and physical quantity are stored
- no ERP stock adjustment

### UAT-COUNT-004 — Missing Item Master

Use a structurally valid Serial/Batch whose derived item code does not exist.

Expected:
- count line becomes Exception
- Blocking Exception = true
- Inventory validation cannot pass

## Container location

### UAT-MOVE-001 — Container to position

Move a test BN/BX/BB from one valid position to another.

Expected:
- Facility Container current position changes
- Facility Operational Audit records old/new position, actor and time
- container history shows the event
- ERPNext warehouse quantity is unchanged

### UAT-MOVE-002 — Invalid move

Test same destination, void container and nonexistent position.

Expected:
- move is rejected
- no audit/write occurs

### UAT-MOVE-003 — Serial/Batch stock move

Expected:
- preview succeeds/fails structurally as appropriate
- production ERP posting remains disabled
- FacilityOS does not pretend the ERP movement occurred

## Reconciliation

### UAT-REC-001 — Reconciliation summary

Expected:
- Reference, Physical, Attached/WIP, Accounted and Difference are correct
- location/container is correct
- Ready / Counted / Pending / Exception state is correct

### UAT-REC-002 — Blocking exception

Expected:
- gate remains BLOCKED
- Inventory Validate disabled/rejected
- Admin Approve disabled/rejected

## Validation

### UAT-VAL-001 — Inventory validates

Expected:
- status Submitted → Inventory Validated
- Inventory validator + timestamp stored
- immutable validation audit event created

### UAT-VAL-002 — Inventory rejects

Expected:
- rejection requires remarks
- status becomes Inventory Rejected
- correction/reopen is possible

### UAT-VAL-003 — Admin approves

Expected:
- only a different Admin can approve
- Inventory Validated → Admin Approved
- no blocking exceptions
- gate = Ready for Approval
- no ERP opening-stock document is created

### UAT-VAL-004 — Admin rejects

Expected:
- remarks required
- status Admin Rejected
- Inventory user can reopen and correct

## Sync and MIS

### UAT-SYNC-001 — Incremental read-model sync

As Admin, run Sync Now.

Expected:
- projection statuses become Healthy
- row counts and last-success timestamps update
- Item/Warehouse/Serial/Batch/Bin/SLE source data appears in FacilityOS projections
- ERP source documents are unchanged

### UAT-MIS-001 — Stock Qty

Compare FacilityOS MIS Stock Qty against ERPNext for the same company/warehouse.

Expected:
- same quantity for verified items
- sync timestamp displayed

### UAT-MIS-002 — Moves

Expected:
- movement counts are sourced from Stock Movement Fact
- period/company/warehouse filters work

## Security and failure handling

### UAT-SEC-001 — Credentials

Inspect browser network responses.

Expected:
- ERPNext API key/secret never appear in browser responses
- Frappe SID is HttpOnly

### UAT-SEC-002 — Malformed request

Send malformed JSON to preview/save APIs.

Expected:
- controlled 400/422 response
- no server crash
- no write

### UAT-SEC-003 — Role abuse

Attempt Admin validation as Inventory and Inventory validation as MIS.

Expected:
- Frappe server denies the action

## Opening-stock release gate

The Inventory MVP is **not approved for opening-stock posting** until:

- all relevant UAT cases pass
- physical count reconciliation is complete
- serial/batch exceptions are resolved
- Position/Container exceptions are resolved
- Inventory and Admin validation are proven with separate real users
- ERPNext posting mapping is explicitly approved
- opening-stock preview is reviewed and approved separately

import frappe
from frappe.utils import now_datetime

BATCH_SIZE = 500

PROJECTIONS = {
    "Item Snapshot": "sync_items",
    "Warehouse Snapshot": "sync_warehouses",
    "Serial Snapshot": "sync_serials",
    "Batch Snapshot": "sync_batches",
    "Stock Balance": "sync_bins",
    "Stock Movement Fact": "sync_stock_ledger",
}


def _state(projection):
    if frappe.db.exists("Facility Sync State", projection):
        return frappe.get_doc("Facility Sync State", projection)
    return frappe.get_doc({
        "doctype": "Facility Sync State",
        "projection": projection,
        "status": "Pending",
        "rows_processed": 0,
    }).insert(ignore_permissions=True)


def _rows(doctype, fields, watermark=None):
    filters = [["modified", ">", watermark]] if watermark else []
    return frappe.get_all(
        doctype,
        filters=filters,
        fields=fields,
        order_by="modified asc",
        limit_page_length=BATCH_SIZE,
    )


def _upsert(doctype, key_field, key_value, values):
    name = frappe.db.get_value(doctype, {key_field: key_value}, "name")
    if name:
        doc = frappe.get_doc(doctype, name)
    else:
        doc = frappe.get_doc({"doctype": doctype, key_field: key_value})

    for field, value in values.items():
        setattr(doc, field, value)

    if doc.is_new():
        doc.insert(ignore_permissions=True)
    else:
        doc.save(ignore_permissions=True)
    return doc


def _finish(projection, rows, error=None):
    state = _state(projection)
    state.last_attempt_at = now_datetime()
    state.rows_processed = len(rows)

    if error:
        state.status = "Error"
        state.error_summary = str(error)[:1000]
    else:
        state.status = "Healthy"
        state.error_summary = None
        state.last_success_at = now_datetime()
        modified = [row.get("modified") for row in rows if row.get("modified")]
        if modified:
            state.last_source_modified = max(modified)

    state.save(ignore_permissions=True)


def sync_items():
    projection = "Item Snapshot"
    state = _state(projection)
    rows = []
    try:
        rows = _rows("Item", [
            "name", "item_code", "item_name", "item_group", "brand", "stock_uom",
            "has_serial_no", "has_batch_no", "disabled", "modified",
        ], state.last_source_modified)
        for row in rows:
            _upsert("Facility Item Snapshot", "source_name", row.name, {
                "item_code": row.item_code or row.name,
                "item_name": row.item_name,
                "item_group": row.item_group,
                "brand": row.brand,
                "stock_uom": row.stock_uom,
                "has_serial_no": row.has_serial_no,
                "has_batch_no": row.has_batch_no,
                "disabled": row.disabled,
                "source_modified": row.modified,
                "synced_at": now_datetime(),
            })
        _finish(projection, rows)
    except Exception as exc:
        _finish(projection, rows, exc)
        frappe.log_error(frappe.get_traceback(), f"FacilityOS {projection} sync failed")


def sync_warehouses():
    projection = "Warehouse Snapshot"
    state = _state(projection)
    rows = []
    try:
        rows = _rows("Warehouse", [
            "name", "warehouse_name", "company", "parent_warehouse", "is_group",
            "disabled", "modified",
        ], state.last_source_modified)
        for row in rows:
            _upsert("Facility Warehouse Snapshot", "source_name", row.name, {
                "warehouse_name": row.warehouse_name or row.name,
                "company": row.company,
                "parent_warehouse": row.parent_warehouse,
                "is_group": row.is_group,
                "disabled": row.disabled,
                "source_modified": row.modified,
                "synced_at": now_datetime(),
            })
        _finish(projection, rows)
    except Exception as exc:
        _finish(projection, rows, exc)
        frappe.log_error(frappe.get_traceback(), f"FacilityOS {projection} sync failed")


def sync_serials():
    projection = "Serial Snapshot"
    state = _state(projection)
    rows = []
    try:
        rows = _rows("Serial No", [
            "name", "item_code", "warehouse", "batch_no", "status", "modified",
        ], state.last_source_modified)
        for row in rows:
            company = frappe.db.get_value("Warehouse", row.warehouse, "company") if row.warehouse else None
            _upsert("Facility Serial Snapshot", "serial_no", row.name, {
                "item_code": row.item_code,
                "warehouse": row.warehouse,
                "batch_no": row.batch_no,
                "status": row.status,
                "company": company,
                "source_modified": row.modified,
                "synced_at": now_datetime(),
            })
        _finish(projection, rows)
    except Exception as exc:
        _finish(projection, rows, exc)
        frappe.log_error(frappe.get_traceback(), f"FacilityOS {projection} sync failed")


def sync_batches():
    projection = "Batch Snapshot"
    state = _state(projection)
    rows = []
    try:
        rows = _rows("Batch", [
            "name", "item", "manufacturing_date", "expiry_date", "disabled", "modified",
        ], state.last_source_modified)
        for row in rows:
            _upsert("Facility Batch Snapshot", "batch_no", row.name, {
                "item_code": row.item,
                "manufacturing_date": row.manufacturing_date,
                "expiry_date": row.expiry_date,
                "disabled": row.disabled,
                "source_modified": row.modified,
                "synced_at": now_datetime(),
            })
        _finish(projection, rows)
    except Exception as exc:
        _finish(projection, rows, exc)
        frappe.log_error(frappe.get_traceback(), f"FacilityOS {projection} sync failed")


def sync_bins():
    projection = "Stock Balance"
    state = _state(projection)
    rows = []
    try:
        rows = _rows("Bin", [
            "name", "item_code", "warehouse", "actual_qty", "reserved_qty",
            "projected_qty", "valuation_rate", "modified",
        ], state.last_source_modified)
        for row in rows:
            company = frappe.db.get_value("Warehouse", row.warehouse, "company") if row.warehouse else None
            actual = float(row.actual_qty or 0)
            rate = float(row.valuation_rate or 0)
            key = f"{row.warehouse}|{row.item_code}"
            _upsert("Facility Stock Balance", "source_key", key, {
                "company": company,
                "warehouse": row.warehouse,
                "item_code": row.item_code,
                "actual_qty": actual,
                "reserved_qty": row.reserved_qty,
                "projected_qty": row.projected_qty,
                "valuation_rate": rate,
                "stock_value": actual * rate,
                "source_modified": row.modified,
                "synced_at": now_datetime(),
            })
        _finish(projection, rows)
    except Exception as exc:
        _finish(projection, rows, exc)
        frappe.log_error(frappe.get_traceback(), f"FacilityOS {projection} sync failed")


def sync_stock_ledger():
    projection = "Stock Movement Fact"
    state = _state(projection)
    rows = []
    try:
        rows = _rows("Stock Ledger Entry", [
            "name", "posting_date", "posting_time", "company", "warehouse",
            "item_code", "actual_qty", "qty_after_transaction", "valuation_rate",
            "stock_value_difference", "voucher_type", "voucher_no", "batch_no",
            "serial_no", "modified",
        ], state.last_source_modified)
        for row in rows:
            _upsert("Facility Stock Movement Fact", "source_name", row.name, {
                "posting_date": row.posting_date,
                "posting_time": row.posting_time,
                "company": row.company,
                "warehouse": row.warehouse,
                "item_code": row.item_code,
                "actual_qty": row.actual_qty,
                "qty_after_transaction": row.qty_after_transaction,
                "valuation_rate": row.valuation_rate,
                "stock_value_difference": row.stock_value_difference,
                "voucher_type": row.voucher_type,
                "voucher_no": row.voucher_no,
                "batch_no": row.batch_no,
                "serial_no": row.serial_no,
                "source_modified": row.modified,
                "synced_at": now_datetime(),
            })
        _finish(projection, rows)
    except Exception as exc:
        _finish(projection, rows, exc)
        frappe.log_error(frappe.get_traceback(), f"FacilityOS {projection} sync failed")


def run_incremental_sync():
    for function_name in PROJECTIONS.values():
        globals()[function_name]()
    frappe.db.commit()


def rebuild_all():
    for projection in PROJECTIONS:
        state = _state(projection)
        state.last_source_modified = None
        state.status = "Pending"
        state.error_summary = None
        state.save(ignore_permissions=True)
    frappe.db.commit()
    run_incremental_sync()

import frappe
from frappe.utils import now_datetime

PROJECTIONS = (
    "Item Snapshot",
    "Warehouse Snapshot",
    "Serial Snapshot",
    "Batch Snapshot",
    "Stock Balance",
    "Stock Movement Fact",
)

def _ensure_state(projection):
    if frappe.db.exists("Facility Sync State", projection):
        return frappe.get_doc("Facility Sync State", projection)
    return frappe.get_doc({
        "doctype": "Facility Sync State",
        "projection": projection,
        "status": "Pending",
        "rows_processed": 0,
    }).insert(ignore_permissions=True)

def run_incremental_sync():
    """Scheduler-safe placeholder until each projection adapter is installed.

    It records that the projection layer exists without fabricating successful syncs.
    Production projection adapters will replace Pending with Healthy only after rows
    have actually been copied and verified.
    """
    for projection in PROJECTIONS:
        state = _ensure_state(projection)
        state.last_attempt_at = now_datetime()
        if state.status not in ("Healthy", "Error"):
            state.status = "Pending"
        state.save(ignore_permissions=True)
    frappe.db.commit()

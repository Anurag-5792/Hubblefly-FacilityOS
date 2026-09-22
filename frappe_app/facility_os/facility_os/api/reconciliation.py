import frappe
from facility_os.api.security import ROLE_ADMIN, ROLE_INVENTORY, require_any_role


def _session(session_name=None):
    if session_name:
        return frappe.get_doc("Facility Physical Count Session", session_name)
    names = frappe.get_all("Facility Physical Count Session", pluck="name", order_by="modified desc", limit_page_length=1)
    if not names:
        return None
    return frappe.get_doc("Facility Physical Count Session", names[0])


def _status(value):
    mapping = {
        "Ready": "ready",
        "Counted": "counted",
        "Pending": "pending",
        "Exception": "exception",
    }
    return mapping.get(value or "Pending", "pending")


@frappe.whitelist()
def summary(session_name=None):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)
    doc = _session(session_name)
    if not doc:
        return {
            "ok": True,
            "source": "facilityos",
            "rows": [],
            "totals": {"counted": 0, "pending": 0, "exceptions": 0, "ready": 0},
            "openingStockGate": "BLOCKED",
            "lastUpdatedAt": None,
            "note": "No physical-count session exists yet.",
        }

    rows = []
    totals = {"counted": 0, "pending": 0, "exceptions": 0, "ready": 0}
    for line in doc.lines or []:
        status = _status(line.line_status)
        key = "exceptions" if status == "exception" else status
        totals[key] += 1
        rows.append({
            "itemCode": line.item_code,
            "control": (line.control_type or "Standard").lower(),
            "referenceQty": line.reference_qty,
            "physicalQty": line.physical_qty,
            "attachedQty": line.attached_qty,
            "accountedQty": line.accounted_qty,
            "difference": line.difference,
            "location": line.location or None,
            "container": line.container or None,
            "status": status,
            "exception": line.exception or None,
        })

    traceability_blocking = frappe.db.count(
        "Facility Traceability Exception",
        filters={"status": "Open", "blocking": 1},
    )
    total_blocking = int(doc.blocking_exceptions or 0) + int(traceability_blocking or 0)
    gate_ready = doc.opening_stock_gate == "Ready for Approval" and total_blocking == 0

    return {
        "ok": True,
        "source": "facilityos",
        "rows": rows,
        "totals": totals,
        "openingStockGate": "READY_FOR_APPROVAL" if gate_ready else "BLOCKED",
        "lastUpdatedAt": str(doc.modified),
        "sessionName": doc.name,
        "validationStatus": doc.validation_status,
        "blockingExceptions": total_blocking,
        "countLineBlockingExceptions": int(doc.blocking_exceptions or 0),
        "traceabilityBlockingExceptions": int(traceability_blocking or 0),
    }

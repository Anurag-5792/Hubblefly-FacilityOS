import frappe
from frappe.utils import now_datetime
from facility_os.api.security import (
    ROLE_ADMIN,
    ROLE_INVENTORY,
    current_user,
    require_any_role,
)

TRANSITIONS = {
    "submit": ("Draft", "Submitted", ROLE_INVENTORY),
    "inventory_validate": ("Submitted", "Inventory Validated", ROLE_INVENTORY),
    "inventory_reject": ("Submitted", "Inventory Rejected", ROLE_INVENTORY),
    "admin_approve": ("Inventory Validated", "Admin Approved", ROLE_ADMIN),
    "admin_reject": ("Inventory Validated", "Admin Rejected", ROLE_ADMIN),
    "reopen": (None, "Draft", ROLE_INVENTORY),
}

REJECT_ACTIONS = {"inventory_reject", "admin_reject"}


def _audit(doc, action, previous, new_status, actor, actor_role, remarks):
    frappe.get_doc({
        "doctype": "Facility Validation Record",
        "reference_doctype": doc.doctype,
        "reference_name": doc.name,
        "action": action,
        "previous_status": previous,
        "new_status": new_status,
        "actor": actor,
        "actor_role": actor_role,
        "remarks": remarks or "",
        "blocking_exceptions": doc.blocking_exceptions or 0,
        "occurred_at": now_datetime(),
    }).insert(ignore_permissions=True)


@frappe.whitelist(methods=["POST"])
def act(session_name, action, remarks=None):
    if action not in TRANSITIONS:
        frappe.throw("Unsupported validation action.")

    expected, new_status, required_role = TRANSITIONS[action]
    require_any_role(required_role)
    actor = current_user()
    doc = frappe.get_doc("Facility Physical Count Session", session_name)
    previous = doc.validation_status or "Draft"

    if action == "reopen":
        if previous not in ("Inventory Rejected", "Admin Rejected"):
            frappe.throw("Only a rejected validation can be reopened.")
    elif previous != expected:
        frappe.throw(f"Action {action} is not allowed from status {previous}.")

    if action in REJECT_ACTIONS and not (remarks or "").strip():
        frappe.throw("Remarks are required when rejecting validation.")

    if action in ("inventory_validate", "admin_approve") and int(doc.blocking_exceptions or 0) > 0:
        frappe.throw("Blocking reconciliation exceptions must be resolved first.")

    if action == "admin_approve" and doc.inventory_validated_by == actor:
        frappe.throw("Admin approver must be different from the Inventory validator.")

    if action == "inventory_validate":
        doc.inventory_validated_by = actor
        doc.inventory_validated_at = now_datetime()
    elif action == "admin_approve":
        doc.admin_approved_by = actor
        doc.admin_approved_at = now_datetime()
        doc.opening_stock_gate = "Ready for Approval"
    else:
        doc.opening_stock_gate = "Blocked"

    doc.validation_status = new_status
    doc.save(ignore_permissions=True)
    _audit(doc, action, previous, new_status, actor, required_role, remarks)
    frappe.db.commit()

    return {
        "ok": True,
        "currentStatus": previous.upper().replace(" ", "_"),
        "nextStatus": new_status.upper().replace(" ", "_"),
        "openingStockGate": "READY_FOR_APPROVAL" if doc.opening_stock_gate == "Ready for Approval" else "BLOCKED",
        "actor": actor,
        "persisted": True,
        "message": "Validation recorded.",
    }

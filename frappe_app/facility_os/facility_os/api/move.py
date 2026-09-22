import frappe
from frappe.utils import now_datetime

from facility_os.api.security import ROLE_ADMIN, ROLE_INVENTORY, current_user, require_any_role


@frappe.whitelist(methods=["POST"])
def move_container(container_id, destination_position, remarks=None):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)
    container_id = (container_id or "").strip().upper()
    destination_position = (destination_position or "").strip().upper()

    if not frappe.db.exists("Facility Container", container_id):
        frappe.throw("Facility Container not found.")
    if not frappe.db.exists("Facility Position", destination_position):
        frappe.throw("Destination Facility Position not found.")

    doc = frappe.get_doc("Facility Container", container_id)
    if doc.status == "Void":
        frappe.throw("Void containers cannot be moved.")

    previous = doc.current_position or None
    if previous == destination_position:
        frappe.throw("Container is already at the destination position.")

    actor = current_user()
    doc.current_position = destination_position
    doc.save(ignore_permissions=True)

    audit = frappe.get_doc({
        "doctype": "Facility Operational Audit",
        "event_type": "MOVED",
        "entity_type": "Container",
        "entity_id": container_id,
        "from_position": previous,
        "to_position": destination_position,
        "actor": actor,
        "remarks": remarks or "",
        "reference": doc.name,
        "occurred_at": now_datetime(),
    }).insert(ignore_permissions=True)

    frappe.db.commit()
    return {
        "ok": True,
        "persisted": True,
        "containerId": container_id,
        "fromPosition": previous,
        "toPosition": destination_position,
        "actor": actor,
        "auditId": audit.name,
        "erpNextPosted": False,
    }

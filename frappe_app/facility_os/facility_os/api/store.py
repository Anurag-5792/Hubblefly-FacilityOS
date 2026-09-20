import frappe
from facility_os.api.security import ROLE_ADMIN, ROLE_INVENTORY, require_any_role


def _content_rows(doc):
    rows = []
    for row in doc.contents or []:
        serials = [row.serial_no] if row.serial_no else []
        rows.append({
            "itemCode": row.item_code,
            "quantity": row.qty or 0,
            "batchNo": row.batch_no or None,
            "serialNos": serials,
            "condition": row.condition or None,
        })
    return rows


def _container_history(container_id):
    rows = frappe.get_all(
        "Facility Operational Audit",
        filters={"entity_type": "Container", "entity_id": container_id},
        fields=[
            "event_type", "from_position", "to_position", "actor",
            "remarks", "reference", "occurred_at",
        ],
        order_by="occurred_at desc",
        limit_page_length=50,
    )
    return [{
        "occurredAt": str(row.occurred_at),
        "event": row.event_type,
        "from": row.from_position or None,
        "to": row.to_position or None,
        "performedBy": row.actor or None,
        "reference": row.reference or row.remarks or None,
    } for row in rows]


def _container_payload(doc):
    kind = doc.container_type
    label = "Battery box" if kind == "BB" else "Store box" if kind == "BX" else "Reusable main-store bin"
    return {
        "id": doc.container_id,
        "kind": kind,
        "label": label,
        "status": (doc.status or "Active").lower(),
        "currentPosition": doc.current_position or None,
        "capacity": doc.capacity or None,
        "contents": _content_rows(doc),
        "history": _container_history(doc.container_id),
    }


@frappe.whitelist()
def get_container(container_id):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)
    if not frappe.db.exists("Facility Container", container_id):
        frappe.throw("Facility Container not found.", frappe.DoesNotExistError)
    doc = frappe.get_doc("Facility Container", container_id)
    payload = _container_payload(doc)
    payload["last_synced_at"] = str(doc.modified)
    return payload


@frappe.whitelist()
def get_position(position_id):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)
    if not frappe.db.exists("Facility Position", position_id):
        frappe.throw("Facility Position not found.", frappe.DoesNotExistError)

    position = frappe.get_doc("Facility Position", position_id)
    container_names = frappe.get_all(
        "Facility Container",
        filters={"current_position": position_id, "status": ["!=", "Void"]},
        pluck="name",
        order_by="container_id asc",
    )
    containers = [_container_payload(frappe.get_doc("Facility Container", name)) for name in container_names]
    return {
        "id": position.position_id,
        "rack": position.rack,
        "level": position.level,
        "position": position.position,
        "stackSlot": position.stack_slot or None,
        "status": (position.status or "Active").lower(),
        "containers": containers,
        "looseContents": [],
        "last_synced_at": str(position.modified),
    }

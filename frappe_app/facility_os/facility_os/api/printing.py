import frappe
from frappe.utils import now_datetime

from facility_os.api.security import ROLE_ADMIN, ROLE_INVENTORY, current_user, require_any_role

KIND_MAP = {
    "SERIAL": "Serial",
    "BATCH": "Batch",
    "POSITION": "Position",
    "CONTAINER": "Container",
    "BOX_CARD": "Box Card",
    "GENERIC_ITEM": "Generic Item",
}


@frappe.whitelist(methods=["POST"])
def create_print_job(label_kind, explicit_print_qty, item_code=None, container_ids=None):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)

    kind = KIND_MAP.get(label_kind)
    if not kind:
        frappe.throw("Unsupported label kind.")

    qty = int(explicit_print_qty or 0)
    if qty <= 0:
        frappe.throw("Print quantity must be entered explicitly.")

    if isinstance(container_ids, str):
        container_ids = frappe.parse_json(container_ids)

    container_ids = [
        str(value).strip().upper()
        for value in (container_ids or [])
        if str(value).strip()
    ]

    doc = frappe.get_doc({
        "doctype": "Facility Print Job",
        "label_kind": kind,
        "item_code": (item_code or "").strip().upper() or None,
        "explicit_print_qty": qty,
        "approved_qty": 0,
        "status": "Previewed",
    })

    if kind == "Box Card":
        if len(container_ids) != qty:
            frappe.throw("Box Card print quantity must exactly match the number of container IDs.")
        if len(container_ids) != len(set(container_ids)):
            frappe.throw("Duplicate container IDs are not allowed.")
        for container_id in container_ids:
            if not frappe.db.exists("Facility Container", container_id):
                frappe.throw(f"Unknown Facility Container: {container_id}")
            doc.append("labels", {
                "container_id": container_id,
                "label_id": container_id,
                "qr_payload": container_id,
                "status": "Prepared",
            })

    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {
        "ok": True,
        "persisted": True,
        "jobId": doc.name,
        "status": doc.status,
        "explicitPrintQty": doc.explicit_print_qty,
        "previewCount": doc.preview_count,
        "approvedQty": doc.approved_qty,
        "requiresApproval": bool(doc.requires_approval),
    }


@frappe.whitelist(methods=["POST"])
def approve_print_job(job_id):
    require_any_role(ROLE_ADMIN)
    doc = frappe.get_doc("Facility Print Job", job_id)
    if doc.status not in ("Previewed", "Draft"):
        frappe.throw("Only a previewed print job can be approved.")

    doc.approved_qty = doc.explicit_print_qty
    doc.status = "Approved"
    doc.approved_by = current_user()
    doc.approved_at = now_datetime()
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"ok": True, "persisted": True, "jobId": doc.name, "status": doc.status}


@frappe.whitelist(methods=["POST"])
def mark_printed(job_id):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)
    doc = frappe.get_doc("Facility Print Job", job_id)
    if doc.status != "Approved":
        frappe.throw("Print job must be fully approved before it can be marked Printed.")

    doc.status = "Printed"
    doc.printed_by = current_user()
    doc.printed_at = now_datetime()
    for row in doc.labels or []:
        row.status = "Printed"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"ok": True, "persisted": True, "jobId": doc.name, "status": doc.status}


@frappe.whitelist()
def box_card(container_id):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)
    container_id = (container_id or "").strip().upper()
    if not frappe.db.exists("Facility Container", container_id):
        frappe.throw("Facility Container not found.", frappe.DoesNotExistError)

    doc = frappe.get_doc("Facility Container", container_id)
    contents = doc.contents or []
    item_codes = sorted(set(row.item_code for row in contents if row.item_code))
    item_code = item_codes[0] if len(item_codes) == 1 else "MULTI"
    item_name = None
    if item_code != "MULTI" and item_code and frappe.db.exists("Item", item_code):
        item_name = frappe.db.get_value("Item", item_code, "item_name")

    current_qty = sum(float(row.qty or 0) for row in contents)
    serials = [row.serial_no for row in contents if row.serial_no]
    batches = sorted(set(row.batch_no for row in contents if row.batch_no))

    audits = frappe.get_all(
        "Facility Operational Audit",
        filters=[
            ["Facility Operational Audit", "entity_id", "=", container_id],
        ],
        fields=["occurred_at", "event_type", "qty", "actor", "from_container", "to_container"],
        order_by="occurred_at desc",
        limit_page_length=4,
    )

    movements = []
    balance = current_qty
    for row in audits:
        qty = float(row.qty or 0)
        is_in = row.to_container == container_id or "RECEIVE" in (row.event_type or "").upper()
        is_out = row.from_container == container_id or "ISSUE" in (row.event_type or "").upper()
        movements.append({
            "date": str(row.occurred_at.date()) if row.occurred_at else "",
            "qtyIn": qty if is_in else 0,
            "qtyOut": qty if is_out else 0,
            "balance": balance,
            "user": row.actor or "",
        })
        if is_in:
            balance -= qty
        elif is_out:
            balance += qty

    return {
        "ok": True,
        "source": "facilityos",
        "card": {
            "containerId": doc.container_id,
            "itemCode": item_code or "",
            "itemName": item_name or ("Multiple item types" if item_code == "MULTI" else ""),
            "qrPayload": doc.container_id,
            "currentQty": current_qty,
            "capacity": int(doc.capacity) if doc.capacity is not None else None,
            "uom": "Nos",
            "serialNo": ", ".join(serials) if serials else None,
            "batchNo": ", ".join(batches) if batches else None,
            "position": doc.current_position or None,
            "status": doc.status,
            "movements": movements,
            "note": "Current quantity is a live Facility Container snapshot; printed cards become snapshots at print time.",
        },
    }


@frappe.whitelist()
def list_print_jobs():
    require_any_role(ROLE_ADMIN)
    rows = frappe.get_all(
        "Facility Print Job",
        fields=[
            "name",
            "label_kind",
            "item_code",
            "explicit_print_qty",
            "approved_qty",
            "status",
            "owner",
            "modified",
        ],
        order_by="modified desc",
        limit_page_length=100,
    )
    return {
        "ok": True,
        "jobs": [{
            "jobId": row.name,
            "labelKind": row.label_kind,
            "itemCode": row.item_code or None,
            "explicitPrintQty": int(row.explicit_print_qty or 0),
            "approvedQty": int(row.approved_qty or 0),
            "status": row.status,
            "createdBy": row.owner or None,
            "modified": str(row.modified) if row.modified else None,
        } for row in rows],
    }

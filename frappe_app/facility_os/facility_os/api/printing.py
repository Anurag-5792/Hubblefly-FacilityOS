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


def _normalise_ids(values):
    if isinstance(values, str):
        values = frappe.parse_json(values)
    return [
        str(value).strip().upper()
        for value in (values or [])
        if str(value).strip()
    ]


def _validate_identity(kind, identity, print_mode, item_code=None):
    if kind == "Serial":
        registry = None
        if frappe.db.exists("Facility Label Registry", identity):
            registry = frappe.db.get_value(
                "Facility Label Registry",
                identity,
                ["status", "label_type", "item_code"],
                as_dict=True,
            )

        if registry:
            if registry.label_type != "Serial":
                frappe.throw(f"{identity} is registered as {registry.label_type}, not Serial.")
            if registry.status in ("Unused", "Void", "Exception"):
                frappe.throw(f"{identity} is {registry.status} and cannot be printed as a physical serial label.")
            if print_mode == "Initial" and registry.status == "Applied":
                frappe.throw(f"{identity} is already Applied. Use Reprint mode if a replacement label is required.")
            if item_code and registry.item_code and registry.item_code != item_code:
                frappe.throw(f"{identity} belongs to {registry.item_code}, not {item_code}.")
            return

        if frappe.db.exists("Serial No", identity):
            if item_code:
                serial_item = frappe.db.get_value("Serial No", identity, "item_code")
                if serial_item and serial_item != item_code:
                    frappe.throw(f"{identity} belongs to {serial_item}, not {item_code}.")
            return

        frappe.throw(f"Unknown serial identity: {identity}")

    elif kind == "Batch":
        if frappe.db.exists("Facility Label Registry", identity):
            status = frappe.db.get_value("Facility Label Registry", identity, "status")
            if status in ("Unused", "Void", "Exception"):
                frappe.throw(f"{identity} is {status} and cannot be printed.")
            return
        if not frappe.db.exists("Batch", identity):
            frappe.throw(f"Unknown batch identity: {identity}")

    elif kind == "Position":
        if not frappe.db.exists("Facility Position", identity):
            frappe.throw(f"Unknown Facility Position: {identity}")

    elif kind in ("Container", "Box Card"):
        if not frappe.db.exists("Facility Container", identity):
            frappe.throw(f"Unknown Facility Container: {identity}")


@frappe.whitelist(methods=["POST"])
def create_print_job(
    label_kind,
    explicit_print_qty,
    item_code=None,
    label_ids=None,
    container_ids=None,
    print_mode="Initial",
    reason=None,
    source_reference=None,
):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)

    kind = KIND_MAP.get(label_kind)
    if not kind:
        frappe.throw("Unsupported label kind.")

    qty = int(explicit_print_qty or 0)
    if qty <= 0:
        frappe.throw("Print quantity must be entered explicitly.")

    reason = (reason or "").strip()
    if not reason:
        frappe.throw("Print reason is required.")

    print_mode = "Reprint" if str(print_mode).strip().lower() == "reprint" else "Initial"
    item_code = (item_code or "").strip().upper() or None
    label_ids = _normalise_ids(label_ids)
    container_ids = _normalise_ids(container_ids)

    identities = container_ids if kind == "Box Card" else label_ids
    identity_kinds = {"Serial", "Batch", "Position", "Container", "Box Card"}

    if kind in identity_kinds:
        if len(identities) != qty:
            frappe.throw("Exact identity count must match the explicit print quantity.")
        if len(identities) != len(set(identities)):
            frappe.throw("Duplicate identities are not allowed.")

        for identity in identities:
            _validate_identity(kind, identity, print_mode, item_code)

    doc = frappe.get_doc({
        "doctype": "Facility Print Job",
        "label_kind": kind,
        "item_code": item_code,
        "print_mode": print_mode,
        "reason": reason,
        "source_reference": (source_reference or "").strip() or None,
        "explicit_print_qty": qty,
        "approved_qty": 0,
        "status": "Previewed",
    })

    if kind in identity_kinds:
        for identity in identities:
            doc.append("labels", {
                "container_id": identity if kind == "Box Card" else None,
                "label_id": identity,
                "qr_payload": identity,
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

    user = current_user()
    if doc.owner == user:
        frappe.throw("The user who created the print job cannot approve the same job.")

    doc.approved_qty = doc.explicit_print_qty
    doc.status = "Approved"
    doc.approved_by = user
    doc.approved_at = now_datetime()
    doc.save(ignore_permissions=True)

    frappe.get_doc({
        "doctype": "Facility Operational Audit",
        "event_type": "PRINT_JOB_APPROVED",
        "entity_type": "Facility Print Job",
        "entity_id": doc.name,
        "actor": user,
        "remarks": f"Approved {doc.explicit_print_qty} {doc.label_kind} label(s).",
        "reference": doc.name,
        "occurred_at": now_datetime(),
    }).insert(ignore_permissions=True)

    frappe.db.commit()
    return {"ok": True, "persisted": True, "jobId": doc.name, "status": doc.status}


@frappe.whitelist(methods=["POST"])
def mark_printed(job_id):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)
    doc = frappe.get_doc("Facility Print Job", job_id)

    if doc.status != "Approved":
        frappe.throw("Print job must be fully approved before it can be marked Printed.")

    user = current_user()
    doc.status = "Printed"
    doc.printed_by = user
    doc.printed_at = now_datetime()
    for row in doc.labels or []:
        row.status = "Printed"
    doc.save(ignore_permissions=True)

    frappe.get_doc({
        "doctype": "Facility Operational Audit",
        "event_type": "PRINT_JOB_PRINTED",
        "entity_type": "Facility Print Job",
        "entity_id": doc.name,
        "actor": user,
        "remarks": f"Printed {doc.explicit_print_qty} {doc.label_kind} label(s).",
        "reference": doc.name,
        "occurred_at": now_datetime(),
    }).insert(ignore_permissions=True)

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
        filters=[["Facility Operational Audit", "entity_id", "=", container_id]],
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
            "print_mode",
            "reason",
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
            "printMode": row.print_mode,
            "reason": row.reason,
            "explicitPrintQty": int(row.explicit_print_qty or 0),
            "approvedQty": int(row.approved_qty or 0),
            "status": row.status,
            "createdBy": row.owner or None,
            "modified": str(row.modified) if row.modified else None,
        } for row in rows],
    }

import re

import frappe

from facility_os.api.security import ROLE_ADMIN, ROLE_INVENTORY, require_any_role

SERIAL_RE = re.compile(r"^(.+)-S\d{4,}$")
BATCH_RE = re.compile(r"^(.+)-B\d{3,}$")
POSITION_RE = re.compile(r"^R\d{2}-L[123]-P\d{2}(?:-S[12])?$")
CONTAINER_RE = re.compile(r"^(BN|BX|BB)-\d{3,}$")


def _resolve_target(target):
    value = (target or "").strip().upper()

    if SERIAL_RE.match(value):
        item_code = frappe.db.get_value("Serial No", value, "item_code")
        if not item_code:
            item_code = SERIAL_RE.match(value).group(1)
        return {
            "target_type": "Serial",
            "target_id": value,
            "item_code": item_code,
            "serial_no": value,
            "batch_no": None,
            "control_type": "Serial",
        }

    if BATCH_RE.match(value):
        item_code = frappe.db.get_value("Batch", value, "item")
        if not item_code:
            item_code = BATCH_RE.match(value).group(1)
        return {
            "target_type": "Batch",
            "target_id": value,
            "item_code": item_code,
            "serial_no": None,
            "batch_no": value,
            "control_type": "Batch",
        }

    if POSITION_RE.match(value):
        return {
            "target_type": "Position",
            "target_id": value,
            "item_code": None,
            "serial_no": None,
            "batch_no": None,
            "control_type": "Standard",
        }

    if CONTAINER_RE.match(value):
        return {
            "target_type": "Container",
            "target_id": value,
            "item_code": None,
            "serial_no": None,
            "batch_no": None,
            "control_type": "Standard",
        }

    if frappe.db.exists("Item", value):
        item = frappe.get_cached_doc("Item", value)
        control = "Serial" if item.has_serial_no else "Batch" if item.has_batch_no else "Standard"
        return {
            "target_type": "Item",
            "target_id": value,
            "item_code": value,
            "serial_no": None,
            "batch_no": None,
            "control_type": control,
        }

    frappe.throw("Count target is not recognized.")


@frappe.whitelist(methods=["POST"])
def ensure_session(company, warehouse):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)

    names = frappe.get_all(
        "Facility Physical Count Session",
        filters={
            "company": company,
            "warehouse": warehouse,
            "validation_status": "Draft",
        },
        pluck="name",
        order_by="modified desc",
        limit_page_length=1,
    )
    if names:
        return {"sessionName": names[0], "created": False}

    doc = frappe.get_doc({
        "doctype": "Facility Physical Count Session",
        "company": company,
        "warehouse": warehouse,
        "validation_status": "Draft",
        "opening_stock_gate": "Blocked",
    }).insert(ignore_permissions=True)

    frappe.db.commit()
    return {"sessionName": doc.name, "created": True}


@frappe.whitelist(methods=["POST"])
def record_count(session_name, target, quantity, condition="Good", container=None):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)

    doc = frappe.get_doc("Facility Physical Count Session", session_name)
    if doc.validation_status != "Draft":
        frappe.throw("Counts can only be edited while the session is Draft.")

    resolved = _resolve_target(target)
    quantity = float(quantity or 0)

    if quantity < 0:
        frappe.throw("Physical quantity cannot be negative.")
    if resolved["target_type"] == "Serial" and quantity not in (0, 1):
        frappe.throw("A serialized target can only have physical quantity 0 or 1.")

    if container:
        container = container.strip().upper()
        if not CONTAINER_RE.match(container):
            frappe.throw("Container must be a valid BN/BX/BB ID.")

    location = None
    if resolved["target_type"] == "Position":
        location = resolved["target_id"]
    elif resolved["target_type"] == "Container":
        container = resolved["target_id"]
        location = frappe.db.get_value("Facility Container", container, "current_position")
    elif container:
        location = frappe.db.get_value("Facility Container", container, "current_position")

    existing = None
    for line in doc.lines or []:
        if line.target_id == resolved["target_id"]:
            existing = line
            break

    line = existing or doc.append("lines", {})
    line.target_type = resolved["target_type"]
    line.target_id = resolved["target_id"]
    line.item_code = resolved["item_code"]
    line.serial_no = resolved["serial_no"]
    line.batch_no = resolved["batch_no"]
    line.control_type = resolved["control_type"]
    line.physical_qty = quantity
    line.location = location
    line.container = container
    line.condition = condition or "Good"

    item_missing = bool(resolved["item_code"] and not frappe.db.exists("Item", resolved["item_code"]))
    if item_missing:
        line.line_status = "Exception"
        line.blocking_exception = 1
        line.exception = "Resolved item code is not present in ERPNext Item Master."
    else:
        line.line_status = "Counted"
        line.blocking_exception = 0
        line.exception = None

    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        "ok": True,
        "persisted": True,
        "sessionName": doc.name,
        "target": resolved["target_id"],
        "targetType": resolved["target_type"],
        "itemCode": resolved["item_code"],
        "physicalQty": quantity,
        "condition": line.condition,
        "container": line.container,
        "location": line.location,
        "lineStatus": line.line_status,
        "blockingExceptions": int(doc.blocking_exceptions or 0),
        "validationStatus": doc.validation_status,
    }

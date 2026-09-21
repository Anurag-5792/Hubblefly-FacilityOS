import frappe
from frappe.utils import now_datetime

from facility_os.api.security import ROLE_ADMIN, ROLE_SHOPFLOOR, current_user, require_any_role


def _operation_payload(row):
    status = (row.status or "Pending").lower().replace(" ", "_")
    return {
        "sequence": int(row.sequence or 0),
        "operation": row.operation,
        "status": status,
        "expectedComponent": row.expected_component or None,
        "scannedComponent": row.scanned_component or None,
        "operator": row.operator or None,
        "completedAt": str(row.completed_at) if row.completed_at else None,
        "note": row.note or None,
    }


def _genealogy(route_card):
    rows = frappe.get_all(
        "Facility Genealogy Event",
        filters={"route_card": route_card},
        fields=[
            "event_type",
            "parent_id",
            "child_id",
            "replacement_id",
            "operator",
            "occurred_at",
            "note",
        ],
        order_by="occurred_at asc",
        limit_page_length=0,
    )
    return [{
        "event": row.event_type,
        "parentId": row.parent_id,
        "childId": row.child_id,
        "replacementId": row.replacement_id or None,
        "operator": row.operator or None,
        "occurredAt": str(row.occurred_at) if row.occurred_at else None,
        "note": row.note or None,
    } for row in rows]


@frappe.whitelist()
def get_route_card(route_card_id):
    require_any_role(ROLE_SHOPFLOOR, ROLE_ADMIN)

    if not frappe.db.exists("Facility Route Card", route_card_id):
        frappe.throw("Facility Route Card not found.", frappe.DoesNotExistError)

    doc = frappe.get_doc("Facility Route Card", route_card_id)
    return {
        "ok": True,
        "source": "facilityos",
        "routeCard": {
            "id": doc.route_card_id,
            "sfgCode": doc.sfg_code,
            "serialNo": doc.serial_no,
            "status": (doc.status or "Draft").lower().replace(" ", "_"),
            "currentOperation": int(doc.current_operation or 1),
            "operations": [_operation_payload(row) for row in doc.operations or []],
            "genealogy": _genealogy(doc.name),
            "startedAt": str(doc.started_at) if doc.started_at else None,
            "completedAt": str(doc.completed_at) if doc.completed_at else None,
        },
    }


@frappe.whitelist(methods=["POST"])
def start_route_card(route_card_id, sfg_code, serial_no, operations=None):
    require_any_role(ROLE_SHOPFLOOR, ROLE_ADMIN)

    if frappe.db.exists("Facility Route Card", route_card_id):
        return get_route_card(route_card_id)

    doc = frappe.get_doc({
        "doctype": "Facility Route Card",
        "route_card_id": route_card_id,
        "sfg_code": sfg_code,
        "serial_no": serial_no,
        "status": "In Progress",
        "current_operation": 1,
        "started_at": now_datetime(),
    })

    for index, operation in enumerate(operations or [], start=1):
        if isinstance(operation, str):
            operation_name = operation
            expected = None
        else:
            operation_name = operation.get("operation")
            expected = operation.get("expectedComponent")
        doc.append("operations", {
            "sequence": index,
            "operation": operation_name,
            "expected_component": expected,
            "status": "Pending",
        })

    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return get_route_card(doc.name)


@frappe.whitelist(methods=["POST"])
def complete_operation(route_card_id, sequence, scanned_component=None, note=None):
    require_any_role(ROLE_SHOPFLOOR, ROLE_ADMIN)

    doc = frappe.get_doc("Facility Route Card", route_card_id)
    if doc.status in ("Complete", "Blocked"):
        frappe.throw("This route card cannot accept another operation.")

    sequence = int(sequence)
    operation = next((row for row in doc.operations or [] if int(row.sequence or 0) == sequence), None)
    if not operation:
        frappe.throw("Route operation not found.")

    if scanned_component:
        operation.scanned_component = scanned_component.strip().upper()

    if operation.expected_component and not operation.scanned_component:
        frappe.throw("This operation requires a scanned component identity before completion.")

    operation.status = "Complete"
    operation.operator = current_user()
    operation.completed_at = now_datetime()
    operation.note = note or operation.note

    pending = [row for row in doc.operations or [] if row.status != "Complete"]
    if pending:
        next_row = sorted(pending, key=lambda row: int(row.sequence or 0))[0]
        next_row.status = "In Progress"
        doc.current_operation = int(next_row.sequence or sequence + 1)
        doc.status = "In Progress"
    else:
        doc.status = "Complete"
        doc.completed_at = now_datetime()

    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return get_route_card(doc.name)


@frappe.whitelist(methods=["POST"])
def add_genealogy_event(route_card_id, event_type, parent_id, child_id, replacement_id=None, note=None):
    require_any_role(ROLE_SHOPFLOOR, ROLE_ADMIN)

    allowed = {"BUILT_FROM", "INSTALLED_IN", "REMOVED_FROM", "REPLACED_BY"}
    if event_type not in allowed:
        frappe.throw("Unsupported genealogy event.")

    if not frappe.db.exists("Facility Route Card", route_card_id):
        frappe.throw("Facility Route Card not found.")

    parent_id = (parent_id or "").strip().upper()
    child_id = (child_id or "").strip().upper()
    replacement_id = (replacement_id or "").strip().upper() or None

    if not parent_id or not child_id:
        frappe.throw("Parent and child identities are required.")
    if event_type == "REPLACED_BY" and not replacement_id:
        frappe.throw("Replacement identity is required for REPLACED_BY.")

    exception_open = frappe.db.exists(
        "Facility Traceability Exception",
        {
            "status": "Open",
            "blocking": 1,
            "entity_id": child_id,
        },
    )
    if exception_open:
        frappe.throw("This component has an open blocking traceability exception.")

    event = frappe.get_doc({
        "doctype": "Facility Genealogy Event",
        "event_type": event_type,
        "parent_id": parent_id,
        "child_id": child_id,
        "replacement_id": replacement_id,
        "route_card": route_card_id,
        "note": note or "",
    }).insert(ignore_permissions=True)

    frappe.db.commit()
    return {
        "ok": True,
        "persisted": True,
        "eventId": event.name,
        "event": event.event_type,
        "parentId": event.parent_id,
        "childId": event.child_id,
        "replacementId": event.replacement_id or None,
        "operator": event.operator,
        "occurredAt": str(event.occurred_at),
        "erpNextPosted": False,
    }

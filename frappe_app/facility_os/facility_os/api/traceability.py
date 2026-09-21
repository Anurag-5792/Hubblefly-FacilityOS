import json

import frappe
from frappe.utils import now_datetime

from facility_os.api.security import ROLE_ADMIN, ROLE_INVENTORY, current_user, require_any_role


@frappe.whitelist()
def summary():
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)

    label_counts = {}
    for row in frappe.get_all(
        "Facility Label Registry",
        fields=["status", "count(name) as total"],
        group_by="status",
        limit_page_length=0,
    ):
        label_counts[row.status or "Unknown"] = int(row.total or 0)

    exception_counts = {}
    for row in frappe.get_all(
        "Facility Traceability Exception",
        filters={"status": "Open"},
        fields=["exception_type", "blocking", "count(name) as total"],
        group_by="exception_type, blocking",
        limit_page_length=0,
    ):
        key = row.exception_type or "Other"
        exception_counts[key] = exception_counts.get(key, 0) + int(row.total or 0)

    open_rows = frappe.get_all(
        "Facility Traceability Exception",
        filters={"status": "Open"},
        fields=[
            "name", "exception_type", "entity_type", "entity_id", "item_code",
            "expected_label", "observed_label", "blocking", "reported_by",
            "reported_at", "session_name",
        ],
        order_by="blocking desc, reported_at desc",
        limit_page_length=200,
    )

    return {
        "ok": True,
        "labelCounts": label_counts,
        "exceptionCounts": exception_counts,
        "openBlocking": sum(1 for row in open_rows if row.blocking),
        "exceptions": open_rows,
    }


@frappe.whitelist(methods=["POST"])
def mark_unused(labels, item_code=None, source_reference=None, remarks=None):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)

    if isinstance(labels, str):
        try:
            labels = json.loads(labels)
        except Exception:
            labels = [value.strip() for value in labels.split(",") if value.strip()]

    labels = [str(value).strip().upper() for value in (labels or []) if str(value).strip()]
    if not labels:
        frappe.throw("At least one label ID is required.")

    actor = current_user()
    updated = 0

    for label_id in labels:
        name = frappe.db.get_value("Facility Label Registry", {"label_id": label_id}, "name")
        if name:
            doc = frappe.get_doc("Facility Label Registry", name)
        else:
            doc = frappe.get_doc({
                "doctype": "Facility Label Registry",
                "label_id": label_id,
                "label_type": "Serial",
            })

        doc.item_code = item_code or doc.item_code
        doc.status = "Unused"
        doc.applied_entity_id = None
        doc.applied_at = None
        doc.source_reference = source_reference or doc.source_reference
        doc.remarks = remarks or f"Marked unused by {actor}"

        if doc.is_new():
            doc.insert(ignore_permissions=True)
        else:
            doc.save(ignore_permissions=True)
        updated += 1

    frappe.db.commit()
    return {"ok": True, "updated": updated, "status": "Unused"}


@frappe.whitelist(methods=["POST"])
def report_missing_sticker(entity_type, entity_id, item_code=None, expected_label=None, session_name=None, remarks=None):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)

    entity_id = (entity_id or "").strip().upper()
    if not entity_id:
        frappe.throw("Entity ID is required.")

    existing = frappe.db.get_value(
        "Facility Traceability Exception",
        {
            "exception_type": "Missing Sticker",
            "entity_type": entity_type,
            "entity_id": entity_id,
            "status": "Open",
        },
        "name",
    )
    if existing:
        return {"ok": True, "exceptionId": existing, "created": False}

    doc = frappe.get_doc({
        "doctype": "Facility Traceability Exception",
        "exception_type": "Missing Sticker",
        "entity_type": entity_type,
        "entity_id": entity_id,
        "item_code": item_code,
        "session_name": session_name,
        "expected_label": expected_label,
        "blocking": 1,
        "status": "Open",
        "resolution_remarks": remarks or "",
    }).insert(ignore_permissions=True)

    frappe.db.commit()
    return {"ok": True, "exceptionId": doc.name, "created": True}


@frappe.whitelist(methods=["POST"])
def resolve(exception_id, remarks):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)

    if not (remarks or "").strip():
        frappe.throw("Resolution remarks are required.")

    doc = frappe.get_doc("Facility Traceability Exception", exception_id)
    if doc.status != "Open":
        frappe.throw("Only open traceability exceptions can be resolved.")

    doc.status = "Resolved"
    doc.resolved_by = current_user()
    doc.resolved_at = now_datetime()
    doc.resolution_remarks = remarks.strip()
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        "ok": True,
        "exceptionId": doc.name,
        "status": doc.status,
        "resolvedBy": doc.resolved_by,
        "resolvedAt": str(doc.resolved_at),
    }

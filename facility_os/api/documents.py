import frappe
from frappe.utils import now_datetime

from facility_os.api.security import ROLE_ADMIN, ROLE_INVENTORY, current_user, require_any_role

TYPE_MAP = {
    "GRN": "GRN",
    "GATE_PASS": "Gate Pass",
    "DELIVERY_CHALLAN": "Delivery Challan",
}


def _doc_payload(doc):
    return {
        "id": doc.name,
        "type": {
            "GRN": "GRN",
            "Gate Pass": "GATE_PASS",
            "Delivery Challan": "DELIVERY_CHALLAN",
        }.get(doc.document_type, doc.document_type),
        "status": (doc.status or "Draft").lower(),
        "documentDate": str(doc.document_date),
        "company": doc.company,
        "warehouse": doc.warehouse,
        "partyName": doc.party_name or None,
        "supplierInvoice": doc.supplier_invoice or None,
        "supplierInvoiceDate": str(doc.supplier_invoice_date) if doc.supplier_invoice_date else None,
        "recipient": doc.recipient or None,
        "purpose": doc.purpose or None,
        "vehicleNo": doc.vehicle_no or None,
        "returnable": bool(doc.returnable),
        "expectedReturnDate": str(doc.expected_return_date) if doc.expected_return_date else None,
        "referenceType": doc.reference_doctype or None,
        "referenceName": doc.reference_name or None,
        "preparedBy": doc.prepared_by or None,
        "checkedBy": doc.checked_by or None,
        "authorizedBy": doc.authorized_by or None,
        "erpNextPosted": bool(doc.erpnext_posted),
        "lines": [{
            "itemCode": row.item_code,
            "itemName": row.item_name or None,
            "qty": float(row.qty or 0),
            "uom": row.uom,
            "serialNo": row.serial_no or None,
            "batchNo": row.batch_no or None,
            "containerId": row.container_id or None,
            "fromPosition": row.from_position or None,
            "toPosition": row.to_position or None,
            "remarks": row.remarks or None,
        } for row in doc.lines or []],
    }


@frappe.whitelist(methods=["POST"])
def save_document(document):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)

    if isinstance(document, str):
        document = frappe.parse_json(document)

    document_type = TYPE_MAP.get(document.get("type"))
    if not document_type:
        frappe.throw("Unsupported FacilityOS document type.")

    doc = frappe.get_doc({
        "doctype": "Facility Movement Document",
        "document_type": document_type,
        "status": "Draft",
        "document_date": document.get("documentDate"),
        "company": document.get("company"),
        "warehouse": document.get("warehouse"),
        "party_name": document.get("partyName"),
        "supplier_invoice": document.get("supplierInvoice"),
        "supplier_invoice_date": document.get("supplierInvoiceDate"),
        "recipient": document.get("recipient"),
        "purpose": document.get("purpose"),
        "vehicle_no": document.get("vehicleNo"),
        "returnable": 1 if document.get("returnable") else 0,
        "expected_return_date": document.get("expectedReturnDate"),
        "reference_doctype": document.get("referenceType"),
        "reference_name": document.get("referenceName"),
        "erpnext_posted": 0,
    })

    for line in document.get("lines") or []:
        item_code = (line.get("itemCode") or "").strip().upper()
        item_name = line.get("itemName")
        if item_code and not item_name and frappe.db.exists("Item", item_code):
            item_name = frappe.db.get_value("Item", item_code, "item_name")
        doc.append("lines", {
            "item_code": item_code,
            "item_name": item_name,
            "qty": line.get("qty"),
            "uom": line.get("uom"),
            "serial_no": (line.get("serialNo") or "").strip().upper() or None,
            "batch_no": (line.get("batchNo") or "").strip().upper() or None,
            "container_id": (line.get("containerId") or "").strip().upper() or None,
            "from_position": (line.get("fromPosition") or "").strip().upper() or None,
            "to_position": (line.get("toPosition") or "").strip().upper() or None,
            "remarks": line.get("remarks"),
        })

    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {
        "ok": True,
        "persisted": True,
        "document": _doc_payload(doc),
        "note": "FacilityOS draft saved. No ERPNext stock transaction was posted.",
    }


@frappe.whitelist(methods=["POST"])
def transition(document_id, action):
    require_any_role(ROLE_INVENTORY, ROLE_ADMIN)
    doc = frappe.get_doc("Facility Movement Document", document_id)
    action = (action or "").strip().upper()
    user = current_user()

    if action == "PREPARE":
        if doc.status != "Draft":
            frappe.throw("Only a Draft document can be prepared.")
        doc.status = "Prepared"
        doc.prepared_by = doc.prepared_by or user

    elif action == "CHECK":
        if doc.status != "Prepared":
            frappe.throw("Only a Prepared document can be checked.")
        if doc.prepared_by == user:
            frappe.throw("Checker must be different from the preparer.")
        doc.status = "Checked"
        doc.checked_by = user

    elif action == "AUTHORIZE":
        require_any_role(ROLE_ADMIN)
        if doc.status != "Checked":
            frappe.throw("Only a Checked document can be authorized.")
        if doc.checked_by == user:
            frappe.throw("Authorizer must be different from the checker.")
        doc.status = "Authorized"
        doc.authorized_by = user

    else:
        frappe.throw("Unsupported document transition.")

    doc.save(ignore_permissions=True)

    frappe.get_doc({
        "doctype": "Facility Operational Audit",
        "event_type": "DOCUMENT_" + action,
        "entity_type": "Facility Movement Document",
        "entity_id": doc.name,
        "actor": user,
        "remarks": f"{doc.document_type} moved to {doc.status}.",
        "reference": doc.name,
        "occurred_at": now_datetime(),
    }).insert(ignore_permissions=True)

    frappe.db.commit()
    return {"ok": True, "persisted": True, "document": _doc_payload(doc), "erpNextPosted": False}

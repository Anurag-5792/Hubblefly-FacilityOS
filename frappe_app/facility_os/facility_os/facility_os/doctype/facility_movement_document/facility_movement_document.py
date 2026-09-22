import frappe
from frappe.model.document import Document

class FacilityMovementDocument(Document):
    def before_insert(self):
        self.prepared_by = frappe.session.user
        self.erpnext_posted = 0

    def validate(self):
        if not self.document_date:
            frappe.throw("Document Date is required.")
        if (
            self.document_type == "GRN"
            and self.company == "Hubblefly Technologies Limited"
            and str(self.document_date) < "2026-08-01"
        ):
            frappe.throw("HTL live inward starts 1 Aug 2026. Earlier receipts belong to opening-stock reconciliation and must not be entered again as GRN.")
        if not self.lines:
            frappe.throw("At least one item line is required.")
        for row in self.lines:
            if not row.item_code or not row.uom or float(row.qty or 0) <= 0:
                frappe.throw("Each line needs Item Code, positive Qty and UOM.")
        if self.document_type == "GRN":
            if not self.party_name or not self.supplier_invoice:
                frappe.throw("GRN requires Supplier and Supplier Invoice / Challan.")
        else:
            if not self.recipient or not self.purpose:
                frappe.throw("Gate Pass / Delivery Challan requires Recipient and Purpose.")
        if self.document_type == "Gate Pass" and self.returnable and not self.expected_return_date:
            frappe.throw("Expected Return Date is required for a returnable Gate Pass.")
        if self.erpnext_posted and not self.erpnext_reference:
            frappe.throw("ERPNext posting cannot be marked complete without an ERPNext reference.")

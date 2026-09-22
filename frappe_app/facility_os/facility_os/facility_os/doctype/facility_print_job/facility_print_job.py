import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

class FacilityPrintJob(Document):
    def validate(self):
        qty = int(self.explicit_print_qty or 0)
        approved = int(self.approved_qty or 0)
        if qty <= 0:
            self.status = "Blocked"
            self.blocked_reason = "Print quantity must be entered explicitly."
            frappe.throw(self.blocked_reason)
        self.preview_count = qty
        self.requires_approval = 1
        if approved < 0 or approved > qty:
            frappe.throw("Approved quantity must be between 0 and the explicit print quantity.")
        if self.label_kind == "Box Card":
            ids = [row.container_id for row in self.labels if row.container_id]
            if len(ids) != qty:
                frappe.throw("Box Card print quantity must exactly match the number of container IDs.")
            if len(ids) != len(set(ids)):
                frappe.throw("Duplicate container IDs are not allowed in a Box Card print job.")
        if self.status == "Approved" and approved < qty:
            frappe.throw("Full requested quantity must be approved before print release.")
        if self.status == "Printed" and approved < qty:
            frappe.throw("Printing is blocked until the full requested quantity is approved.")

    def before_save(self):
        if self.status == "Approved" and not self.approved_by:
            self.approved_by = frappe.session.user
            self.approved_at = now_datetime()
        if self.status == "Printed" and not self.printed_by:
            self.printed_by = frappe.session.user
            self.printed_at = now_datetime()

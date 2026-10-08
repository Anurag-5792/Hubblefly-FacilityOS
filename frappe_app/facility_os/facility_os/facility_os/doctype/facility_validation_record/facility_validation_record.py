import frappe
from frappe.model.document import Document

class FacilityValidationRecord(Document):
    def validate(self):
        if not self.is_new():
            frappe.throw("Facility Validation Records are immutable.")

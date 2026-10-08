import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

class FacilityLabelRegistry(Document):
    def before_insert(self):
        if self.doctype == "Facility Traceability Exception":
            self.reported_by = frappe.session.user
            self.reported_at = now_datetime()

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

class FacilityGenealogyEvent(Document):
    def before_insert(self):
        self.operator = frappe.session.user
        self.occurred_at = now_datetime()

    def validate(self):
        if not self.is_new():
            frappe.throw("Facility Genealogy Events are immutable.")

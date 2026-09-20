import frappe
from frappe.model.document import Document

class FacilityPhysicalCountSession(Document):
    def validate(self):
        blocking = 0
        for line in self.lines or []:
            physical = float(line.physical_qty or 0)
            attached = float(line.attached_qty or 0)
            line.accounted_qty = physical + attached
            if line.reference_qty is None:
                line.difference = None
            else:
                line.difference = line.accounted_qty - float(line.reference_qty or 0)
            if line.blocking_exception:
                blocking += 1
        self.blocking_exceptions = blocking
        if self.validation_status != "Admin Approved":
            self.opening_stock_gate = "Blocked"
        elif blocking == 0:
            self.opening_stock_gate = "Ready for Approval"

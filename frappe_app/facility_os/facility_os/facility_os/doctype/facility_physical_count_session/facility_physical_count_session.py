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

        traceability_blocking = 0
        if frappe.db.exists("DocType", "Facility Traceability Exception"):
            traceability_blocking = frappe.db.count(
                "Facility Traceability Exception",
                filters={"status": "Open", "blocking": 1},
            )

        total_blocking = blocking + int(traceability_blocking or 0)
        if self.validation_status != "Admin Approved" or total_blocking > 0:
            self.opening_stock_gate = "Blocked"
        else:
            self.opening_stock_gate = "Ready for Approval"

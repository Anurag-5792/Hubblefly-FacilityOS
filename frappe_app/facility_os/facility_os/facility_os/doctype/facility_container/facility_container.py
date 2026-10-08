import frappe
from frappe.model.document import Document

class FacilityContainer(Document):
    def validate(self):
        container_id = (self.container_id or "").strip().upper()
        expected_prefix = f"{self.container_type}-" if self.container_type else ""

        if expected_prefix and not container_id.startswith(expected_prefix):
            frappe.throw(f"Container ID must start with {expected_prefix} for container type {self.container_type}.")

        if self.capacity is not None and int(self.capacity or 0) < 0:
            frappe.throw("Container capacity cannot be negative.")

        contents = self.contents or []
        item_codes = {row.item_code for row in contents if row.item_code}

        # Cartons are controlled as one item type. Reusable BN bins may hold related item types.
        if self.container_type in ("BX", "BB") and len(item_codes) > 1:
            frappe.throw("BX and BB containers must contain only one item type.")

        total_qty = sum(float(row.qty or 0) for row in contents)
        if self.capacity and total_qty > float(self.capacity):
            frappe.throw(f"Container quantity {total_qty:g} exceeds capacity {self.capacity}.")

        serials = [row.serial_no for row in contents if row.serial_no]
        if len(serials) != len(set(serials)):
            frappe.throw("Duplicate serial identities are not allowed inside one container.")

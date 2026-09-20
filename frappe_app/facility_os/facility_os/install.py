import frappe

ROLES = (
    "FacilityOS Inventory",
    "FacilityOS Shopfloor",
    "FacilityOS MIS",
    "FacilityOS Admin",
)

def after_install():
    for role_name in ROLES:
        if not frappe.db.exists("Role", role_name):
            frappe.get_doc({
                "doctype": "Role",
                "role_name": role_name,
                "desk_access": 1,
            }).insert(ignore_permissions=True)
    frappe.db.commit()

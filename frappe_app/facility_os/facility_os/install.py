import frappe

ROLES = (
    "FacilityOS Inventory",
    "FacilityOS Shopfloor",
    "FacilityOS MIS",
    "FacilityOS Admin",
)


def _ensure_roles():
    for role_name in ROLES:
        if not frappe.db.exists("Role", role_name):
            frappe.get_doc({
                "doctype": "Role",
                "role_name": role_name,
                "desk_access": 1,
            }).insert(ignore_permissions=True)
    frappe.db.commit()


def before_install():
    _ensure_roles()


def after_install():
    _ensure_roles()

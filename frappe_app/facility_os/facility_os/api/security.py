import frappe
from frappe import _

ROLE_INVENTORY = "FacilityOS Inventory"
ROLE_SHOPFLOOR = "FacilityOS Shopfloor"
ROLE_MIS = "FacilityOS MIS"
ROLE_ADMIN = "FacilityOS Admin"

def current_user():
    user = frappe.session.user
    if not user or user == "Guest":
        frappe.throw(_("Authentication required."), frappe.PermissionError)
    return user

def user_roles():
    user = current_user()
    return set(frappe.get_roles(user))

def require_any_role(*roles):
    actual = user_roles()
    if ROLE_ADMIN in actual:
        return
    if not actual.intersection(set(roles)):
        frappe.throw(_("You do not have permission for this FacilityOS action."), frappe.PermissionError)

def role_label():
    roles = user_roles()
    if ROLE_ADMIN in roles:
        return "admin"
    if ROLE_INVENTORY in roles:
        return "inventory"
    if ROLE_SHOPFLOOR in roles:
        return "shopfloor"
    if ROLE_MIS in roles:
        return "mis"
    return "unknown"

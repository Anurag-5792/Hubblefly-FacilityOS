import frappe
from facility_os.api.security import current_user, role_label, user_roles

@frappe.whitelist()
def me():
    user = current_user()
    return {
        "user": user,
        "full_name": frappe.utils.get_fullname(user),
        "role": role_label(),
        "roles": sorted(user_roles()),
    }

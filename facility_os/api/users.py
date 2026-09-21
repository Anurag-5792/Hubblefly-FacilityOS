import frappe

from facility_os.api.security import ROLE_ADMIN, require_any_role

FACILITY_ROLES = (
    "FacilityOS Inventory",
    "FacilityOS Shopfloor",
    "FacilityOS MIS",
    "FacilityOS Admin",
)


def _facility_roles(user):
    roles = set(frappe.get_roles(user))
    return [role for role in FACILITY_ROLES if role in roles]


@frappe.whitelist()
def list_users():
    require_any_role(ROLE_ADMIN)

    users = frappe.get_all(
        "User",
        filters={"enabled": 1, "user_type": "System User"},
        fields=["name", "full_name", "email", "last_login"],
        order_by="full_name asc",
        limit_page_length=200,
    )

    output = []
    for row in users:
        if row.name in ("Administrator", "Guest"):
            continue
        output.append({
            "user": row.name,
            "fullName": row.full_name or row.name,
            "email": row.email or row.name,
            "roles": _facility_roles(row.name),
            "lastLogin": str(row.last_login) if row.last_login else None,
        })

    return {"ok": True, "users": output, "availableRoles": list(FACILITY_ROLES)}


@frappe.whitelist(methods=["POST"])
def set_roles(user, roles):
    require_any_role(ROLE_ADMIN)

    if user in ("Administrator", "Guest"):
        frappe.throw("This user cannot be modified from FacilityOS.")

    if isinstance(roles, str):
        roles = frappe.parse_json(roles)

    requested = [role for role in (roles or []) if role in FACILITY_ROLES]
    if len(requested) != len(roles or []):
        frappe.throw("Only FacilityOS roles may be changed from this screen.")

    if not frappe.db.exists("User", user):
        frappe.throw("User not found.")

    doc = frappe.get_doc("User", user)
    existing_other_roles = [
        row.role for row in doc.roles
        if row.role not in FACILITY_ROLES
    ]

    doc.set("roles", [])
    for role in existing_other_roles + requested:
        doc.append("roles", {"role": role})

    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        "ok": True,
        "user": user,
        "roles": _facility_roles(user),
        "note": "Only FacilityOS role assignments were changed; unrelated Frappe/ERPNext roles were preserved.",
    }

import frappe

from facility_os import __version__
from facility_os.api.security import current_user

REQUIRED_DOCTYPES = (
    "Facility Position",
    "Facility Container",
    "Facility Physical Count Session",
    "Facility Validation Record",
    "Facility Sync State",
    "Facility Item Snapshot",
    "Facility Warehouse Snapshot",
    "Facility Stock Balance",
    "Facility Serial Snapshot",
    "Facility Batch Snapshot",
    "Facility Stock Movement Fact",
    "Facility Operational Audit",
    "Facility Label Registry",
    "Facility Traceability Exception",
    "Facility Route Card",
    "Facility Route Operation",
    "Facility Genealogy Event",
    "Facility Movement Document",
    "Facility Document Line",
    "Facility Print Job",
    "Facility Print Job Label",
)


@frappe.whitelist()
def check():
    user = current_user()
    missing = [doctype for doctype in REQUIRED_DOCTYPES if not frappe.db.exists("DocType", doctype)]
    return {
        "ok": len(missing) == 0,
        "version": __version__,
        "user": user,
        "ready": len(missing) == 0,
        "missingDoctypes": missing,
    }

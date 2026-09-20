import frappe
from frappe.utils import now_datetime, time_diff_in_seconds

from facility_os.api.security import ROLE_ADMIN, ROLE_MIS, require_any_role
from facility_os.sync import run_incremental_sync


def _rows():
    rows = frappe.get_all(
        "Facility Sync State",
        fields=[
            "projection",
            "status",
            "last_success_at",
            "last_attempt_at",
            "rows_processed",
            "error_summary",
        ],
        order_by="projection asc",
        limit_page_length=0,
    )

    now = now_datetime()
    output = []
    for row in rows:
        lag = None
        if row.last_success_at:
            lag = max(0, int(time_diff_in_seconds(now, row.last_success_at)))
        output.append({
            "projection": row.projection,
            "status": (row.status or "Pending").lower(),
            "lastSuccessAt": str(row.last_success_at) if row.last_success_at else None,
            "lagSeconds": lag,
            "rowsProcessed": int(row.rows_processed or 0),
            "note": row.error_summary or None,
        })
    return output


@frappe.whitelist()
def status():
    require_any_role(ROLE_MIS, ROLE_ADMIN)
    return {
        "ok": True,
        "source": "facilityos-read-model",
        "projections": _rows(),
    }


@frappe.whitelist(methods=["POST"])
def run():
    require_any_role(ROLE_ADMIN)
    run_incremental_sync()
    return {
        "ok": True,
        "source": "facilityos-read-model",
        "projections": _rows(),
    }

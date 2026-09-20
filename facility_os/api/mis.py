import json
from collections import defaultdict
from datetime import date, timedelta

import frappe
from facility_os.api.security import ROLE_ADMIN, ROLE_MIS, require_any_role


def _filters(value):
    if not value:
        return {}
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return {}
    return value


def _start_date(period):
    today = date.today()
    if period == "Today":
        return today
    if period == "7 Days":
        return today - timedelta(days=6)
    if period == "30 Days":
        return today - timedelta(days=29)
    return today - timedelta(days=29)


def _item_groups():
    return {
        row.item_code: row.item_group or "Unclassified"
        for row in frappe.get_all(
            "Facility Item Snapshot",
            fields=["item_code", "item_group"],
            limit_page_length=0,
        )
    }


def _sync_timestamp():
    rows = frappe.get_all(
        "Facility Sync State",
        filters={"status": "Healthy"},
        fields=["last_success_at"],
        order_by="last_success_at desc",
        limit_page_length=1,
    )
    return str(rows[0].last_success_at) if rows and rows[0].last_success_at else None


def _exception_counts(group_by, item_groups, warehouse_filter=None):
    output = defaultdict(float)
    sessions = {
        row.name: row.warehouse
        for row in frappe.get_all(
            "Facility Physical Count Session",
            fields=["name", "warehouse"],
            limit_page_length=0,
        )
    }
    lines = frappe.get_all(
        "Facility Physical Count Line",
        filters={"blocking_exception": 1},
        fields=["parent", "item_code"],
        limit_page_length=0,
    )
    for line in lines:
        warehouse = sessions.get(line.parent)
        if warehouse_filter and warehouse != warehouse_filter:
            continue
        if group_by == "Warehouse":
            label = warehouse or "Unassigned"
        else:
            label = item_groups.get(line.item_code, "Unclassified")
        output[label] += 1
    return output


@frappe.whitelist()
def query(filters=None, **kwargs):
    require_any_role(ROLE_MIS, ROLE_ADMIN)
    f = _filters(filters) or kwargs

    period = f.get("period") or "Today"
    company = f.get("company")
    warehouse = f.get("warehouse")
    metric = f.get("metric") or "Stock Qty"
    group_by = f.get("groupBy") or f.get("group_by") or "Item Group"

    if warehouse == "All Warehouses":
        warehouse = None

    item_groups = _item_groups()
    stock = defaultdict(float)
    moves = defaultdict(float)

    stock_filters = {}
    if company:
        stock_filters["company"] = company
    if warehouse:
        stock_filters["warehouse"] = warehouse

    for row in frappe.get_all(
        "Facility Stock Balance",
        filters=stock_filters,
        fields=["warehouse", "item_code", "actual_qty"],
        limit_page_length=0,
    ):
        label = row.warehouse if group_by == "Warehouse" else item_groups.get(row.item_code, "Unclassified")
        stock[label] += float(row.actual_qty or 0)

    movement_filters = [["posting_date", ">=", _start_date(period)]]
    if company:
        movement_filters.append(["company", "=", company])
    if warehouse:
        movement_filters.append(["warehouse", "=", warehouse])

    for row in frappe.get_all(
        "Facility Stock Movement Fact",
        filters=movement_filters,
        fields=["warehouse", "item_code", "voucher_type"],
        limit_page_length=0,
    ):
        if group_by == "Transaction Type":
            label = row.voucher_type or "Other"
        elif group_by == "Warehouse":
            label = row.warehouse or "Unassigned"
        else:
            label = item_groups.get(row.item_code, "Unclassified")
        moves[label] += 1

    exceptions = _exception_counts(group_by, item_groups, warehouse)

    labels = sorted(set(stock) | set(moves) | set(exceptions))
    rows = []
    for label in labels:
        stock_qty = stock.get(label, 0)
        move_count = moves.get(label, 0)
        exception_count = exceptions.get(label, 0)
        displayed = stock_qty if metric == "Stock Qty" else move_count if metric == "Moves" else exception_count
        rows.append({
            "label": label,
            "stock": stock_qty,
            "moves": move_count,
            "exceptions": exception_count,
            "displayed": displayed,
        })

    return {
        "rows": rows,
        "total": sum(row["displayed"] for row in rows),
        "last_synced_at": _sync_timestamp(),
        "query": {
            "period": period,
            "company": company,
            "warehouse": warehouse or "All Warehouses",
            "metric": metric,
            "groupBy": group_by,
        },
    }

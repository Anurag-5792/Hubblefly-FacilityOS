import frappe

from facility_os.api.security import ROLE_ADMIN, ROLE_SHOPFLOOR, require_any_role


def _event_payload(row):
    return {
        "id": row.name,
        "event": row.event_type,
        "parentId": row.parent_id,
        "childId": row.child_id,
        "replacementId": row.replacement_id or None,
        "routeCard": row.route_card or None,
        "operator": row.operator or None,
        "occurredAt": str(row.occurred_at) if row.occurred_at else None,
        "note": row.note or None,
    }


@frappe.whitelist()
def explore(entity_id, depth=3):
    require_any_role(ROLE_SHOPFLOOR, ROLE_ADMIN)

    root = (entity_id or "").strip().upper()
    if not root:
        frappe.throw("Entity ID is required.")

    depth = max(1, min(int(depth or 3), 5))
    frontier = {root}
    visited = {root}
    events = {}
    nodes = {root}

    for _ in range(depth):
        if not frontier or len(events) >= 200:
            break

        next_frontier = set()
        for entity in list(frontier):
            rows = frappe.get_all(
                "Facility Genealogy Event",
                or_filters=[
                    ["parent_id", "=", entity],
                    ["child_id", "=", entity],
                    ["replacement_id", "=", entity],
                ],
                fields=[
                    "name", "event_type", "parent_id", "child_id", "replacement_id",
                    "route_card", "operator", "occurred_at", "note",
                ],
                order_by="occurred_at asc",
                limit_page_length=200,
            )

            for row in rows:
                events[row.name] = row
                related = [row.parent_id, row.child_id, row.replacement_id]
                for value in related:
                    if value:
                        nodes.add(value)
                        if value not in visited:
                            visited.add(value)
                            next_frontier.add(value)

        frontier = next_frontier

    ordered = sorted(
        events.values(),
        key=lambda row: (str(row.occurred_at or ""), row.name),
    )

    return {
        "ok": True,
        "root": root,
        "depth": depth,
        "nodes": sorted(nodes),
        "events": [_event_payload(row) for row in ordered],
        "truncated": len(events) >= 200,
    }

# FacilityOS operational Holds — W0-09

Status: **IMPLEMENTED — TEST VERIFICATION PENDING**

A Hold is an explicit block on progression/action. W0-09 provides reusable Hold infrastructure;
it does not pre-populate a speculative catalogue beyond accepting validated hold-type codes.

## Model

`governance.hold` stores internal UUID, target resource, hold type, optional blocked action,
reason, placing human/time, Organisation/Legal Entity/Site scope, ACTIVE/RELEASED state, placement
and release Capabilities, whether approved release evidence is required, release evidence and
optimistic version.

A partial unique index can prohibit duplicate simultaneously ACTIVE Holds for the same
scope/resource/type/action identity.

`governance.hold_action` is immutable history. W0-09 records `HOLD_PLACED` and
`HOLD_RELEASED`; release never erases placement evidence.

## Enforcement

Future domain application services call `GovernancePolicyService.requireNoBlockingHoldWithin`
inside the same W0-03/W0-08 UnitOfWork before protected progression. UI banners are informational,
not enforcement.

The database blocking helper fails closed when the current runtime cannot access the supplied
scope. A Hold with no specific blocked action blocks all protected actions for the target; otherwise
it blocks the matching action.

## Place and release

Placement requires a direct scoped placement Capability. Release is explicit and requires the
Hold's frozen release Capability. `platform.superuser` alone is not accepted. If
`release_requires_approval=true`, the release function requires an APPROVED Approval Request for
the same Organisation and target resource before state can change.

Placement and release each create immutable Hold action history plus canonical Audit in the same
application transaction.

Concurrent release serializes on the Hold row. Once released, another release attempt cannot
rewrite the release. Command IDs provide retry/idempotency protection.

## Engineering and Quality boundary

There is deliberately no `admin override all Holds` mechanism. Engineering and Quality Holds
cannot be cleared merely for schedule convenience. Where technical acceptability is affected, the
domain policy must require the appropriate Engineering approval evidence and W0-09 can enforce that
approval reference at release.

## RLS

Hold and Hold-action tables use FORCE RLS. Runtime read visibility requires the direct placement or
release Capability in matching scope; mutations are exposed only through reviewed controlled
functions. Cross-Organisation access and history rewrite are denied.

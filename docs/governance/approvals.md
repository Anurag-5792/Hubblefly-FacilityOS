# FacilityOS Approval foundation — W0-09

Status: **IMPLEMENTED — TEST VERIFICATION PENDING**

W0-09 provides a reusable approval primitive. It does not implement Engineering Release, FG
Release, Dispatch Authorisation, NCR disposition, substitution, MRO Release or other complete
domain workflows.

## Request and decision are different records

`governance.approval_request` is current request state. It records resource/action, policy code,
requester, scope, request time, minimal lifecycle, required approval count, distinct-human rule,
self-approval rule, required Capability codes, request Capability and trace/idempotency context.

A request is not proof of approval.

`governance.approval_decision` is immutable evidence. W0-09 implements only `APPROVE` and
`REJECT`. Decisions cannot be updated/deleted. Reconsideration must create new governed history;
old rejection/approval evidence remains.

## Authorization and SoD

Approval requires both W0-07 application authorization and W0-09 policy satisfaction. The database
controlled decision function rechecks the exact required Capability and scope. A
`platform.superuser`-only grant is deliberately rejected for governance decisions.

Human identity is the immutable FacilityOS `iam.user_profile.id`. Multiple sessions and multiple
Role Assignments do not create multiple humans. When `require_distinct_humans=true`, the same
profile can never satisfy two people.

Self-approval is policy data. `self_approval_allowed=false` enforces requester != approver;
`true` permits self-approval only when the requester also has the required direct Capability.

Multi-approver foundation supports one or more approvals and one or more required Capability
codes without becoming a workflow engine. Every required Capability must appear in APPROVE
evidence and the required approval count must also be satisfied.

## Idempotency and concurrency

`command_id` is unique for request creation and decision submission. Same-command/same-logical
retry returns the existing result; conflicting reuse fails. Approval requests are locked
`FOR UPDATE` while deciding so concurrent decisions cannot overrun terminal state. Persistent
uniqueness prevents one person/capability from creating duplicate approval evidence.

A REJECT decision terminally marks the request REJECTED. An APPROVE marks it APPROVED only when
the frozen request policy has been satisfied.

## RLS and visibility

Approval tables use FORCE RLS. Requesters can read their request. Qualified approvers can read a
request only when their direct Capability and scope match its requirements. Decisions follow the
request visibility. Normal runtime has no direct INSERT/UPDATE/DELETE path for decisions.

## Adoption

A domain module must freeze its business-specific approval policy before creating a request:
requested action, request Capability, approval Capability(s), number of approvals, whether humans
must be distinct, self-approval rule and scope. Domain modules must not infer these rules from Role
names or UI state.

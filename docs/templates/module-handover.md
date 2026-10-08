# Module Handover — <canonical capability / module>

**Programme and module owner:**  
**Source repository/branch/commit SHA:**  
**Design/ADR/requirements and approval links:**  
**Maturity:** DESIGNED / PLANNED / IMPLEMENTED / TESTED / DEPLOYED / PRODUCTION VERIFIED / SUPERSEDED / BLOCKED  
**Evidence custodian, date, revision:**  

## 1. Product and operational purpose
- Product vision and role of this module:
- Customer/business problem; operational user pain and triggers:
- Capabilities, features, business value and KPIs:
- Actors, roles, responsibilities, approval authority:
- Normal end-to-end journey; alternate/exception lifecycles:
- Explicit in-scope, out-of-scope and edition/config boundaries:

## 2. System authority and architecture
- Authoritative data facts and owners, source-of-truth diagram:
- FacilityOS physical location/container/serial/batch truth:
- IQC Accepted/Rejected/Hold/Return, reservation, issue, consumption, count and exception states:
- ERPNext official stock ledger/valuation and API transactions; idempotency/reconciliation:
- Inward contracts, outward infrastructure, W0-03 UnitOfWork:
- API/command/query schema, events/jobs, external integrations:
- Database schema/migrations/generation, immutable evidence, transactional semantics:
- IAM/W0-07 capabilities, W0-08 RLS/FORCE RLS, SoD, security-negative threats:
- Legacy Frappe and source/path migration coexistence:

## 3. Developer reproduction
- Dependencies, Node/pnpm/lockfile and local environment:
- Secure local secrets/config and forbidden production targets:
- Install, build, typecheck, lint, test commands:
- Data fixture/sandbox and UAT setup:
- Acceptance criteria → unit/integration/security-negative/CI evidence links:
- Current exact source HEAD, tested merge SHA, required workflow IDs/conclusions:

## 4. Operating, support and release
- Deployment topology and boundaries (verified versus unverified):
- Configuration flags and application/schema/ERP API/message compatibility:
- Logs, monitoring, alerts, expected SLOs, health, troubleshooting:
- Failure/retry/reconciliation, incident runbooks, support contacts:
- Backup/PITR, verified restore evidence, RPO/RTO; rollback/compensation:
- Release and authorisation chain; operator vs MASTER decision:
- Known limitations, open incidents, data quality, security risks:

## 5. Decisions, maturity and handover acceptance
- ADR decisions PROPOSED / ACCEPTED / REJECTED / SUPERSEDED, links and trade-offs:
- Open/blocked prerequisites, owner and due criteria:
- Superseded behaviour and preserved audit/evidence:
- Implementer, independent specialist reviewer chat ID, MASTER final exact-SHA decision:
- Incoming independent-team walkthrough: build/test/operate/recover/extend without prior chats:
- Sign-off evidence (not a claim of deployment/PRODUCTION VERIFIED):

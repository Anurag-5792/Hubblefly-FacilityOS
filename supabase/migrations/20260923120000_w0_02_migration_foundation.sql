-- W0-02 infrastructure-only migration marker.
--
-- Purpose:
--   Prove deterministic Supabase CLI SQL migration discovery, ordering, application,
--   reset and replay without introducing FacilityOS business-domain tables.
--
-- Schema authority is supabase/migrations/*.sql.
-- Do not add Organisation, RBAC, Inventory, Manufacturing, Audit, ERP Reference,
-- Outbox or other business-domain objects in this W0-02 migration.

select 1;

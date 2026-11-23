-- HFT-R1; PostgreSQL >=15; isolated nonproduction only. Forward-only migration.
BEGIN;
CREATE SCHEMA IF NOT EXISTS hft;
CREATE TABLE hft.schema_revision (
  version integer PRIMARY KEY CHECK (version > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL
);
CREATE TABLE hft.legal_entity (
  id text PRIMARY KEY CHECK (id ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  name text NOT NULL, active boolean NOT NULL DEFAULT true, version bigint NOT NULL DEFAULT 1
);
CREATE TABLE hft.site (
  legal_entity_id text NOT NULL REFERENCES hft.legal_entity(id),
  id text NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (legal_entity_id,id)
);
CREATE TABLE hft.employee (
  legal_entity_id text NOT NULL, employee_id text NOT NULL,
  site_id text NOT NULL, full_name text NOT NULL CHECK(length(trim(full_name))>0),
  department text NOT NULL, designation text NOT NULL,
  active boolean NOT NULL, version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(legal_entity_id,employee_id),
  FOREIGN KEY(legal_entity_id,site_id) REFERENCES hft.site(legal_entity_id,id)
);
CREATE TABLE hft.employee_revision (
  legal_entity_id text NOT NULL, employee_id text NOT NULL, version bigint NOT NULL,
  snapshot jsonb NOT NULL, actor_subject text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(legal_entity_id,employee_id,version),
  FOREIGN KEY(legal_entity_id,employee_id) REFERENCES hft.employee(legal_entity_id,employee_id)
);
CREATE TABLE hft.item (
  legal_entity_id text NOT NULL REFERENCES hft.legal_entity(id),
  item_code text NOT NULL, uom text NOT NULL, control_type text NOT NULL CHECK(control_type IN ('NONE','SERIAL','BATCH')),
  active boolean NOT NULL DEFAULT true, version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  PRIMARY KEY(legal_entity_id,item_code)
);
CREATE TABLE hft.supplier (
  legal_entity_id text NOT NULL REFERENCES hft.legal_entity(id),
  supplier_id text NOT NULL, legal_name text NOT NULL, active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  PRIMARY KEY(legal_entity_id,supplier_id)
);
CREATE TABLE hft.warehouse (
  legal_entity_id text NOT NULL, warehouse_id text NOT NULL, site_id text NOT NULL,
  name text NOT NULL, active boolean NOT NULL DEFAULT true, version bigint NOT NULL DEFAULT 1,
  PRIMARY KEY(legal_entity_id,warehouse_id),
  FOREIGN KEY(legal_entity_id,site_id) REFERENCES hft.site(legal_entity_id,id)
);
CREATE TABLE hft.location (
  legal_entity_id text NOT NULL, warehouse_id text NOT NULL,
  location_id text NOT NULL, parent_location_id text,
  active boolean NOT NULL DEFAULT true, version bigint NOT NULL DEFAULT 1,
  PRIMARY KEY(legal_entity_id,warehouse_id,location_id),
  FOREIGN KEY(legal_entity_id,warehouse_id) REFERENCES hft.warehouse(legal_entity_id,warehouse_id),
  FOREIGN KEY(legal_entity_id,warehouse_id,parent_location_id) REFERENCES hft.location(legal_entity_id,warehouse_id,location_id)
);
CREATE TABLE hft.employee_import_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id text NOT NULL REFERENCES hft.legal_entity(id),
  file_sha256 text NOT NULL CHECK(file_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK(status IN ('STAGED','VALIDATED','REJECTED','APPROVED','APPLIED')),
  row_count integer NOT NULL CHECK(row_count>=0),
  prepared_by text NOT NULL, approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(legal_entity_id,file_sha256)
);
COMMIT;

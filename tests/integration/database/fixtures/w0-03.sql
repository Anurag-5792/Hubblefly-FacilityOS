-- W0-03 temporary PostgreSQL fixture.
-- This is TEST INFRASTRUCTURE ONLY and is never part of the Supabase migration chain.
-- TEMP tables disappear when the single test pool session closes.

create temporary table w0_03_records (
  id text primary key,
  name text not null unique,
  value text not null,
  version integer not null default 1 check (version > 0)
) on commit preserve rows;

create temporary table w0_03_side_effects (
  id text primary key,
  record_id text not null references w0_03_records(id),
  note text not null
) on commit preserve rows;

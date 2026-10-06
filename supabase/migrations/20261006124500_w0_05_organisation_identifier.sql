-- W0-05: Organisation / Legal Entity / Site / Identifier foundation.
-- Business-domain scope is intentionally limited to the core organisational foundation.
-- ERP Company/Warehouse mappings, IAM/RLS, business documents and legacy migration are out of scope.

create schema if not exists core;

create table core.organisation (
  id uuid primary key,
  code text not null,
  name text not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE')),
  version bigint not null default 0
    check (version >= 0),
  created_at timestamptz not null,
  created_actor_type text not null
    check (created_actor_type in ('HUMAN', 'SERVICE', 'SYSTEM', 'MIGRATION')),
  created_actor_id text not null,
  updated_at timestamptz not null,
  updated_actor_type text not null
    check (updated_actor_type in ('HUMAN', 'SERVICE', 'SYSTEM', 'MIGRATION')),
  updated_actor_id text not null,
  constraint organisation_code_format check (code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  constraint organisation_name_length check (char_length(btrim(name)) between 2 and 200),
  constraint organisation_actor_length check (
    char_length(created_actor_id) between 1 and 128
    and char_length(updated_actor_id) between 1 and 128
  ),
  constraint organisation_id_scope_unique unique (id)
);

create unique index organisation_code_unique
  on core.organisation (code);
create unique index organisation_name_unique_ci
  on core.organisation (lower(btrim(name)));
create index organisation_status_idx
  on core.organisation (status, id);

create table core.legal_entity (
  id uuid primary key,
  organisation_id uuid not null,
  code text not null,
  legal_name text not null,
  display_name text null,
  country_code text null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE')),
  version bigint not null default 0
    check (version >= 0),
  created_at timestamptz not null,
  created_actor_type text not null
    check (created_actor_type in ('HUMAN', 'SERVICE', 'SYSTEM', 'MIGRATION')),
  created_actor_id text not null,
  updated_at timestamptz not null,
  updated_actor_type text not null
    check (updated_actor_type in ('HUMAN', 'SERVICE', 'SYSTEM', 'MIGRATION')),
  updated_actor_id text not null,
  constraint legal_entity_organisation_fk
    foreign key (organisation_id) references core.organisation(id) on delete restrict,
  constraint legal_entity_code_format check (code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  constraint legal_entity_legal_name_length check (char_length(btrim(legal_name)) between 2 and 200),
  constraint legal_entity_display_name_length check (
    display_name is null or char_length(btrim(display_name)) between 1 and 120
  ),
  constraint legal_entity_country_code_format check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  ),
  constraint legal_entity_actor_length check (
    char_length(created_actor_id) between 1 and 128
    and char_length(updated_actor_id) between 1 and 128
  ),
  constraint legal_entity_id_organisation_unique unique (id, organisation_id),
  constraint legal_entity_code_scope_unique unique (organisation_id, code)
);

create unique index legal_entity_legal_name_unique_ci
  on core.legal_entity (organisation_id, lower(btrim(legal_name)));
create index legal_entity_organisation_status_idx
  on core.legal_entity (organisation_id, status, id);

create table core.site (
  id uuid primary key,
  organisation_id uuid not null,
  code text not null,
  name text not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE')),
  version bigint not null default 0
    check (version >= 0),
  created_at timestamptz not null,
  created_actor_type text not null
    check (created_actor_type in ('HUMAN', 'SERVICE', 'SYSTEM', 'MIGRATION')),
  created_actor_id text not null,
  updated_at timestamptz not null,
  updated_actor_type text not null
    check (updated_actor_type in ('HUMAN', 'SERVICE', 'SYSTEM', 'MIGRATION')),
  updated_actor_id text not null,
  constraint site_organisation_fk
    foreign key (organisation_id) references core.organisation(id) on delete restrict,
  constraint site_code_format check (code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  constraint site_name_length check (char_length(btrim(name)) between 2 and 200),
  constraint site_actor_length check (
    char_length(created_actor_id) between 1 and 128
    and char_length(updated_actor_id) between 1 and 128
  ),
  constraint site_id_organisation_unique unique (id, organisation_id),
  constraint site_code_scope_unique unique (organisation_id, code)
);

create unique index site_name_unique_ci
  on core.site (organisation_id, lower(btrim(name)));
create index site_organisation_status_idx
  on core.site (organisation_id, status, id);

create table core.site_legal_entity (
  id uuid primary key,
  organisation_id uuid not null,
  site_id uuid not null,
  legal_entity_id uuid not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE')),
  version bigint not null default 0
    check (version >= 0),
  created_at timestamptz not null,
  created_actor_type text not null
    check (created_actor_type in ('HUMAN', 'SERVICE', 'SYSTEM', 'MIGRATION')),
  created_actor_id text not null,
  updated_at timestamptz not null,
  updated_actor_type text not null
    check (updated_actor_type in ('HUMAN', 'SERVICE', 'SYSTEM', 'MIGRATION')),
  updated_actor_id text not null,
  constraint site_legal_entity_site_scope_fk
    foreign key (site_id, organisation_id)
    references core.site(id, organisation_id) on delete restrict,
  constraint site_legal_entity_legal_scope_fk
    foreign key (legal_entity_id, organisation_id)
    references core.legal_entity(id, organisation_id) on delete restrict,
  constraint site_legal_entity_scope_unique unique (site_id, legal_entity_id),
  constraint site_legal_entity_actor_length check (
    char_length(created_actor_id) between 1 and 128
    and char_length(updated_actor_id) between 1 and 128
  )
);

create index site_legal_entity_legal_idx
  on core.site_legal_entity (legal_entity_id, status, site_id);
create index site_legal_entity_site_idx
  on core.site_legal_entity (site_id, status, legal_entity_id);

create table core.identifier_series (
  id uuid primary key,
  organisation_id uuid not null,
  series_key text not null,
  description text null,
  format_template text not null,
  sequence_width smallint not null,
  scope_legal_entity boolean not null default false,
  scope_site boolean not null default false,
  requires_period boolean not null default false,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE')),
  version bigint not null default 0
    check (version >= 0),
  created_at timestamptz not null,
  created_actor_type text not null
    check (created_actor_type in ('HUMAN', 'SERVICE', 'SYSTEM', 'MIGRATION')),
  created_actor_id text not null,
  updated_at timestamptz not null,
  updated_actor_type text not null
    check (updated_actor_type in ('HUMAN', 'SERVICE', 'SYSTEM', 'MIGRATION')),
  updated_actor_id text not null,
  constraint identifier_series_organisation_fk
    foreign key (organisation_id) references core.organisation(id) on delete restrict,
  constraint identifier_series_key_format check (
    series_key ~ '^[a-z][a-z0-9._-]{0,79}$'
  ),
  constraint identifier_series_description_length check (
    description is null or char_length(btrim(description)) between 1 and 240
  ),
  constraint identifier_series_template_length check (
    char_length(format_template) between 5 and 120
  ),
  constraint identifier_series_sequence_width check (
    sequence_width between 1 and 12
  ),
  constraint identifier_series_sequence_token check (
    position('{sequence}' in format_template) > 0
  ),
  constraint identifier_series_period_token check (
    (requires_period and position('{period}' in format_template) > 0)
    or
    (not requires_period and position('{period}' in format_template) = 0)
  ),
  constraint identifier_series_actor_length check (
    char_length(created_actor_id) between 1 and 128
    and char_length(updated_actor_id) between 1 and 128
  ),
  constraint identifier_series_id_organisation_unique unique (id, organisation_id),
  constraint identifier_series_key_scope_unique unique (organisation_id, series_key)
);

create index identifier_series_active_lookup_idx
  on core.identifier_series (organisation_id, status, series_key);

create table core.identifier_sequence (
  id uuid primary key,
  series_id uuid not null,
  organisation_id uuid not null,
  legal_entity_id uuid null,
  site_id uuid null,
  period_key text null,
  period_token text null,
  next_value bigint not null default 1
    check (next_value > 0),
  version bigint not null default 0
    check (version >= 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_actor_type text not null
    check (updated_actor_type in ('HUMAN', 'SERVICE', 'SYSTEM', 'MIGRATION')),
  updated_actor_id text not null,
  constraint identifier_sequence_series_scope_fk
    foreign key (series_id, organisation_id)
    references core.identifier_series(id, organisation_id) on delete restrict,
  constraint identifier_sequence_legal_scope_fk
    foreign key (legal_entity_id, organisation_id)
    references core.legal_entity(id, organisation_id) on delete restrict,
  constraint identifier_sequence_site_scope_fk
    foreign key (site_id, organisation_id)
    references core.site(id, organisation_id) on delete restrict,
  constraint identifier_sequence_period_pair check (
    (period_key is null and period_token is null)
    or
    (period_key is not null and period_token is not null)
  ),
  constraint identifier_sequence_period_key_format check (
    period_key is null or period_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,31}$'
  ),
  constraint identifier_sequence_period_token_format check (
    period_token is null or period_token ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,15}$'
  ),
  constraint identifier_sequence_actor_length check (
    char_length(updated_actor_id) between 1 and 128
  ),
  constraint identifier_sequence_scope_unique
    unique nulls not distinct
    (series_id, organisation_id, legal_entity_id, site_id, period_key)
);

create index identifier_sequence_series_idx
  on core.identifier_sequence (series_id, organisation_id);

create table core.identifier_allocation (
  id uuid primary key,
  series_id uuid not null,
  sequence_id uuid not null,
  organisation_id uuid not null,
  legal_entity_id uuid null,
  site_id uuid null,
  period_key text null,
  period_token text null,
  sequence_value bigint not null
    check (sequence_value > 0),
  identifier_value text not null,
  allocated_at timestamptz not null,
  allocated_actor_type text not null
    check (allocated_actor_type in ('HUMAN', 'SERVICE', 'SYSTEM', 'MIGRATION')),
  allocated_actor_id text not null,
  request_id text not null,
  command_id uuid not null,
  correlation_id uuid not null,
  causation_id uuid null,
  constraint identifier_allocation_series_scope_fk
    foreign key (series_id, organisation_id)
    references core.identifier_series(id, organisation_id) on delete restrict,
  constraint identifier_allocation_sequence_fk
    foreign key (sequence_id) references core.identifier_sequence(id) on delete restrict,
  constraint identifier_allocation_legal_scope_fk
    foreign key (legal_entity_id, organisation_id)
    references core.legal_entity(id, organisation_id) on delete restrict,
  constraint identifier_allocation_site_scope_fk
    foreign key (site_id, organisation_id)
    references core.site(id, organisation_id) on delete restrict,
  constraint identifier_allocation_period_pair check (
    (period_key is null and period_token is null)
    or
    (period_key is not null and period_token is not null)
  ),
  constraint identifier_allocation_identifier_length check (
    char_length(identifier_value) between 1 and 160
  ),
  constraint identifier_allocation_actor_length check (
    char_length(allocated_actor_id) between 1 and 128
  ),
  constraint identifier_allocation_request_length check (
    char_length(request_id) between 1 and 128
  ),
  constraint identifier_allocation_sequence_value_unique
    unique (sequence_id, sequence_value),
  constraint identifier_allocation_value_scope_unique
    unique (organisation_id, identifier_value)
);

create index identifier_allocation_series_time_idx
  on core.identifier_allocation (series_id, allocated_at desc, id);
create index identifier_allocation_correlation_idx
  on core.identifier_allocation (correlation_id, allocated_at desc);

create or replace function core.reject_identifier_allocation_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'identifier allocations are immutable after commit'
    using errcode = '55000';
end;
$$;

create trigger identifier_allocation_immutable_update
before update on core.identifier_allocation
for each row execute function core.reject_identifier_allocation_mutation();

create trigger identifier_allocation_immutable_delete
before delete on core.identifier_allocation
for each row execute function core.reject_identifier_allocation_mutation();

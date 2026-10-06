-- W0-07: FacilityOS roles, capabilities and scoped application authorization foundation.
-- W0-08 owns production RLS/runtime DB-role enforcement. W0-09 owns approvals and holds.

create table iam.role (
  id uuid primary key,
  code text not null,
  display_name text not null,
  description text null,
  kind text not null default 'CUSTOM'
    check (kind in ('SYSTEM', 'CUSTOM')),
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
  constraint role_code_format check (code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  constraint role_display_name_length check (char_length(btrim(display_name)) between 2 and 120),
  constraint role_description_length check (
    description is null or char_length(btrim(description)) between 1 and 500
  ),
  constraint role_actor_length check (
    char_length(created_actor_id) between 1 and 128
    and char_length(updated_actor_id) between 1 and 128
  ),
  constraint role_code_unique unique (code)
);

create index role_status_idx on iam.role (status, id);

create table iam.capability (
  id uuid primary key,
  code text not null,
  display_name text not null,
  description text null,
  kind text not null default 'SYSTEM'
    check (kind in ('SYSTEM', 'CUSTOM')),
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
  constraint capability_code_format check (
    code ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
    and char_length(code) <= 160
  ),
  constraint capability_display_name_length check (char_length(btrim(display_name)) between 2 and 160),
  constraint capability_description_length check (
    description is null or char_length(btrim(description)) between 1 and 500
  ),
  constraint capability_actor_length check (
    char_length(created_actor_id) between 1 and 128
    and char_length(updated_actor_id) between 1 and 128
  ),
  constraint capability_code_unique unique (code)
);

create index capability_status_code_idx on iam.capability (status, code);

create table iam.role_capability (
  id uuid primary key,
  role_id uuid not null,
  capability_id uuid not null,
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
  constraint role_capability_role_fk
    foreign key (role_id) references iam.role(id) on delete restrict,
  constraint role_capability_capability_fk
    foreign key (capability_id) references iam.capability(id) on delete restrict,
  constraint role_capability_pair_unique unique (role_id, capability_id),
  constraint role_capability_actor_length check (
    char_length(created_actor_id) between 1 and 128
    and char_length(updated_actor_id) between 1 and 128
  )
);

create index role_capability_role_status_idx
  on iam.role_capability (role_id, status, capability_id);
create index role_capability_capability_idx
  on iam.role_capability (capability_id, role_id);

create table iam.role_assignment (
  id uuid primary key,
  user_profile_id uuid not null,
  role_id uuid not null,
  organisation_id uuid not null,
  legal_entity_id uuid null,
  site_id uuid null,
  scope_level text not null
    check (scope_level in ('ORGANISATION', 'LEGAL_ENTITY', 'SITE')),
  valid_from timestamptz not null,
  valid_until timestamptz null,
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
  constraint role_assignment_user_fk
    foreign key (user_profile_id) references iam.user_profile(id) on delete restrict,
  constraint role_assignment_role_fk
    foreign key (role_id) references iam.role(id) on delete restrict,
  constraint role_assignment_organisation_fk
    foreign key (organisation_id) references core.organisation(id) on delete restrict,
  constraint role_assignment_legal_scope_fk
    foreign key (legal_entity_id, organisation_id)
    references core.legal_entity(id, organisation_id) on delete restrict,
  constraint role_assignment_site_scope_fk
    foreign key (site_id, organisation_id)
    references core.site(id, organisation_id) on delete restrict,
  constraint role_assignment_site_legal_pair_fk
    foreign key (site_id, legal_entity_id)
    references core.site_legal_entity(site_id, legal_entity_id) on delete restrict,
  constraint role_assignment_scope_shape check (
    (scope_level = 'ORGANISATION' and legal_entity_id is null and site_id is null)
    or
    (scope_level = 'LEGAL_ENTITY' and legal_entity_id is not null and site_id is null)
    or
    (scope_level = 'SITE' and site_id is not null)
  ),
  constraint role_assignment_validity check (
    valid_until is null or valid_until > valid_from
  ),
  constraint role_assignment_actor_length check (
    char_length(created_actor_id) between 1 and 128
    and char_length(updated_actor_id) between 1 and 128
  ),
  constraint role_assignment_exact_duplicate_unique
    unique nulls not distinct
    (user_profile_id, role_id, organisation_id, legal_entity_id, site_id, valid_from, valid_until)
);

create index role_assignment_user_time_idx
  on iam.role_assignment (user_profile_id, status, valid_from, valid_until, id);
create index role_assignment_scope_idx
  on iam.role_assignment (organisation_id, legal_entity_id, site_id, status, user_profile_id);
create index role_assignment_role_idx
  on iam.role_assignment (role_id, status, user_profile_id);

create or replace function iam.reject_authorization_code_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.code is distinct from old.code then
    raise exception 'Authorization codes are immutable after creation'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger role_code_immutable
before update of code on iam.role
for each row execute function iam.reject_authorization_code_mutation();

create trigger capability_code_immutable
before update of code on iam.capability
for each row execute function iam.reject_authorization_code_mutation();

comment on table iam.role is
  'Named capability bundle. Role names are not authorization decisions by themselves.';
comment on table iam.capability is
  'Stable machine-readable FacilityOS application capability registry.';
comment on table iam.role_assignment is
  'Explicit user-to-role assignment scoped to Organisation, Legal Entity and/or Site with validity.';
comment on column iam.role_assignment.site_id is
  'A Site is physical scope only. Site-only assignments do not imply Legal Entity authority.';

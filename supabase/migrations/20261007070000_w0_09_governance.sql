-- W0-09: immutable canonical Audit, Approval and Hold governance foundation.
-- TECHNICAL REFINEMENT — BUSINESS ARCHITECTURE UNCHANGED:
-- the Physical Schema Blueprint did not previously reserve a physical namespace for cross-cutting
-- governance records, so W0-09 uses the private "governance" schema. It remains outside Data API.

create schema if not exists governance authorization postgres;

revoke all on schema governance from public, anon, authenticated, service_role;
revoke all privileges on all tables in schema governance
  from public, anon, authenticated, service_role, facilityos_user_runtime, facilityos_security_admin;
grant usage on schema governance to facilityos_user_runtime, facilityos_security_admin;

-- Minimal W0-09 capability registry. No Role is implicitly granted any capability.
insert into iam.capability (
  id, code, display_name, description, kind, status, version,
  created_at, created_actor_type, created_actor_id,
  updated_at, updated_actor_type, updated_actor_id
) values
  ('90000000-0000-4000-8000-000000000001','governance.audit.read','Read canonical audit','Read canonical operational audit evidence within authorised scope.','SYSTEM','ACTIVE',0,statement_timestamp(),'MIGRATION','w0-09',statement_timestamp(),'MIGRATION','w0-09'),
  ('90000000-0000-4000-8000-000000000002','governance.approval.request','Request approval','Create a governed approval request within authorised scope.','SYSTEM','ACTIVE',0,statement_timestamp(),'MIGRATION','w0-09',statement_timestamp(),'MIGRATION','w0-09'),
  ('90000000-0000-4000-8000-000000000003','governance.approval.decide','Decide approval','Approve or reject a governed approval request within authorised scope.','SYSTEM','ACTIVE',0,statement_timestamp(),'MIGRATION','w0-09',statement_timestamp(),'MIGRATION','w0-09'),
  ('90000000-0000-4000-8000-000000000004','governance.hold.place','Place hold','Place an operational Hold within authorised scope.','SYSTEM','ACTIVE',0,statement_timestamp(),'MIGRATION','w0-09',statement_timestamp(),'MIGRATION','w0-09'),
  ('90000000-0000-4000-8000-000000000005','governance.hold.release','Release hold','Release an operational Hold within authorised scope.','SYSTEM','ACTIVE',0,statement_timestamp(),'MIGRATION','w0-09',statement_timestamp(),'MIGRATION','w0-09')
on conflict (code) do nothing;

create or replace function governance.valid_code(p_value text, p_max integer default 160)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_value is not null
     and char_length(p_value) between 1 and p_max
     and p_value ~ '^[A-Za-z][A-Za-z0-9_.:-]*$';
$$;

create or replace function governance.valid_resource_type(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_value is not null
     and char_length(p_value) between 1 and 80
     and p_value ~ '^[a-z][a-z0-9._-]*$';
$$;

create or replace function governance.unique_safe_codes(p_values text[])
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_value text;
  v_distinct integer;
begin
  if p_values is null or cardinality(p_values) < 1 or cardinality(p_values) > 8 then
    return false;
  end if;
  foreach v_value in array p_values loop
    if not governance.valid_code(v_value, 160) then return false; end if;
  end loop;
  select count(distinct x) into v_distinct from unnest(p_values) as x;
  return v_distinct = cardinality(p_values);
end;
$$;

create or replace function governance.audit_metadata_is_safe(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_key text;
  v_child jsonb;
  v_text text;
begin
  if p_value is null then return true; end if;

  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in select key, value from jsonb_each(p_value)
    loop
      if v_key ~* '(password|passwd|token|secret|cookie|credential|authorization|api[_-]?key|session[_-]?key)' then
        return false;
      end if;
      if not governance.audit_metadata_is_safe(v_child) then return false; end if;
    end loop;
    return true;
  end if;

  if jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value)
    loop
      if not governance.audit_metadata_is_safe(v_child) then return false; end if;
    end loop;
    return true;
  end if;

  if jsonb_typeof(p_value) = 'string' then
    v_text := trim(both '"' from p_value::text);
    if v_text ~* '^Bearer[[:space:]]+[A-Za-z0-9._~+/-]+={0,2}$'
       or v_text ~ '^eyJ[A-Za-z0-9._-]{20,}$'
       or v_text ~* '^postgres(?:ql)?://[^[:space:]]+:[^[:space:]]+@' then
      return false;
    end if;
  end if;

  return true;
end;
$$;

create table governance.audit_event (
  id uuid primary key,
  event_type text not null,
  event_version integer not null check (event_version > 0),
  recorded_at timestamptz not null,
  occurred_at timestamptz not null,
  actor_type text not null check (actor_type in ('HUMAN','SERVICE','SYSTEM','MIGRATION')),
  actor_id text not null check (char_length(actor_id) between 1 and 128),
  authenticated_user_id uuid null,
  authorizing_capability text null,
  request_id text not null,
  command_id uuid null,
  correlation_id uuid not null,
  causation_id uuid null,
  organisation_id uuid not null,
  legal_entity_id uuid null,
  site_id uuid null,
  resource_type text not null,
  resource_id uuid not null,
  action text not null,
  outcome text not null,
  metadata jsonb not null default '{}'::jsonb,
  source_module text not null,
  reason text null,
  creation_txid text not null,
  constraint audit_event_user_fk foreign key (authenticated_user_id)
    references iam.user_profile(id) on delete restrict,
  constraint audit_event_organisation_fk foreign key (organisation_id)
    references core.organisation(id) on delete restrict,
  constraint audit_event_legal_scope_fk foreign key (legal_entity_id, organisation_id)
    references core.legal_entity(id, organisation_id) on delete restrict,
  constraint audit_event_site_scope_fk foreign key (site_id, organisation_id)
    references core.site(id, organisation_id) on delete restrict,
  constraint audit_event_site_legal_pair_fk foreign key (site_id, legal_entity_id)
    references core.site_legal_entity(site_id, legal_entity_id) on delete restrict,
  constraint audit_event_type_format check (governance.valid_code(event_type,100)),
  constraint audit_event_action_format check (governance.valid_code(action,100)),
  constraint audit_event_outcome_format check (governance.valid_code(outcome,100)),
  constraint audit_event_source_format check (governance.valid_code(source_module,100)),
  constraint audit_event_resource_type check (governance.valid_resource_type(resource_type)),
  constraint audit_event_request_id check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  constraint audit_event_capability_format check (
    authorizing_capability is null or governance.valid_code(authorizing_capability,160)
  ),
  constraint audit_event_reason_length check (
    reason is null or char_length(btrim(reason)) between 1 and 2000
  ),
  constraint audit_event_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint audit_event_metadata_size check (octet_length(metadata::text) <= 32768),
  constraint audit_event_metadata_safe check (governance.audit_metadata_is_safe(metadata))
);

create index audit_event_resource_idx
  on governance.audit_event (organisation_id, resource_type, resource_id, recorded_at desc, id);
create index audit_event_correlation_idx
  on governance.audit_event (correlation_id, recorded_at desc, id);
create index audit_event_request_idx
  on governance.audit_event (request_id, recorded_at desc, id);
create index audit_event_scope_idx
  on governance.audit_event (organisation_id, legal_entity_id, site_id, recorded_at desc, id);

create table governance.approval_request (
  id uuid primary key,
  resource_type text not null,
  resource_id uuid not null,
  requested_action text not null,
  policy_code text not null,
  requester_user_id uuid not null,
  requested_at timestamptz not null,
  organisation_id uuid not null,
  legal_entity_id uuid null,
  site_id uuid null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  required_approval_count smallint not null check (required_approval_count between 1 and 8),
  require_distinct_humans boolean not null default false,
  self_approval_allowed boolean not null default false,
  required_capability_codes text[] not null,
  request_capability_code text not null,
  request_id text not null,
  command_id uuid not null,
  correlation_id uuid not null,
  causation_id uuid null,
  version bigint not null default 0 check (version >= 0),
  constraint approval_request_requester_fk foreign key (requester_user_id)
    references iam.user_profile(id) on delete restrict,
  constraint approval_request_organisation_fk foreign key (organisation_id)
    references core.organisation(id) on delete restrict,
  constraint approval_request_legal_scope_fk foreign key (legal_entity_id, organisation_id)
    references core.legal_entity(id, organisation_id) on delete restrict,
  constraint approval_request_site_scope_fk foreign key (site_id, organisation_id)
    references core.site(id, organisation_id) on delete restrict,
  constraint approval_request_site_legal_pair_fk foreign key (site_id, legal_entity_id)
    references core.site_legal_entity(site_id, legal_entity_id) on delete restrict,
  constraint approval_request_resource_type check (governance.valid_resource_type(resource_type)),
  constraint approval_request_action_format check (governance.valid_code(requested_action,100)),
  constraint approval_request_policy_format check (governance.valid_code(policy_code,100)),
  constraint approval_request_request_capability check (governance.valid_code(request_capability_code,160)),
  constraint approval_request_required_caps check (governance.unique_safe_codes(required_capability_codes)),
  constraint approval_request_count_covers_caps check (
    required_approval_count >= cardinality(required_capability_codes)
  ),
  constraint approval_request_request_id_format check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  constraint approval_request_command_unique unique (command_id)
);

create index approval_request_target_idx
  on governance.approval_request (organisation_id, resource_type, resource_id, requested_at desc, id);
create index approval_request_pending_idx
  on governance.approval_request (organisation_id, legal_entity_id, site_id, requested_at, id)
  where status = 'PENDING';

create table governance.approval_decision (
  id uuid primary key,
  approval_request_id uuid not null,
  approver_user_id uuid not null,
  decision text not null check (decision in ('APPROVE','REJECT')),
  capability_code text not null,
  decided_at timestamptz not null,
  reason text null,
  organisation_id uuid not null,
  legal_entity_id uuid null,
  site_id uuid null,
  request_id text not null,
  command_id uuid not null,
  correlation_id uuid not null,
  causation_id uuid null,
  constraint approval_decision_request_fk foreign key (approval_request_id)
    references governance.approval_request(id) on delete restrict,
  constraint approval_decision_approver_fk foreign key (approver_user_id)
    references iam.user_profile(id) on delete restrict,
  constraint approval_decision_organisation_fk foreign key (organisation_id)
    references core.organisation(id) on delete restrict,
  constraint approval_decision_legal_scope_fk foreign key (legal_entity_id, organisation_id)
    references core.legal_entity(id, organisation_id) on delete restrict,
  constraint approval_decision_site_scope_fk foreign key (site_id, organisation_id)
    references core.site(id, organisation_id) on delete restrict,
  constraint approval_decision_site_legal_pair_fk foreign key (site_id, legal_entity_id)
    references core.site_legal_entity(site_id, legal_entity_id) on delete restrict,
  constraint approval_decision_capability_format check (governance.valid_code(capability_code,160)),
  constraint approval_decision_reason_length check (
    reason is null or char_length(btrim(reason)) between 1 and 2000
  ),
  constraint approval_decision_request_id_format check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  constraint approval_decision_command_unique unique (command_id),
  constraint approval_decision_person_capability_unique
    unique (approval_request_id, approver_user_id, capability_code)
);

create index approval_decision_request_idx
  on governance.approval_decision (approval_request_id, decided_at, id);
create index approval_decision_scope_idx
  on governance.approval_decision (organisation_id, legal_entity_id, site_id, decided_at desc, id);

create table governance.hold (
  id uuid primary key,
  resource_type text not null,
  resource_id uuid not null,
  hold_type text not null,
  blocked_action text null,
  reason text not null,
  placed_by_user_id uuid not null,
  placed_at timestamptz not null,
  organisation_id uuid not null,
  legal_entity_id uuid null,
  site_id uuid null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RELEASED')),
  release_capability_code text not null,
  release_requires_approval boolean not null default false,
  released_by_user_id uuid null,
  released_at timestamptz null,
  release_reason text null,
  release_approval_request_id uuid null,
  placement_capability_code text not null,
  placement_command_id uuid not null,
  version bigint not null default 0 check (version >= 0),
  constraint hold_placer_fk foreign key (placed_by_user_id)
    references iam.user_profile(id) on delete restrict,
  constraint hold_releaser_fk foreign key (released_by_user_id)
    references iam.user_profile(id) on delete restrict,
  constraint hold_release_approval_fk foreign key (release_approval_request_id)
    references governance.approval_request(id) on delete restrict,
  constraint hold_organisation_fk foreign key (organisation_id)
    references core.organisation(id) on delete restrict,
  constraint hold_legal_scope_fk foreign key (legal_entity_id, organisation_id)
    references core.legal_entity(id, organisation_id) on delete restrict,
  constraint hold_site_scope_fk foreign key (site_id, organisation_id)
    references core.site(id, organisation_id) on delete restrict,
  constraint hold_site_legal_pair_fk foreign key (site_id, legal_entity_id)
    references core.site_legal_entity(site_id, legal_entity_id) on delete restrict,
  constraint hold_resource_type check (governance.valid_resource_type(resource_type)),
  constraint hold_type_format check (governance.valid_code(hold_type,100)),
  constraint hold_action_format check (
    blocked_action is null or governance.valid_code(blocked_action,100)
  ),
  constraint hold_reason_length check (char_length(btrim(reason)) between 1 and 2000),
  constraint hold_release_capability check (governance.valid_code(release_capability_code,160)),
  constraint hold_placement_capability check (governance.valid_code(placement_capability_code,160)),
  constraint hold_release_shape check (
    (status = 'ACTIVE'
      and released_by_user_id is null
      and released_at is null
      and release_reason is null
      and release_approval_request_id is null)
    or
    (status = 'RELEASED'
      and released_by_user_id is not null
      and released_at is not null
      and release_reason is not null)
  ),
  constraint hold_placement_command_unique unique (placement_command_id)
);

create unique index hold_active_identity_unique
  on governance.hold (
    organisation_id, resource_type, resource_id, hold_type, coalesce(blocked_action,'')
  )
  where status = 'ACTIVE';
create index hold_active_resource_idx
  on governance.hold (organisation_id, resource_type, resource_id, hold_type, id)
  where status = 'ACTIVE';
create index hold_scope_idx
  on governance.hold (organisation_id, legal_entity_id, site_id, status, id);

create table governance.hold_action (
  id uuid primary key,
  hold_id uuid not null,
  action text not null check (action in ('HOLD_PLACED','HOLD_RELEASED')),
  actor_user_id uuid not null,
  acted_at timestamptz not null,
  reason text not null,
  approval_request_id uuid null,
  organisation_id uuid not null,
  legal_entity_id uuid null,
  site_id uuid null,
  request_id text not null,
  command_id uuid not null,
  correlation_id uuid not null,
  causation_id uuid null,
  constraint hold_action_hold_fk foreign key (hold_id)
    references governance.hold(id) on delete restrict,
  constraint hold_action_actor_fk foreign key (actor_user_id)
    references iam.user_profile(id) on delete restrict,
  constraint hold_action_approval_fk foreign key (approval_request_id)
    references governance.approval_request(id) on delete restrict,
  constraint hold_action_organisation_fk foreign key (organisation_id)
    references core.organisation(id) on delete restrict,
  constraint hold_action_legal_scope_fk foreign key (legal_entity_id, organisation_id)
    references core.legal_entity(id, organisation_id) on delete restrict,
  constraint hold_action_site_scope_fk foreign key (site_id, organisation_id)
    references core.site(id, organisation_id) on delete restrict,
  constraint hold_action_site_legal_pair_fk foreign key (site_id, legal_entity_id)
    references core.site_legal_entity(site_id, legal_entity_id) on delete restrict,
  constraint hold_action_reason_length check (char_length(btrim(reason)) between 1 and 2000),
  constraint hold_action_request_id_format check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  constraint hold_action_command_unique unique (command_id)
);

create index hold_action_hold_idx
  on governance.hold_action (hold_id, acted_at, id);
create index hold_action_scope_idx
  on governance.hold_action (organisation_id, legal_entity_id, site_id, acted_at desc, id);

create or replace function governance.reject_immutable_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Canonical governance evidence is immutable'
    using errcode = '55000';
end;
$$;

create trigger audit_event_immutable
before update or delete on governance.audit_event
for each row execute function governance.reject_immutable_mutation();
create trigger approval_decision_immutable
before update or delete on governance.approval_decision
for each row execute function governance.reject_immutable_mutation();
create trigger hold_action_immutable
before update or delete on governance.hold_action
for each row execute function governance.reject_immutable_mutation();

create or replace function facilityos_security.current_user_has_capability(
  p_capability_code text,
  p_organisation_id uuid,
  p_legal_entity_id uuid,
  p_site_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile_id uuid;
begin
  v_profile_id := facilityos_security.current_active_profile_id();
  if v_profile_id is null then return false; end if;

  return exists (
    select 1
    from iam.role_assignment ra
    join iam.role r on r.id = ra.role_id and r.status = 'ACTIVE'
    join iam.role_capability rc on rc.role_id = r.id and rc.status = 'ACTIVE'
    join iam.capability c on c.id = rc.capability_id and c.status = 'ACTIVE'
    where ra.user_profile_id = v_profile_id
      and ra.organisation_id = p_organisation_id
      and ra.status = 'ACTIVE'
      and ra.valid_from <= statement_timestamp()
      and (ra.valid_until is null or statement_timestamp() < ra.valid_until)
      and c.code = p_capability_code
      and (
        (p_legal_entity_id is null and p_site_id is null and ra.scope_level = 'ORGANISATION')
        or
        (p_legal_entity_id is not null and p_site_id is null and (
          ra.scope_level = 'ORGANISATION'
          or (ra.scope_level = 'LEGAL_ENTITY' and ra.legal_entity_id = p_legal_entity_id)
        ))
        or
        (p_legal_entity_id is null and p_site_id is not null and (
          ra.scope_level = 'ORGANISATION'
          or (ra.scope_level = 'SITE' and ra.site_id = p_site_id and ra.legal_entity_id is null)
        ))
        or
        (p_legal_entity_id is not null and p_site_id is not null and (
          ra.scope_level = 'ORGANISATION'
          or (ra.scope_level = 'LEGAL_ENTITY' and ra.legal_entity_id = p_legal_entity_id)
          or (ra.scope_level = 'SITE' and ra.site_id = p_site_id and ra.legal_entity_id = p_legal_entity_id)
        ))
      )
  );
end;
$$;

create or replace function facilityos_security.current_user_has_any_capability(
  p_capability_codes text[],
  p_organisation_id uuid,
  p_legal_entity_id uuid,
  p_site_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_code text;
begin
  if p_capability_codes is null then return false; end if;
  foreach v_code in array p_capability_codes loop
    if facilityos_security.current_user_has_capability(
      v_code, p_organisation_id, p_legal_entity_id, p_site_id
    ) then return true; end if;
  end loop;
  return false;
end;
$$;

create or replace function governance.append_human_audit_event(
  p_id uuid,
  p_authorizing_capability text,
  p_event_type text,
  p_event_version integer,
  p_recorded_at timestamptz,
  p_occurred_at timestamptz,
  p_request_id text,
  p_command_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid,
  p_organisation_id uuid,
  p_legal_entity_id uuid,
  p_site_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_action text,
  p_outcome text,
  p_metadata jsonb,
  p_source_module text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile_id uuid;
begin
  v_profile_id := facilityos_security.current_active_profile_id();
  if v_profile_id is null then
    raise exception 'Authenticated FacilityOS human context is required' using errcode = '42501';
  end if;
  if not facilityos_security.current_user_has_capability(
    p_authorizing_capability, p_organisation_id, p_legal_entity_id, p_site_id
  ) then
    raise exception 'Audit append authorizing capability is not satisfied' using errcode = '42501';
  end if;
  if not facilityos_security.scope_exists_active(
    p_organisation_id, p_legal_entity_id, p_site_id
  ) then
    raise exception 'Audit scope is invalid' using errcode = '42501';
  end if;

  insert into governance.audit_event (
    id,event_type,event_version,recorded_at,occurred_at,actor_type,actor_id,
    authenticated_user_id,authorizing_capability,request_id,command_id,correlation_id,
    causation_id,organisation_id,legal_entity_id,site_id,resource_type,resource_id,
    action,outcome,metadata,source_module,reason,creation_txid
  ) values (
    p_id,p_event_type,p_event_version,p_recorded_at,p_occurred_at,'HUMAN',v_profile_id::text,
    v_profile_id,p_authorizing_capability,p_request_id,p_command_id,p_correlation_id,
    p_causation_id,p_organisation_id,p_legal_entity_id,p_site_id,p_resource_type,p_resource_id,
    p_action,p_outcome,coalesce(p_metadata,'{}'::jsonb),p_source_module,p_reason,
    pg_current_xact_id()::text
  );
  return p_id;
end;
$$;

create or replace function governance.append_system_audit_event(
  p_id uuid,
  p_actor_type text,
  p_actor_id text,
  p_event_type text,
  p_event_version integer,
  p_recorded_at timestamptz,
  p_occurred_at timestamptz,
  p_request_id text,
  p_command_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid,
  p_organisation_id uuid,
  p_legal_entity_id uuid,
  p_site_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_action text,
  p_outcome text,
  p_metadata jsonb,
  p_source_module text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_actor_type not in ('SERVICE','SYSTEM','MIGRATION') then
    raise exception 'System audit actor type must be SERVICE, SYSTEM or MIGRATION' using errcode = '22023';
  end if;
  if not governance.valid_code(p_actor_id,128) then
    raise exception 'System audit actor id is invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from core.organisation o
    where o.id = p_organisation_id and o.status = 'ACTIVE'
  ) then
    raise exception 'System audit Organisation is invalid' using errcode = '22023';
  end if;
  if p_legal_entity_id is not null and not exists (
    select 1 from core.legal_entity le
    where le.id = p_legal_entity_id and le.organisation_id = p_organisation_id and le.status = 'ACTIVE'
  ) then
    raise exception 'System audit Legal Entity is invalid' using errcode = '22023';
  end if;
  if p_site_id is not null and not exists (
    select 1 from core.site s
    where s.id = p_site_id and s.organisation_id = p_organisation_id and s.status = 'ACTIVE'
  ) then
    raise exception 'System audit Site is invalid' using errcode = '22023';
  end if;

  insert into governance.audit_event (
    id,event_type,event_version,recorded_at,occurred_at,actor_type,actor_id,
    authenticated_user_id,authorizing_capability,request_id,command_id,correlation_id,
    causation_id,organisation_id,legal_entity_id,site_id,resource_type,resource_id,
    action,outcome,metadata,source_module,reason,creation_txid
  ) values (
    p_id,p_event_type,p_event_version,p_recorded_at,p_occurred_at,p_actor_type,p_actor_id,
    null,null,p_request_id,p_command_id,p_correlation_id,p_causation_id,p_organisation_id,
    p_legal_entity_id,p_site_id,p_resource_type,p_resource_id,p_action,p_outcome,
    coalesce(p_metadata,'{}'::jsonb),p_source_module,p_reason,pg_current_xact_id()::text
  );
  return p_id;
end;
$$;

create or replace function governance.create_approval_request(
  p_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_requested_action text,
  p_policy_code text,
  p_requested_at timestamptz,
  p_organisation_id uuid,
  p_legal_entity_id uuid,
  p_site_id uuid,
  p_required_approval_count smallint,
  p_require_distinct_humans boolean,
  p_self_approval_allowed boolean,
  p_required_capability_codes text[],
  p_request_capability_code text,
  p_request_id text,
  p_command_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid
)
returns table(record_id uuid, replayed boolean, current_status text)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile_id uuid;
  v_existing governance.approval_request%rowtype;
begin
  v_profile_id := facilityos_security.current_active_profile_id();
  if v_profile_id is null then raise exception 'Authenticated FacilityOS human context is required' using errcode='42501'; end if;

  select * into v_existing from governance.approval_request where command_id = p_command_id;
  if found then
    if v_existing.requester_user_id = v_profile_id
       and v_existing.resource_type = p_resource_type
       and v_existing.resource_id = p_resource_id
       and v_existing.requested_action = p_requested_action
       and v_existing.policy_code = p_policy_code
       and v_existing.organisation_id = p_organisation_id
       and v_existing.legal_entity_id is not distinct from p_legal_entity_id
       and v_existing.site_id is not distinct from p_site_id
       and v_existing.required_approval_count = p_required_approval_count
       and v_existing.require_distinct_humans = p_require_distinct_humans
       and v_existing.self_approval_allowed = p_self_approval_allowed
       and v_existing.required_capability_codes = p_required_capability_codes
       and v_existing.request_capability_code = p_request_capability_code then
      return query select v_existing.id, true, v_existing.status;
      return;
    end if;
    raise exception 'Approval request idempotency conflict' using errcode='23505';
  end if;

  if not facilityos_security.current_user_has_capability(
    p_request_capability_code,p_organisation_id,p_legal_entity_id,p_site_id
  ) then raise exception 'Approval request capability is not satisfied' using errcode='42501'; end if;

  insert into governance.approval_request (
    id,resource_type,resource_id,requested_action,policy_code,requester_user_id,requested_at,
    organisation_id,legal_entity_id,site_id,status,required_approval_count,require_distinct_humans,
    self_approval_allowed,required_capability_codes,request_capability_code,request_id,command_id,
    correlation_id,causation_id,version
  ) values (
    p_id,p_resource_type,p_resource_id,p_requested_action,p_policy_code,v_profile_id,p_requested_at,
    p_organisation_id,p_legal_entity_id,p_site_id,'PENDING',p_required_approval_count,p_require_distinct_humans,
    p_self_approval_allowed,p_required_capability_codes,p_request_capability_code,p_request_id,p_command_id,
    p_correlation_id,p_causation_id,0
  );

  return query select p_id, false, 'PENDING'::text;
end;
$$;

create or replace function governance.decide_approval(
  p_decision_id uuid,
  p_approval_request_id uuid,
  p_decision text,
  p_capability_code text,
  p_decided_at timestamptz,
  p_reason text,
  p_request_id text,
  p_command_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid
)
returns table(record_id uuid, replayed boolean, current_status text)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile_id uuid;
  v_request governance.approval_request%rowtype;
  v_existing governance.approval_decision%rowtype;
  v_count integer;
  v_unsatisfied integer;
begin
  v_profile_id := facilityos_security.current_active_profile_id();
  if v_profile_id is null then raise exception 'Authenticated FacilityOS human context is required' using errcode='42501'; end if;

  select * into v_existing from governance.approval_decision where command_id = p_command_id;
  if found then
    if v_existing.approval_request_id = p_approval_request_id
       and v_existing.approver_user_id = v_profile_id
       and v_existing.decision = p_decision
       and v_existing.capability_code = p_capability_code
       and v_existing.reason is not distinct from p_reason then
      select status into current_status from governance.approval_request where id=p_approval_request_id;
      record_id := v_existing.id; replayed := true; return next; return;
    end if;
    raise exception 'Approval decision idempotency conflict' using errcode='23505';
  end if;

  select * into v_request from governance.approval_request
  where id = p_approval_request_id for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_request.status <> 'PENDING' then raise exception 'Approval request is terminal' using errcode='55000'; end if;
  if p_decision not in ('APPROVE','REJECT') then raise exception 'Invalid approval decision' using errcode='22023'; end if;
  if not (p_capability_code = any(v_request.required_capability_codes)) then
    raise exception 'Capability is not part of this approval policy' using errcode='42501';
  end if;
  if not facilityos_security.current_user_has_capability(
    p_capability_code,v_request.organisation_id,v_request.legal_entity_id,v_request.site_id
  ) then raise exception 'Approval capability is not satisfied' using errcode='42501'; end if;
  if not v_request.self_approval_allowed and v_request.requester_user_id = v_profile_id then
    raise exception 'Self approval is prohibited by policy' using errcode='42501';
  end if;
  if v_request.require_distinct_humans and exists (
    select 1 from governance.approval_decision d
    where d.approval_request_id = v_request.id
      and d.approver_user_id = v_profile_id
      and d.decision = 'APPROVE'
  ) then
    raise exception 'One human cannot satisfy multiple distinct-human approvals' using errcode='42501';
  end if;

  insert into governance.approval_decision (
    id,approval_request_id,approver_user_id,decision,capability_code,decided_at,reason,
    organisation_id,legal_entity_id,site_id,request_id,command_id,correlation_id,causation_id
  ) values (
    p_decision_id,v_request.id,v_profile_id,p_decision,p_capability_code,p_decided_at,p_reason,
    v_request.organisation_id,v_request.legal_entity_id,v_request.site_id,p_request_id,p_command_id,
    p_correlation_id,p_causation_id
  );

  if p_decision = 'REJECT' then
    update governance.approval_request
      set status='REJECTED', version=version+1
    where id=v_request.id;
    current_status := 'REJECTED';
  else
    if v_request.require_distinct_humans then
      select count(distinct approver_user_id) into v_count
      from governance.approval_decision
      where approval_request_id=v_request.id and decision='APPROVE';
    else
      select count(*) into v_count
      from governance.approval_decision
      where approval_request_id=v_request.id and decision='APPROVE';
    end if;

    select count(*) into v_unsatisfied
    from unnest(v_request.required_capability_codes) required(code)
    where not exists (
      select 1 from governance.approval_decision d
      where d.approval_request_id=v_request.id
        and d.decision='APPROVE'
        and d.capability_code=required.code
    );

    if v_count >= v_request.required_approval_count and v_unsatisfied = 0 then
      update governance.approval_request set status='APPROVED', version=version+1 where id=v_request.id;
      current_status := 'APPROVED';
    else
      current_status := 'PENDING';
    end if;
  end if;

  record_id := p_decision_id; replayed := false; return next;
end;
$$;

create or replace function governance.place_hold(
  p_hold_id uuid,
  p_action_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_hold_type text,
  p_blocked_action text,
  p_reason text,
  p_placed_at timestamptz,
  p_organisation_id uuid,
  p_legal_entity_id uuid,
  p_site_id uuid,
  p_placement_capability_code text,
  p_release_capability_code text,
  p_release_requires_approval boolean,
  p_request_id text,
  p_command_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid
)
returns table(record_id uuid, replayed boolean, current_status text)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile_id uuid;
  v_existing governance.hold%rowtype;
begin
  v_profile_id := facilityos_security.current_active_profile_id();
  if v_profile_id is null then raise exception 'Authenticated FacilityOS human context is required' using errcode='42501'; end if;

  select * into v_existing from governance.hold where placement_command_id=p_command_id;
  if found then
    if v_existing.placed_by_user_id=v_profile_id
       and v_existing.resource_type=p_resource_type
       and v_existing.resource_id=p_resource_id
       and v_existing.hold_type=p_hold_type
       and v_existing.blocked_action is not distinct from p_blocked_action
       and v_existing.reason=p_reason
       and v_existing.organisation_id=p_organisation_id
       and v_existing.legal_entity_id is not distinct from p_legal_entity_id
       and v_existing.site_id is not distinct from p_site_id
       and v_existing.placement_capability_code=p_placement_capability_code
       and v_existing.release_capability_code=p_release_capability_code
       and v_existing.release_requires_approval=p_release_requires_approval then
      return query select v_existing.id,true,v_existing.status;
      return;
    end if;
    raise exception 'Hold placement idempotency conflict' using errcode='23505';
  end if;

  if not facilityos_security.current_user_has_capability(
    p_placement_capability_code,p_organisation_id,p_legal_entity_id,p_site_id
  ) then raise exception 'Hold placement capability is not satisfied' using errcode='42501'; end if;

  insert into governance.hold (
    id,resource_type,resource_id,hold_type,blocked_action,reason,placed_by_user_id,placed_at,
    organisation_id,legal_entity_id,site_id,status,release_capability_code,release_requires_approval,
    placement_capability_code,placement_command_id,version
  ) values (
    p_hold_id,p_resource_type,p_resource_id,p_hold_type,p_blocked_action,p_reason,v_profile_id,p_placed_at,
    p_organisation_id,p_legal_entity_id,p_site_id,'ACTIVE',p_release_capability_code,p_release_requires_approval,
    p_placement_capability_code,p_command_id,0
  );

  insert into governance.hold_action (
    id,hold_id,action,actor_user_id,acted_at,reason,approval_request_id,
    organisation_id,legal_entity_id,site_id,request_id,command_id,correlation_id,causation_id
  ) values (
    p_action_id,p_hold_id,'HOLD_PLACED',v_profile_id,p_placed_at,p_reason,null,
    p_organisation_id,p_legal_entity_id,p_site_id,p_request_id,p_command_id,p_correlation_id,p_causation_id
  );

  return query select p_hold_id,false,'ACTIVE'::text;
end;
$$;

create or replace function governance.release_hold(
  p_action_id uuid,
  p_hold_id uuid,
  p_released_at timestamptz,
  p_reason text,
  p_approval_request_id uuid,
  p_request_id text,
  p_command_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid
)
returns table(record_id uuid, replayed boolean, current_status text)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile_id uuid;
  v_hold governance.hold%rowtype;
  v_existing governance.hold_action%rowtype;
begin
  v_profile_id := facilityos_security.current_active_profile_id();
  if v_profile_id is null then raise exception 'Authenticated FacilityOS human context is required' using errcode='42501'; end if;

  select * into v_existing from governance.hold_action where command_id=p_command_id;
  if found then
    if v_existing.hold_id=p_hold_id
       and v_existing.actor_user_id=v_profile_id
       and v_existing.action='HOLD_RELEASED'
       and v_existing.reason=p_reason
       and v_existing.approval_request_id is not distinct from p_approval_request_id then
      return query select v_existing.id,true,'RELEASED'::text;
      return;
    end if;
    raise exception 'Hold release idempotency conflict' using errcode='23505';
  end if;

  select * into v_hold from governance.hold where id=p_hold_id for update;
  if not found then raise exception 'Hold not found' using errcode='P0002'; end if;
  if v_hold.status <> 'ACTIVE' then raise exception 'Hold is not active' using errcode='55000'; end if;
  if not facilityos_security.current_user_has_capability(
    v_hold.release_capability_code,v_hold.organisation_id,v_hold.legal_entity_id,v_hold.site_id
  ) then raise exception 'Hold release capability is not satisfied' using errcode='42501'; end if;

  if v_hold.release_requires_approval then
    if p_approval_request_id is null or not exists (
      select 1 from governance.approval_request ar
      where ar.id=p_approval_request_id
        and ar.status='APPROVED'
        and ar.organisation_id=v_hold.organisation_id
        and ar.resource_type=v_hold.resource_type
        and ar.resource_id=v_hold.resource_id
    ) then
      raise exception 'Approved release evidence is required' using errcode='42501';
    end if;
  end if;

  update governance.hold
    set status='RELEASED',
        released_by_user_id=v_profile_id,
        released_at=p_released_at,
        release_reason=p_reason,
        release_approval_request_id=p_approval_request_id,
        version=version+1
  where id=v_hold.id;

  insert into governance.hold_action (
    id,hold_id,action,actor_user_id,acted_at,reason,approval_request_id,
    organisation_id,legal_entity_id,site_id,request_id,command_id,correlation_id,causation_id
  ) values (
    p_action_id,v_hold.id,'HOLD_RELEASED',v_profile_id,p_released_at,p_reason,p_approval_request_id,
    v_hold.organisation_id,v_hold.legal_entity_id,v_hold.site_id,p_request_id,p_command_id,p_correlation_id,p_causation_id
  );

  return query select p_action_id,false,'RELEASED'::text;
end;
$$;

create or replace function governance.has_blocking_hold(
  p_organisation_id uuid,
  p_legal_entity_id uuid,
  p_site_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if not facilityos_security.can_access_scope(
    p_organisation_id,p_legal_entity_id,p_site_id
  ) then return true; end if;

  return exists (
    select 1 from governance.hold h
    where h.organisation_id=p_organisation_id
      and h.legal_entity_id is not distinct from p_legal_entity_id
      and h.site_id is not distinct from p_site_id
      and h.resource_type=p_resource_type
      and h.resource_id=p_resource_id
      and h.status='ACTIVE'
      and (h.blocked_action is null or h.blocked_action=p_action)
  );
end;
$$;

alter function facilityos_security.current_user_has_capability(text,uuid,uuid,uuid) owner to postgres;
alter function facilityos_security.current_user_has_any_capability(text[],uuid,uuid,uuid) owner to postgres;
alter function governance.append_human_audit_event(uuid,text,text,integer,timestamptz,timestamptz,text,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,text,text) owner to postgres;
alter function governance.append_system_audit_event(uuid,text,text,text,integer,timestamptz,timestamptz,text,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,text,text) owner to postgres;
alter function governance.create_approval_request(uuid,text,uuid,text,text,timestamptz,uuid,uuid,uuid,smallint,boolean,boolean,text[],text,text,uuid,uuid,uuid) owner to postgres;
alter function governance.decide_approval(uuid,uuid,text,text,timestamptz,text,text,uuid,uuid,uuid) owner to postgres;
alter function governance.place_hold(uuid,uuid,text,uuid,text,text,text,timestamptz,uuid,uuid,uuid,text,text,boolean,text,uuid,uuid,uuid) owner to postgres;
alter function governance.release_hold(uuid,uuid,timestamptz,text,uuid,text,uuid,uuid,uuid) owner to postgres;
alter function governance.has_blocking_hold(uuid,uuid,uuid,text,uuid,text) owner to postgres;

revoke all privileges on all functions in schema governance
  from public, anon, authenticated, service_role, facilityos_user_runtime, facilityos_security_admin;
revoke all privileges on function facilityos_security.current_user_has_capability(text,uuid,uuid,uuid)
  from public, anon, authenticated, service_role, facilityos_security_admin;
revoke all privileges on function facilityos_security.current_user_has_any_capability(text[],uuid,uuid,uuid)
  from public, anon, authenticated, service_role, facilityos_security_admin;

grant execute on function facilityos_security.current_user_has_capability(text,uuid,uuid,uuid)
  to facilityos_user_runtime;
grant execute on function facilityos_security.current_user_has_any_capability(text[],uuid,uuid,uuid)
  to facilityos_user_runtime;
grant execute on function governance.append_human_audit_event(uuid,text,text,integer,timestamptz,timestamptz,text,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,text,text)
  to facilityos_user_runtime;
grant execute on function governance.create_approval_request(uuid,text,uuid,text,text,timestamptz,uuid,uuid,uuid,smallint,boolean,boolean,text[],text,text,uuid,uuid,uuid)
  to facilityos_user_runtime;
grant execute on function governance.decide_approval(uuid,uuid,text,text,timestamptz,text,text,uuid,uuid,uuid)
  to facilityos_user_runtime;
grant execute on function governance.place_hold(uuid,uuid,text,uuid,text,text,text,timestamptz,uuid,uuid,uuid,text,text,boolean,text,uuid,uuid,uuid)
  to facilityos_user_runtime;
grant execute on function governance.release_hold(uuid,uuid,timestamptz,text,uuid,text,uuid,uuid,uuid)
  to facilityos_user_runtime;
grant execute on function governance.has_blocking_hold(uuid,uuid,uuid,text,uuid,text)
  to facilityos_user_runtime;
grant execute on function governance.append_system_audit_event(uuid,text,text,text,integer,timestamptz,timestamptz,text,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,text,text)
  to facilityos_security_admin;

grant select on
  governance.audit_event,
  governance.approval_request,
  governance.approval_decision,
  governance.hold,
  governance.hold_action
to facilityos_user_runtime, facilityos_security_admin;

alter table governance.audit_event enable row level security;
alter table governance.audit_event force row level security;
alter table governance.approval_request enable row level security;
alter table governance.approval_request force row level security;
alter table governance.approval_decision enable row level security;
alter table governance.approval_decision force row level security;
alter table governance.hold enable row level security;
alter table governance.hold force row level security;
alter table governance.hold_action enable row level security;
alter table governance.hold_action force row level security;

create policy audit_event_runtime_read on governance.audit_event
for select to facilityos_user_runtime
using (
  facilityos_security.current_user_has_capability(
    'governance.audit.read',organisation_id,legal_entity_id,site_id
  )
);

create policy approval_request_runtime_read on governance.approval_request
for select to facilityos_user_runtime
using (
  requester_user_id=facilityos_security.current_active_profile_id()
  or facilityos_security.current_user_has_any_capability(
    required_capability_codes,organisation_id,legal_entity_id,site_id
  )
);

create policy approval_decision_runtime_read on governance.approval_decision
for select to facilityos_user_runtime
using (
  exists (
    select 1 from governance.approval_request ar
    where ar.id=approval_request_id
      and (
        ar.requester_user_id=facilityos_security.current_active_profile_id()
        or facilityos_security.current_user_has_any_capability(
          ar.required_capability_codes,ar.organisation_id,ar.legal_entity_id,ar.site_id
        )
      )
  )
);

create policy hold_runtime_read on governance.hold
for select to facilityos_user_runtime
using (
  facilityos_security.current_user_has_capability(
    placement_capability_code,organisation_id,legal_entity_id,site_id
  )
  or facilityos_security.current_user_has_capability(
    release_capability_code,organisation_id,legal_entity_id,site_id
  )
);

create policy hold_action_runtime_read on governance.hold_action
for select to facilityos_user_runtime
using (
  exists (
    select 1 from governance.hold h
    where h.id=hold_id
      and (
        facilityos_security.current_user_has_capability(
          h.placement_capability_code,h.organisation_id,h.legal_entity_id,h.site_id
        )
        or facilityos_security.current_user_has_capability(
          h.release_capability_code,h.organisation_id,h.legal_entity_id,h.site_id
        )
      )
  )
);

create policy audit_event_security_admin_read on governance.audit_event
for select to facilityos_security_admin using (true);
create policy approval_request_security_admin_read on governance.approval_request
for select to facilityos_security_admin using (true);
create policy approval_decision_security_admin_read on governance.approval_decision
for select to facilityos_security_admin using (true);
create policy hold_security_admin_read on governance.hold
for select to facilityos_security_admin using (true);
create policy hold_action_security_admin_read on governance.hold_action
for select to facilityos_security_admin using (true);

comment on schema governance is
  'Private FacilityOS W0-09 canonical operational governance: Audit, Approval and Hold foundations.';
comment on table governance.audit_event is
  'Append-only canonical operational audit evidence. Not logs and not the event/outbox transport.';
comment on table governance.approval_decision is
  'Immutable human approval/rejection evidence. Reconsideration creates new governed history.';
comment on table governance.hold_action is
  'Immutable Hold placement/release action history; current Hold state is preserved separately.';

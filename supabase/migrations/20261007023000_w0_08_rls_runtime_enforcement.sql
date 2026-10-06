-- W0-08: PostgreSQL RLS and runtime database enforcement foundation.
-- W0-07 application authorization remains mandatory.
-- W0-09 approvals/holds/audit are intentionally not implemented here.

do $
declare
  v_role record;
begin
  if not exists (select 1 from pg_roles where rolname = 'facilityos_user_runtime') then
    create role facilityos_user_runtime
      nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  else
    select rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
           rolreplication, rolbypassrls
      into v_role
    from pg_roles
    where rolname = 'facilityos_user_runtime';

    if v_role.rolsuper
       or v_role.rolinherit
       or v_role.rolcreaterole
       or v_role.rolcreatedb
       or v_role.rolcanlogin
       or v_role.rolreplication
       or v_role.rolbypassrls then
      raise exception 'Existing facilityos_user_runtime role has unsafe attributes';
    end if;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'facilityos_security_admin') then
    create role facilityos_security_admin
      nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  else
    select rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
           rolreplication, rolbypassrls
      into v_role
    from pg_roles
    where rolname = 'facilityos_security_admin';

    if v_role.rolsuper
       or v_role.rolinherit
       or v_role.rolcreaterole
       or v_role.rolcreatedb
       or v_role.rolcanlogin
       or v_role.rolreplication
       or v_role.rolbypassrls then
      raise exception 'Existing facilityos_security_admin role has unsafe attributes';
    end if;
  end if;
end;
$;

create schema if not exists facilityos_security authorization postgres;

revoke all on schema core from public, anon, authenticated, service_role;
revoke all on schema iam from public, anon, authenticated, service_role;
revoke all on schema facilityos_security from public, anon, authenticated, service_role;

revoke all privileges on all tables in schema core
  from public, anon, authenticated, service_role, facilityos_user_runtime, facilityos_security_admin;
revoke all privileges on all tables in schema iam
  from public, anon, authenticated, service_role, facilityos_user_runtime, facilityos_security_admin;

grant usage on schema core, iam, facilityos_security to facilityos_user_runtime;
grant usage on schema core, iam to facilityos_security_admin;

grant select on
  core.organisation,
  core.legal_entity,
  core.site,
  core.site_legal_entity,
  core.identifier_series,
  core.identifier_sequence,
  core.identifier_allocation,
  iam.user_profile,
  iam.role,
  iam.capability,
  iam.role_capability,
  iam.role_assignment
to facilityos_user_runtime;

grant insert on core.identifier_sequence, core.identifier_allocation
  to facilityos_user_runtime;
grant update (next_value, version, updated_at, updated_actor_type, updated_actor_id)
  on core.identifier_sequence
  to facilityos_user_runtime;

grant select, insert, update, delete on
  core.organisation,
  core.legal_entity,
  core.site,
  core.site_legal_entity,
  core.identifier_series,
  core.identifier_sequence,
  core.identifier_allocation,
  iam.user_profile,
  iam.role,
  iam.capability,
  iam.role_capability,
  iam.role_assignment
to facilityos_security_admin;

create or replace function facilityos_security.establish_authenticated_context(
  p_auth_user_id uuid,
  p_request_id text,
  p_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile_id uuid;
begin
  if p_auth_user_id is null then
    raise exception 'FacilityOS auth user id is required' using errcode = '22023';
  end if;

  if p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception 'FacilityOS request id is invalid' using errcode = '22023';
  end if;

  if p_correlation_id is null then
    raise exception 'FacilityOS correlation id is required' using errcode = '22023';
  end if;

  select up.id
    into v_profile_id
  from iam.user_profile as up
  where up.auth_user_id = p_auth_user_id
  limit 1;

  -- A caller-created temp collision must never become trusted context.
  drop table if exists facilityos_runtime_context;

  create temporary table facilityos_runtime_context (
    user_profile_id uuid null,
    auth_user_id uuid not null,
    actor_type text not null,
    request_id text not null,
    correlation_id uuid not null
  ) on commit drop;

  insert into pg_temp.facilityos_runtime_context (
    user_profile_id,
    auth_user_id,
    actor_type,
    request_id,
    correlation_id
  )
  values (
    v_profile_id,
    p_auth_user_id,
    'HUMAN',
    p_request_id,
    p_correlation_id
  );

  return v_profile_id;
end;
$$;

create or replace function facilityos_security.current_profile_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile_id uuid;
  v_auth_user_id uuid;
begin
  begin
    select ctx.user_profile_id, ctx.auth_user_id
      into v_profile_id, v_auth_user_id
    from pg_temp.facilityos_runtime_context as ctx
    limit 1;
  exception
    when undefined_table then
      return null;
  end;

  if v_profile_id is null or v_auth_user_id is null then
    return null;
  end if;

  if exists (
    select 1
    from iam.user_profile as up
    where up.id = v_profile_id
      and up.auth_user_id = v_auth_user_id
  ) then
    return v_profile_id;
  end if;

  return null;
end;
$$;

create or replace function facilityos_security.current_active_profile_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile_id uuid;
begin
  v_profile_id := facilityos_security.current_profile_id();
  if v_profile_id is null then
    return null;
  end if;

  if exists (
    select 1
    from iam.user_profile as up
    where up.id = v_profile_id
      and up.status = 'ACTIVE'
  ) then
    return v_profile_id;
  end if;

  return null;
end;
$$;

create or replace function facilityos_security.context_matches(
  p_auth_user_id uuid,
  p_profile_id uuid
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
  v_profile_id := facilityos_security.current_profile_id();

  return v_profile_id is not null
    and v_profile_id = p_profile_id
    and exists (
      select 1
      from iam.user_profile as up
      where up.id = p_profile_id
        and up.auth_user_id = p_auth_user_id
    );
end;
$$;

create or replace function facilityos_security.scope_exists_active(
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
begin
  if facilityos_security.current_profile_id() is null then
    return false;
  end if;

  if not exists (
    select 1
    from core.organisation as o
    where o.id = p_organisation_id
      and o.status = 'ACTIVE'
  ) then
    return false;
  end if;

  if p_legal_entity_id is not null and not exists (
    select 1
    from core.legal_entity as le
    where le.id = p_legal_entity_id
      and le.organisation_id = p_organisation_id
      and le.status = 'ACTIVE'
  ) then
    return false;
  end if;

  if p_site_id is not null and not exists (
    select 1
    from core.site as s
    where s.id = p_site_id
      and s.organisation_id = p_organisation_id
      and s.status = 'ACTIVE'
  ) then
    return false;
  end if;

  if p_legal_entity_id is not null
     and p_site_id is not null
     and not exists (
       select 1
       from core.site_legal_entity as sle
       where sle.organisation_id = p_organisation_id
         and sle.legal_entity_id = p_legal_entity_id
         and sle.site_id = p_site_id
         and sle.status = 'ACTIVE'
     ) then
    return false;
  end if;

  return true;
end;
$$;

create or replace function facilityos_security.can_access_scope(
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
  if v_profile_id is null then
    return false;
  end if;

  return exists (
    select 1
    from iam.role_assignment as ra
    join iam.role as r on r.id = ra.role_id
    where ra.user_profile_id = v_profile_id
      and ra.organisation_id = p_organisation_id
      and ra.status = 'ACTIVE'
      and r.status = 'ACTIVE'
      and ra.valid_from <= statement_timestamp()
      and (ra.valid_until is null or statement_timestamp() < ra.valid_until)
      and (
        (
          p_legal_entity_id is null
          and p_site_id is null
          and ra.scope_level = 'ORGANISATION'
        )
        or
        (
          p_legal_entity_id is not null
          and p_site_id is null
          and (
            ra.scope_level = 'ORGANISATION'
            or (
              ra.scope_level = 'LEGAL_ENTITY'
              and ra.legal_entity_id = p_legal_entity_id
            )
          )
        )
        or
        (
          p_legal_entity_id is null
          and p_site_id is not null
          and (
            ra.scope_level = 'ORGANISATION'
            or (
              ra.scope_level = 'SITE'
              and ra.site_id = p_site_id
              and ra.legal_entity_id is null
            )
          )
        )
        or
        (
          p_legal_entity_id is not null
          and p_site_id is not null
          and (
            ra.scope_level = 'ORGANISATION'
            or (
              ra.scope_level = 'LEGAL_ENTITY'
              and ra.legal_entity_id = p_legal_entity_id
            )
            or (
              ra.scope_level = 'SITE'
              and ra.site_id = p_site_id
              and ra.legal_entity_id = p_legal_entity_id
            )
          )
        )
      )
  );
end;
$$;

create or replace function facilityos_security.can_view_organisation(
  p_organisation_id uuid
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
    from iam.role_assignment as ra
    join iam.role as r on r.id = ra.role_id
    where ra.user_profile_id = v_profile_id
      and ra.organisation_id = p_organisation_id
      and ra.status = 'ACTIVE'
      and r.status = 'ACTIVE'
      and ra.valid_from <= statement_timestamp()
      and (ra.valid_until is null or statement_timestamp() < ra.valid_until)
  );
end;
$$;

create or replace function facilityos_security.can_view_legal_entity(
  p_organisation_id uuid,
  p_legal_entity_id uuid
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
    from iam.role_assignment as ra
    join iam.role as r on r.id = ra.role_id
    where ra.user_profile_id = v_profile_id
      and ra.organisation_id = p_organisation_id
      and ra.status = 'ACTIVE'
      and r.status = 'ACTIVE'
      and ra.valid_from <= statement_timestamp()
      and (ra.valid_until is null or statement_timestamp() < ra.valid_until)
      and (
        ra.scope_level = 'ORGANISATION'
        or (
          ra.scope_level = 'LEGAL_ENTITY'
          and ra.legal_entity_id = p_legal_entity_id
        )
        or (
          ra.scope_level = 'SITE'
          and ra.legal_entity_id = p_legal_entity_id
        )
      )
  );
end;
$$;

create or replace function facilityos_security.can_view_site(
  p_organisation_id uuid,
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
    from iam.role_assignment as ra
    join iam.role as r on r.id = ra.role_id
    where ra.user_profile_id = v_profile_id
      and ra.organisation_id = p_organisation_id
      and ra.status = 'ACTIVE'
      and r.status = 'ACTIVE'
      and ra.valid_from <= statement_timestamp()
      and (ra.valid_until is null or statement_timestamp() < ra.valid_until)
      and (
        ra.scope_level = 'ORGANISATION'
        or (
          ra.scope_level = 'SITE'
          and ra.site_id = p_site_id
        )
        or (
          ra.scope_level = 'LEGAL_ENTITY'
          and exists (
            select 1
            from core.site_legal_entity as sle
            where sle.site_id = p_site_id
              and sle.legal_entity_id = ra.legal_entity_id
              and sle.organisation_id = p_organisation_id
              and sle.status = 'ACTIVE'
          )
        )
      )
  );
end;
$$;

create or replace function facilityos_security.can_view_site_legal_entity(
  p_organisation_id uuid,
  p_site_id uuid,
  p_legal_entity_id uuid
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
    from iam.role_assignment as ra
    join iam.role as r on r.id = ra.role_id
    where ra.user_profile_id = v_profile_id
      and ra.organisation_id = p_organisation_id
      and ra.status = 'ACTIVE'
      and r.status = 'ACTIVE'
      and ra.valid_from <= statement_timestamp()
      and (ra.valid_until is null or statement_timestamp() < ra.valid_until)
      and (
        ra.scope_level = 'ORGANISATION'
        or (
          ra.scope_level = 'LEGAL_ENTITY'
          and ra.legal_entity_id = p_legal_entity_id
        )
        or (
          ra.scope_level = 'SITE'
          and ra.site_id = p_site_id
          and ra.legal_entity_id = p_legal_entity_id
        )
      )
  );
end;
$$;

create or replace function facilityos_security.can_read_role(p_role_id uuid)
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
    from iam.role_assignment as ra
    where ra.user_profile_id = v_profile_id
      and ra.role_id = p_role_id
  );
end;
$$;

alter function facilityos_security.establish_authenticated_context(uuid, text, uuid) owner to postgres;
alter function facilityos_security.current_profile_id() owner to postgres;
alter function facilityos_security.current_active_profile_id() owner to postgres;
alter function facilityos_security.context_matches(uuid, uuid) owner to postgres;
alter function facilityos_security.scope_exists_active(uuid, uuid, uuid) owner to postgres;
alter function facilityos_security.can_access_scope(uuid, uuid, uuid) owner to postgres;
alter function facilityos_security.can_view_organisation(uuid) owner to postgres;
alter function facilityos_security.can_view_legal_entity(uuid, uuid) owner to postgres;
alter function facilityos_security.can_view_site(uuid, uuid) owner to postgres;
alter function facilityos_security.can_view_site_legal_entity(uuid, uuid, uuid) owner to postgres;
alter function facilityos_security.can_read_role(uuid) owner to postgres;

revoke all privileges on all functions in schema facilityos_security
  from public, anon, authenticated, service_role, facilityos_security_admin;

grant execute on function facilityos_security.establish_authenticated_context(uuid, text, uuid)
  to facilityos_user_runtime;
grant execute on function facilityos_security.current_profile_id()
  to facilityos_user_runtime;
grant execute on function facilityos_security.current_active_profile_id()
  to facilityos_user_runtime;
grant execute on function facilityos_security.context_matches(uuid, uuid)
  to facilityos_user_runtime;
grant execute on function facilityos_security.scope_exists_active(uuid, uuid, uuid)
  to facilityos_user_runtime;
grant execute on function facilityos_security.can_access_scope(uuid, uuid, uuid)
  to facilityos_user_runtime;
grant execute on function facilityos_security.can_view_organisation(uuid)
  to facilityos_user_runtime;
grant execute on function facilityos_security.can_view_legal_entity(uuid, uuid)
  to facilityos_user_runtime;
grant execute on function facilityos_security.can_view_site(uuid, uuid)
  to facilityos_user_runtime;
grant execute on function facilityos_security.can_view_site_legal_entity(uuid, uuid, uuid)
  to facilityos_user_runtime;
grant execute on function facilityos_security.can_read_role(uuid)
  to facilityos_user_runtime;

alter table core.organisation enable row level security;
alter table core.organisation force row level security;
alter table core.legal_entity enable row level security;
alter table core.legal_entity force row level security;
alter table core.site enable row level security;
alter table core.site force row level security;
alter table core.site_legal_entity enable row level security;
alter table core.site_legal_entity force row level security;
alter table core.identifier_series enable row level security;
alter table core.identifier_series force row level security;
alter table core.identifier_sequence enable row level security;
alter table core.identifier_sequence force row level security;
alter table core.identifier_allocation enable row level security;
alter table core.identifier_allocation force row level security;
alter table iam.user_profile enable row level security;
alter table iam.user_profile force row level security;
alter table iam.role enable row level security;
alter table iam.role force row level security;
alter table iam.capability enable row level security;
alter table iam.capability force row level security;
alter table iam.role_capability enable row level security;
alter table iam.role_capability force row level security;
alter table iam.role_assignment enable row level security;
alter table iam.role_assignment force row level security;

create policy organisation_runtime_select on core.organisation
for select to facilityos_user_runtime
using (facilityos_security.can_view_organisation(id));

create policy legal_entity_runtime_select on core.legal_entity
for select to facilityos_user_runtime
using (facilityos_security.can_view_legal_entity(organisation_id, id));

create policy site_runtime_select on core.site
for select to facilityos_user_runtime
using (facilityos_security.can_view_site(organisation_id, id));

create policy site_legal_entity_runtime_select on core.site_legal_entity
for select to facilityos_user_runtime
using (
  facilityos_security.can_view_site_legal_entity(
    organisation_id,
    site_id,
    legal_entity_id
  )
);

create policy identifier_series_runtime_select on core.identifier_series
for select to facilityos_user_runtime
using (facilityos_security.can_view_organisation(organisation_id));

create policy identifier_sequence_runtime_select on core.identifier_sequence
for select to facilityos_user_runtime
using (
  facilityos_security.can_access_scope(
    organisation_id,
    legal_entity_id,
    site_id
  )
);

create policy identifier_sequence_runtime_insert on core.identifier_sequence
for insert to facilityos_user_runtime
with check (
  facilityos_security.can_access_scope(
    organisation_id,
    legal_entity_id,
    site_id
  )
);

create policy identifier_sequence_runtime_update on core.identifier_sequence
for update to facilityos_user_runtime
using (
  facilityos_security.can_access_scope(
    organisation_id,
    legal_entity_id,
    site_id
  )
)
with check (
  facilityos_security.can_access_scope(
    organisation_id,
    legal_entity_id,
    site_id
  )
);

create policy identifier_allocation_runtime_select on core.identifier_allocation
for select to facilityos_user_runtime
using (
  facilityos_security.can_access_scope(
    organisation_id,
    legal_entity_id,
    site_id
  )
);

create policy identifier_allocation_runtime_insert on core.identifier_allocation
for insert to facilityos_user_runtime
with check (
  facilityos_security.can_access_scope(
    organisation_id,
    legal_entity_id,
    site_id
  )
);

create policy user_profile_runtime_select on iam.user_profile
for select to facilityos_user_runtime
using (id = facilityos_security.current_profile_id());

create policy role_runtime_select on iam.role
for select to facilityos_user_runtime
using (facilityos_security.can_read_role(id));

create policy capability_runtime_select on iam.capability
for select to facilityos_user_runtime
using (facilityos_security.current_active_profile_id() is not null);

create policy role_capability_runtime_select on iam.role_capability
for select to facilityos_user_runtime
using (facilityos_security.can_read_role(role_id));

create policy role_assignment_runtime_select on iam.role_assignment
for select to facilityos_user_runtime
using (user_profile_id = facilityos_security.current_active_profile_id());

create policy organisation_security_admin_all on core.organisation
for all to facilityos_security_admin using (true) with check (true);
create policy legal_entity_security_admin_all on core.legal_entity
for all to facilityos_security_admin using (true) with check (true);
create policy site_security_admin_all on core.site
for all to facilityos_security_admin using (true) with check (true);
create policy site_legal_entity_security_admin_all on core.site_legal_entity
for all to facilityos_security_admin using (true) with check (true);
create policy identifier_series_security_admin_all on core.identifier_series
for all to facilityos_security_admin using (true) with check (true);
create policy identifier_sequence_security_admin_all on core.identifier_sequence
for all to facilityos_security_admin using (true) with check (true);
create policy identifier_allocation_security_admin_all on core.identifier_allocation
for all to facilityos_security_admin using (true) with check (true);
create policy user_profile_security_admin_all on iam.user_profile
for all to facilityos_security_admin using (true) with check (true);
create policy role_security_admin_all on iam.role
for all to facilityos_security_admin using (true) with check (true);
create policy capability_security_admin_all on iam.capability
for all to facilityos_security_admin using (true) with check (true);
create policy role_capability_security_admin_all on iam.role_capability
for all to facilityos_security_admin using (true) with check (true);
create policy role_assignment_security_admin_all on iam.role_assignment
for all to facilityos_security_admin using (true) with check (true);

comment on schema facilityos_security is
  'Private W0-08 RLS helper boundary. Not exposed through the Supabase Data API.';
comment on function facilityos_security.establish_authenticated_context(uuid, text, uuid) is
  'Creates transaction-local verified identity context and accepts no requested business scope.';
comment on role facilityos_user_runtime is
  'NOLOGIN/NOBYPASSRLS ordinary authenticated FacilityOS user-scoped runtime role.';
comment on role facilityos_security_admin is
  'NOLOGIN/NOBYPASSRLS explicit elevated foundation/security administration role.';

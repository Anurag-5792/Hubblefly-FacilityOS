-- W0-06: Supabase Auth + FacilityOS operational user profile.
-- Authentication authority remains auth.users. Authorization/RBAC/RLS are intentionally out of scope.

create schema if not exists iam;

create table iam.user_profile (
  id uuid primary key,
  auth_user_id uuid not null,
  display_name text not null,
  email_snapshot text null,
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
  constraint user_profile_auth_user_fk
    foreign key (auth_user_id) references auth.users(id) on delete restrict,
  constraint user_profile_auth_user_unique unique (auth_user_id),
  constraint user_profile_display_name_length
    check (char_length(btrim(display_name)) between 1 and 160),
  constraint user_profile_email_snapshot_length
    check (email_snapshot is null or char_length(btrim(email_snapshot)) between 3 and 320),
  constraint user_profile_actor_length check (
    char_length(created_actor_id) between 1 and 128
    and char_length(updated_actor_id) between 1 and 128
  )
);

create index user_profile_status_idx
  on iam.user_profile (status, id);

comment on column iam.user_profile.email_snapshot is
  'Operational/display snapshot only. Supabase auth.users remains authentication email authority.';
comment on column iam.user_profile.auth_user_id is
  'Immutable linkage to Supabase auth.users. Auth-user deletion is restricted to preserve operational identity/history.';

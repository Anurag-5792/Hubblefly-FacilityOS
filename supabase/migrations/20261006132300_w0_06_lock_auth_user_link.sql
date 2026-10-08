-- W0-06 hardening: auth.users linkage is immutable after FacilityOS profile creation.
-- A profile may be activated/deactivated or have operational display fields changed,
-- but it must never be silently remapped to another authentication identity.

create or replace function iam.reject_user_profile_auth_user_remap()
returns trigger
language plpgsql
as $$
begin
  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'FacilityOS user profile auth linkage is immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger user_profile_auth_user_immutable
before update of auth_user_id on iam.user_profile
for each row
execute function iam.reject_user_profile_auth_user_remap();

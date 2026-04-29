-- Sync name and avatar_url on user_profiles from auth.users
create or replace function public.user_profiles_sync_meta()
returns trigger
language plpgsql
as $$
declare
  u record;
  nm text;
  av text;
begin
  select * into u from auth.users where id = NEW.id;
  if u is not null then
    -- Try raw_user_meta_data
    begin
      nm := coalesce((u.raw_user_meta_data->>'full_name'), (u.raw_user_meta_data->>'name'));
    exception when others then nm := null; end;
    -- Try identities[0].identity_data.picture or avatar_url
    begin
      av := coalesce((u.raw_user_meta_data->>'picture'), (u.raw_user_meta_data->>'avatar_url'));
    exception when others then av := null; end;
    
    if NEW.name is null then NEW.name := nm; end if;
    if NEW.avatar_url is null then NEW.avatar_url := av; end if;
  end if;
  return NEW;
end;$$;

drop trigger if exists user_profiles_sync_meta_ins on public.user_profiles;
create trigger user_profiles_sync_meta_ins
before insert on public.user_profiles
for each row execute procedure public.user_profiles_sync_meta();

drop trigger if exists user_profiles_sync_meta_upd on public.user_profiles;
create trigger user_profiles_sync_meta_upd
before update on public.user_profiles
for each row execute procedure public.user_profiles_sync_meta();

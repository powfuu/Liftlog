-- Ensure unique 7-digit ID is automatically assigned for user_profiles
create or replace function public.generate_unique_7digit()
returns text
language plpgsql
as $$
declare
  code text;
  exist int;
begin
  loop
    code := lpad((floor(random()*9000000) + 1000000)::int::text, 7, '0');
    select count(*) into exist from public.user_profiles where user_id_7digit = code;
    if exist = 0 then
      return code;
    end if;
  end loop;
end;$$;

create or replace function public.user_profiles_assign_id7()
returns trigger
language plpgsql
as $$
begin
  if NEW.user_id_7digit is null then
    NEW.user_id_7digit := public.generate_unique_7digit();
  end if;
  if NEW.mode is null then
    NEW.mode := 'personal';
  end if;
  return NEW;
end;$$;

create unique index if not exists user_profiles_user_id_7digit_key
on public.user_profiles(user_id_7digit);

drop trigger if exists user_profiles_assign_id7_ins on public.user_profiles;
create trigger user_profiles_assign_id7_ins
before insert on public.user_profiles
for each row execute procedure public.user_profiles_assign_id7();

drop trigger if exists user_profiles_assign_id7_upd on public.user_profiles;
create trigger user_profiles_assign_id7_upd
before update on public.user_profiles
for each row execute procedure public.user_profiles_assign_id7();

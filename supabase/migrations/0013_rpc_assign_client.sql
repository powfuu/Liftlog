-- RPC to safely assign a client by 7-digit code, bypassing RLS via security definer
create or replace function public.assign_client_by_code(c text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  coach uuid := auth.uid();
  client uuid;
  inserted uuid;
begin
  if coach is null then
    raise exception 'not_authenticated';
  end if;

  select id into client from public.user_profiles where user_id_7digit = c;
  if client is null then
    raise exception 'user_not_found';
  end if;

  if client = coach then
    raise exception 'cannot_assign_self';
  end if;

  -- Ensure client has a user_profiles row (triggers will populate meta/id7)
  if not exists (select 1 from public.user_profiles where id = client) then
    insert into public.user_profiles(id) values (client);
  end if;

  begin
    insert into public.coach_clients(coach_id, client_id, assigned_at)
    values (coach, client, now())
    returning id into inserted;
  exception when unique_violation then
    select id into inserted from public.coach_clients where coach_id = coach and client_id = client;
  end;

  return inserted;
end;$$;

grant execute on function public.assign_client_by_code(text) to authenticated;

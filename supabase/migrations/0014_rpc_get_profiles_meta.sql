-- RPC to fetch profile meta (name, avatar_url) for a list of user ids
create or replace function public.get_profiles_meta(ids uuid[])
returns table (id uuid, name text, avatar_url text)
language sql
security definer
set search_path = public
as $$
  with up as (
    select p.id, p.name, p.avatar_url
    from public.user_profiles p
    where p.id = any (ids)
  ), au as (
    select u.id,
           coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') as name,
           coalesce(u.raw_user_meta_data->>'picture', u.raw_user_meta_data->>'avatar_url') as avatar_url
    from auth.users u
    where u.id = any (ids)
  )
  select coalesce(up.id, au.id) as id,
         coalesce(up.name, au.name) as name,
         coalesce(up.avatar_url, au.avatar_url) as avatar_url
  from up
  full join au on up.id = au.id
$$;

grant execute on function public.get_profiles_meta(uuid[]) to authenticated;

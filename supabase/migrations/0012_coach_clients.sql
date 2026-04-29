-- Create coach_clients table with RLS and policies
create table if not exists public.coach_clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamp with time zone default now(),
  unique (coach_id, client_id)
);

alter table public.coach_clients enable row level security;

-- Coaches can see their own assignments
drop policy if exists coach_clients_select_pol on public.coach_clients;
create policy coach_clients_select_pol on public.coach_clients
  for select using (coach_id = auth.uid());

-- Coaches can insert assignments for themselves
drop policy if exists coach_clients_insert_pol on public.coach_clients;
create policy coach_clients_insert_pol on public.coach_clients
  for insert with check (coach_id = auth.uid());

-- Coaches can delete their assignments
drop policy if exists coach_clients_delete_pol on public.coach_clients;
create policy coach_clients_delete_pol on public.coach_clients
  for delete using (coach_id = auth.uid());

-- Allow coaches to read basic profile info of assigned clients
drop policy if exists user_profiles_select_coach_pol on public.user_profiles;
create policy user_profiles_select_coach_pol on public.user_profiles
  for select using (
    exists (
      select 1 from public.coach_clients cc
      where cc.client_id = public.user_profiles.id
      and cc.coach_id = auth.uid()
    )
  );

-- Ensure self-access policy aligns with id PK
drop policy if exists user_profiles_select_self_pol on public.user_profiles;
create policy user_profiles_select_self_pol on public.user_profiles
  for select using (id = auth.uid());

drop policy if exists user_profiles_insert_self_pol on public.user_profiles;
create policy user_profiles_insert_self_pol on public.user_profiles
  for insert with check (id = auth.uid());

drop policy if exists user_profiles_update_self_pol on public.user_profiles;
create policy user_profiles_update_self_pol on public.user_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

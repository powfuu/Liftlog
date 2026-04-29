create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text,
  initial_weight numeric,
  initial_weight_unit text check (initial_weight_unit in ('kg','lb')),
  onboarding_completed boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.user_profiles enable row level security;

create policy user_profiles_select on public.user_profiles
  for select using (auth.uid() = user_id);

create policy user_profiles_insert on public.user_profiles
  for insert with check (auth.uid() = user_id);

create policy user_profiles_update on public.user_profiles
  for update using (auth.uid() = user_id);

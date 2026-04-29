create extension if not exists pgcrypto;

-- Ensure tables exist
create table if not exists public.programs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null,
  name text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.user_preferences (
  user_id uuid unique,
  language text,
  weight_unit text,
  onboarding_completed boolean default false
);

create table if not exists public.exercises (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  name text,
  muscle_group text,
  equipment text,
  description text,
  default_weight_unit text,
  is_custom boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.routines (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  name text,
  description text,
  frequency text,
  days text[],
  is_active boolean default false,
  program_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.routine_exercises (
  routine_id uuid,
  exercise_id uuid,
  target_sets int,
  target_reps int,
  order_index int,
  weight numeric,
  weight_unit text,
  reserve_reps int,
  notes text,
  sets_json jsonb
);

create table if not exists public.routine_days (
  routine_id uuid,
  day text
);

create table if not exists public.exercise_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  exercise_id uuid,
  routine_id uuid,
  notes text,
  log_date timestamptz,
  total_volume numeric,
  max_weight numeric
);

create table if not exists public.exercise_sets (
  log_id uuid,
  order_index int,
  reps int,
  weight numeric,
  weight_unit text,
  is_personal_record boolean default false
);

create table if not exists public.user_weight_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  log_date date,
  weight numeric,
  unit text
);

-- programs
alter table public.programs
  add column if not exists user_id uuid not null,
  add column if not exists name text not null,
  add column if not exists description text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();
create unique index if not exists programs_user_name_unique on public.programs (user_id, name);

-- user_preferences
alter table public.user_preferences
  add column if not exists user_id uuid,
  add column if not exists language text,
  add column if not exists weight_unit text,
  add column if not exists onboarding_completed boolean default false;
create unique index if not exists user_preferences_user_unique on public.user_preferences (user_id);

-- exercises
alter table public.exercises
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists name text,
  add column if not exists muscle_group text,
  add column if not exists equipment text,
  add column if not exists description text,
  add column if not exists default_weight_unit text,
  add column if not exists is_custom boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();
-- optional unique by name per user
create unique index if not exists exercises_user_name_unique on public.exercises (user_id, name);

-- routines
alter table public.routines
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists frequency text,
  add column if not exists days text[],
  add column if not exists is_active boolean default false,
  add column if not exists program_id uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- routine_exercises
alter table public.routine_exercises
  add column if not exists routine_id uuid,
  add column if not exists exercise_id uuid,
  add column if not exists target_sets int,
  add column if not exists target_reps int,
  add column if not exists order_index int,
  add column if not exists weight numeric,
  add column if not exists weight_unit text,
  add column if not exists reserve_reps int,
  add column if not exists notes text,
  add column if not exists sets_json jsonb;
create unique index if not exists routine_exercises_unique on public.routine_exercises (routine_id, exercise_id);

-- routine_days
alter table public.routine_days
  add column if not exists routine_id uuid,
  add column if not exists day text;
create unique index if not exists routine_days_unique on public.routine_days (routine_id, day);

-- exercise_logs
alter table public.exercise_logs
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists exercise_id uuid,
  add column if not exists routine_id uuid,
  add column if not exists notes text,
  add column if not exists log_date timestamptz,
  add column if not exists total_volume numeric,
  add column if not exists max_weight numeric;

-- exercise_sets
alter table public.exercise_sets
  add column if not exists log_id uuid,
  add column if not exists order_index int,
  add column if not exists reps int,
  add column if not exists weight numeric,
  add column if not exists weight_unit text,
  add column if not exists is_personal_record boolean default false;
create unique index if not exists exercise_sets_log_order_unique on public.exercise_sets (log_id, order_index);

-- user_weight_logs
alter table public.user_weight_logs
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists log_date date,
  add column if not exists weight numeric,
  add column if not exists unit text;

-- Add missing columns to align with app expectations and REST usage

-- routine_days requires user_id when clients send it
alter table public.routine_days
  add column if not exists user_id uuid;

-- routine_exercises may require exercise_name (NOT NULL in some setups)
alter table public.routine_exercises
  add column if not exists exercise_name text;

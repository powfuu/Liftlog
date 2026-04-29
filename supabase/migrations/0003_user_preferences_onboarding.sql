alter table public.user_preferences
  add column if not exists onboarding_completed boolean default false;

comment on column public.user_preferences.onboarding_completed is 'Marks if the user completed onboarding';

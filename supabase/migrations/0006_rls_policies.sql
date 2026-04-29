-- Enable RLS and create policies for all app tables

-- programs
alter table public.programs enable row level security;
drop policy if exists programs_select_pol on public.programs;
create policy programs_select_pol on public.programs for select using (user_id = auth.uid());
drop policy if exists programs_insert_pol on public.programs;
create policy programs_insert_pol on public.programs for insert with check (user_id = auth.uid());
drop policy if exists programs_update_pol on public.programs;
create policy programs_update_pol on public.programs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists programs_delete_pol on public.programs;
create policy programs_delete_pol on public.programs for delete using (user_id = auth.uid());

-- exercises
alter table public.exercises enable row level security;
drop policy if exists exercises_select_pol on public.exercises;
create policy exercises_select_pol on public.exercises for select using (user_id = auth.uid());
drop policy if exists exercises_insert_pol on public.exercises;
create policy exercises_insert_pol on public.exercises for insert with check (user_id = auth.uid());
drop policy if exists exercises_update_pol on public.exercises;
create policy exercises_update_pol on public.exercises for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists exercises_delete_pol on public.exercises;
create policy exercises_delete_pol on public.exercises for delete using (user_id = auth.uid());

-- routines
alter table public.routines enable row level security;
drop policy if exists routines_select_pol on public.routines;
create policy routines_select_pol on public.routines for select using (user_id = auth.uid());
drop policy if exists routines_insert_pol on public.routines;
create policy routines_insert_pol on public.routines for insert with check (user_id = auth.uid());
drop policy if exists routines_update_pol on public.routines;
create policy routines_update_pol on public.routines for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists routines_delete_pol on public.routines;
create policy routines_delete_pol on public.routines for delete using (user_id = auth.uid());

-- routine_exercises (child of routines)
alter table public.routine_exercises enable row level security;
drop policy if exists routine_exercises_select_pol on public.routine_exercises;
create policy routine_exercises_select_pol on public.routine_exercises for select using (
  exists(select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())
);
drop policy if exists routine_exercises_insert_pol on public.routine_exercises;
create policy routine_exercises_insert_pol on public.routine_exercises for insert with check (
  exists(select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())
);
drop policy if exists routine_exercises_update_pol on public.routine_exercises;
create policy routine_exercises_update_pol on public.routine_exercises for update using (
  exists(select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())
) with check (
  exists(select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())
);
drop policy if exists routine_exercises_delete_pol on public.routine_exercises;
create policy routine_exercises_delete_pol on public.routine_exercises for delete using (
  exists(select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())
);

-- routine_days (child of routines)
alter table public.routine_days enable row level security;
drop policy if exists routine_days_select_pol on public.routine_days;
create policy routine_days_select_pol on public.routine_days for select using (
  exists(select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())
);
drop policy if exists routine_days_insert_pol on public.routine_days;
create policy routine_days_insert_pol on public.routine_days for insert with check (
  exists(select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())
);
drop policy if exists routine_days_update_pol on public.routine_days;
create policy routine_days_update_pol on public.routine_days for update using (
  exists(select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())
) with check (
  exists(select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())
);
drop policy if exists routine_days_delete_pol on public.routine_days;
create policy routine_days_delete_pol on public.routine_days for delete using (
  exists(select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())
);

-- exercise_logs
alter table public.exercise_logs enable row level security;
drop policy if exists exercise_logs_select_pol on public.exercise_logs;
create policy exercise_logs_select_pol on public.exercise_logs for select using (user_id = auth.uid());
drop policy if exists exercise_logs_insert_pol on public.exercise_logs;
create policy exercise_logs_insert_pol on public.exercise_logs for insert with check (user_id = auth.uid());
drop policy if exists exercise_logs_update_pol on public.exercise_logs;
create policy exercise_logs_update_pol on public.exercise_logs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists exercise_logs_delete_pol on public.exercise_logs;
create policy exercise_logs_delete_pol on public.exercise_logs for delete using (user_id = auth.uid());

-- exercise_sets (child of exercise_logs)
alter table public.exercise_sets enable row level security;
drop policy if exists exercise_sets_select_pol on public.exercise_sets;
create policy exercise_sets_select_pol on public.exercise_sets for select using (
  exists(select 1 from public.exercise_logs l where l.id = log_id and l.user_id = auth.uid())
);
drop policy if exists exercise_sets_insert_pol on public.exercise_sets;
create policy exercise_sets_insert_pol on public.exercise_sets for insert with check (
  exists(select 1 from public.exercise_logs l where l.id = log_id and l.user_id = auth.uid())
);
drop policy if exists exercise_sets_update_pol on public.exercise_sets;
create policy exercise_sets_update_pol on public.exercise_sets for update using (
  exists(select 1 from public.exercise_logs l where l.id = log_id and l.user_id = auth.uid())
) with check (
  exists(select 1 from public.exercise_logs l where l.id = log_id and l.user_id = auth.uid())
);
drop policy if exists exercise_sets_delete_pol on public.exercise_sets;
create policy exercise_sets_delete_pol on public.exercise_sets for delete using (
  exists(select 1 from public.exercise_logs l where l.id = log_id and l.user_id = auth.uid())
);

-- user_weight_logs
alter table public.user_weight_logs enable row level security;
drop policy if exists user_weight_logs_select_pol on public.user_weight_logs;
create policy user_weight_logs_select_pol on public.user_weight_logs for select using (user_id = auth.uid());
drop policy if exists user_weight_logs_insert_pol on public.user_weight_logs;
create policy user_weight_logs_insert_pol on public.user_weight_logs for insert with check (user_id = auth.uid());
drop policy if exists user_weight_logs_update_pol on public.user_weight_logs;
create policy user_weight_logs_update_pol on public.user_weight_logs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists user_weight_logs_delete_pol on public.user_weight_logs;
create policy user_weight_logs_delete_pol on public.user_weight_logs for delete using (user_id = auth.uid());

-- user_preferences
alter table public.user_preferences enable row level security;
drop policy if exists user_preferences_select_pol on public.user_preferences;
create policy user_preferences_select_pol on public.user_preferences for select using (user_id = auth.uid());
drop policy if exists user_preferences_insert_pol on public.user_preferences;
create policy user_preferences_insert_pol on public.user_preferences for insert with check (user_id = auth.uid());
drop policy if exists user_preferences_update_pol on public.user_preferences;
create policy user_preferences_update_pol on public.user_preferences for update using (user_id = auth.uid()) with check (user_id = auth.uid());

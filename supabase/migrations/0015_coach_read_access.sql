-- Allow coaches to view client data

-- exercise_logs
drop policy if exists exercise_logs_select_coach_pol on public.exercise_logs;
create policy exercise_logs_select_coach_pol on public.exercise_logs
  for select using (
    exists (
      select 1 from public.coach_clients cc
      where cc.client_id = public.exercise_logs.user_id
      and cc.coach_id = auth.uid()
    )
  );

-- exercise_sets
drop policy if exists exercise_sets_select_coach_pol on public.exercise_sets;
create policy exercise_sets_select_coach_pol on public.exercise_sets
  for select using (
    exists (
      select 1 from public.exercise_logs l
      join public.coach_clients cc on cc.client_id = l.user_id
      where l.id = public.exercise_sets.log_id
      and cc.coach_id = auth.uid()
    )
  );

-- routines
drop policy if exists routines_select_coach_pol on public.routines;
create policy routines_select_coach_pol on public.routines
  for select using (
    exists (
      select 1 from public.coach_clients cc
      where cc.client_id = public.routines.user_id
      and cc.coach_id = auth.uid()
    )
  );

-- routine_exercises
drop policy if exists routine_exercises_select_coach_pol on public.routine_exercises;
create policy routine_exercises_select_coach_pol on public.routine_exercises
  for select using (
    exists (
      select 1 from public.routines r
      join public.coach_clients cc on cc.client_id = r.user_id
      where r.id = public.routine_exercises.routine_id
      and cc.coach_id = auth.uid()
    )
  );

-- routine_days
drop policy if exists routine_days_select_coach_pol on public.routine_days;
create policy routine_days_select_coach_pol on public.routine_days
  for select using (
    exists (
      select 1 from public.routines r
      join public.coach_clients cc on cc.client_id = r.user_id
      where r.id = public.routine_days.routine_id
      and cc.coach_id = auth.uid()
    )
  );

-- exercises
drop policy if exists exercises_select_coach_pol on public.exercises;
create policy exercises_select_coach_pol on public.exercises
  for select using (
    exists (
      select 1 from public.coach_clients cc
      where cc.client_id = public.exercises.user_id
      and cc.coach_id = auth.uid()
    )
  );

-- programs
drop policy if exists programs_select_coach_pol on public.programs;
create policy programs_select_coach_pol on public.programs
  for select using (
    exists (
      select 1 from public.coach_clients cc
      where cc.client_id = public.programs.user_id
      and cc.coach_id = auth.uid()
    )
  );

-- user_weight_logs
drop policy if exists user_weight_logs_select_coach_pol on public.user_weight_logs;
create policy user_weight_logs_select_coach_pol on public.user_weight_logs
  for select using (
    exists (
      select 1 from public.coach_clients cc
      where cc.client_id = public.user_weight_logs.user_id
      and cc.coach_id = auth.uid()
    )
  );

-- user_preferences
drop policy if exists user_preferences_select_coach_pol on public.user_preferences;
create policy user_preferences_select_coach_pol on public.user_preferences
  for select using (
    exists (
      select 1 from public.coach_clients cc
      where cc.client_id = public.user_preferences.user_id
      and cc.coach_id = auth.uid()
    )
  );

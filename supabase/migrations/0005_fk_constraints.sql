-- Add foreign key constraints to enforce referential integrity

-- routines -> programs
alter table public.routines
  add constraint routines_program_fk
    foreign key (program_id) references public.programs(id)
    on delete set null;

-- routine_exercises -> routines/exercises
alter table public.routine_exercises
  add constraint routine_exercises_routine_fk
    foreign key (routine_id) references public.routines(id)
    on delete cascade;

alter table public.routine_exercises
  add constraint routine_exercises_exercise_fk
    foreign key (exercise_id) references public.exercises(id)
    on delete restrict;

-- routine_days -> routines
alter table public.routine_days
  add constraint routine_days_routine_fk
    foreign key (routine_id) references public.routines(id)
    on delete cascade;

-- exercise_logs -> exercises/routines
alter table public.exercise_logs
  add constraint exercise_logs_exercise_fk
    foreign key (exercise_id) references public.exercises(id)
    on delete set null;

alter table public.exercise_logs
  add constraint exercise_logs_routine_fk
    foreign key (routine_id) references public.routines(id)
    on delete set null;

-- exercise_sets -> exercise_logs
alter table public.exercise_sets
  add constraint exercise_sets_log_fk
    foreign key (log_id) references public.exercise_logs(id)
    on delete cascade;

import { SupabaseService } from './supabase.service';
import { Injectable, inject } from '@angular/core';

export interface CoachClient {
  id: string;
  client_id: string;
  name: string;
  avatar_url: string | null;
  assigned_at: string;
  user_id_7digit?: string;
}

export interface UserProfile {
  id: string;
  user_id_7digit: string;
  mode: 'personal' | 'coach';
  name: string;
  avatar_url: string | null;
}

@Injectable({ providedIn: 'root' })
export class CoachService {
  private supabaseService = inject(SupabaseService);
  private get supabase() { return this.supabaseService.getClient(); }

  async getUserProfile(): Promise<UserProfile | null> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  async updateUserMode(mode: 'personal' | 'coach'): Promise<void> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      const { error } = await this.supabase
        .from('user_profiles')
        .update({ mode, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
    } catch (error) {
      console.error('Error updating user mode:', error);
      throw error;
    }
  }

  async getAssignedClients(): Promise<CoachClient[]> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return [];
    const key = `coach:clients:${user.id}`;
    return await this.supabaseService.memoized(key, async () => {
      try {
        const { data: ccRows, error } = await this.supabase
          .from('coach_clients')
          .select('id, client_id, assigned_at')
          .eq('coach_id', user.id)
          .order('assigned_at', { ascending: false });
        if (error) throw error;
        const rows = ccRows || [];
        const ids = Array.from(new Set(rows.map((r: any) => r.client_id).filter(Boolean)));
        let profileMap = new Map<string, { name: string; avatar_url: string | null; user_id_7digit?: string }>();
        if (ids.length) {
          let profilesRpc: any[] = [];
          try {
            const { data: rpcData } = await this.supabase.rpc('get_profiles_meta', { ids });
            profilesRpc = rpcData || [];
          } catch {}
          profilesRpc.forEach((p: any) => profileMap.set(p.id, { name: p.name || 'Usuario', avatar_url: p.avatar_url || null }));
          const missingOrNoDigit = ids.filter(id => !profileMap.has(id) || !(profileMap.get(id) as any)?.user_id_7digit);
          if (missingOrNoDigit.length) {
            try {
              const { data: direct } = await this.supabase
                .from('user_profiles')
                .select('id, user_id_7digit')
                .in('id', missingOrNoDigit);
              (direct || []).forEach((p: any) => {
                const existing = profileMap.get(p.id) || { name: 'Usuario', avatar_url: null };
                profileMap.set(p.id, { ...existing, user_id_7digit: p.user_id_7digit });
              });
            } catch {}
          }
        }
        return rows.map((r: any) => {
          const prof = profileMap.get(r.client_id) || { name: 'Usuario', avatar_url: null };
          return {
            id: r.id,
            client_id: r.client_id,
            name: prof.name,
            avatar_url: prof.avatar_url,
            assigned_at: r.assigned_at,
            user_id_7digit: (prof as any).user_id_7digit || undefined,
          } as CoachClient;
        });
      } catch (error) {
        console.error('Error getting assigned clients:', error);
        return [];
      }
    });
  }

  async addClientById(userId7Digit: string): Promise<void> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      try {
        const self = await this.getUserProfile();
        const selfCode = self?.user_id_7digit || '';
        if (selfCode && selfCode === userId7Digit) {
          throw new Error('No puedes asignarte como cliente');
        }
      } catch {}
      const { data: insertedId, error } = await this.supabase.rpc('assign_client_by_code', { c: userId7Digit });
      if (error) throw error;
      if (!insertedId) throw new Error('Assignment not persisted');
      this.supabaseService.invalidateMemo(`coach:clients:${user.id}`);
    } catch (error) {
      console.error('Error adding client:', error);
      throw error;
    }
  }

  async removeClient(clientId: string): Promise<void> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      const { error } = await this.supabase
        .from('coach_clients')
        .delete()
        .eq('id', clientId)
        .eq('coach_id', user.id);
      if (error) throw error;
      this.supabaseService.invalidateMemo(`coach:clients:${user.id}`);
    } catch (error) {
      console.error('Error removing client:', error);
      throw error;
    }
  }

  async getClientPrograms(clientId: string) {
    const key = `coach:programs:${clientId}`;
    return await this.supabaseService.memoized(key, async () => {
      try {
        const { data, error } = await this.supabase
          .from('programs')
          .select('id, name, description, is_active, created_at, code')
          .eq('user_id', clientId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          isActive: (p.is_active as boolean) !== false,
          createdAt: new Date(p.created_at),
          code: p.code || null,
        }));
      } catch (error) {
        console.error('Error getting client programs:', error);
        return [];
      }
    });
  }

  async getClientWeightHistory(clientId: string) {
    const key = `coach:weight:${clientId}`;
    return await this.supabaseService.memoized(key, async () => {
      try {
        const { data, error } = await this.supabase
          .rpc('get_client_weight_logs', { client_id: clientId })
          .order('log_date', { ascending: false });
        if (error) throw error;
        return data || [];
      } catch (error) {
        console.error('Error getting client weight history:', error);
        return [];
      }
    });
  }

  async deleteClientWeightLog(logId: string, clientId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('user_weight_logs')
        .delete()
        .eq('id', logId);
      if (error) throw error;
      this.supabaseService.invalidateMemo(`coach:weight:${clientId}`);
    } catch (error) {
      console.error('Error deleting client weight log:', error);
      throw error;
    }
  }

  async getClientExerciseLogs(clientId: string, limit = 30) {
    const key = `coach:logs:${clientId}:${limit}`;
    return await this.supabaseService.memoized(key, async () => {
      try {
        const { data, error } = await this.supabase
          .from('exercise_logs')
          .select(`
            *,
            exercise:exercises(name, muscle_group),
            routine:routines(name)
          `)
          .eq('user_id', clientId)
          .order('log_date', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return data || [];
      } catch (error) {
        console.error('Error getting client exercise logs:', error);
        return [];
      }
    });
  }

  async getAllClientExerciseLogs(clientId: string) {
    const key = `coach:logs_all:${clientId}`;
    return await this.supabaseService.memoized(key, async () => {
      try {
        const { data, error } = await this.supabase
          .from('exercise_logs')
          .select(`
            *,
            exercise_sets(*),
            exercise:exercises(name, muscle_group),
            routine:routines(name)
          `)
          .eq('user_id', clientId)
          .order('log_date', { ascending: false });
        if (error) throw error;
        
        return (data || []).map((l: any) => ({
          ...l,
          sets: (l.exercise_sets || l.sets || []).map((s: any) => ({
            ...s,
            weightUnit: s.weight_unit || s.weightUnit || 'kg'
          }))
        }));
      } catch (error) {
        console.error('Error getting all client exercise logs:', error);
        return [];
      }
    });
  }

  async getClientExercises(clientId: string) {
    const key = `coach:exercises:${clientId}`;
    return await this.supabaseService.memoized(key, async () => {
      try {
        const { data, error } = await this.supabase
          .from('exercises')
          .select('*')
          .eq('user_id', clientId);
        if (error) throw error;
        return data || [];
      } catch (error) {
        console.error('Error getting client exercises:', error);
        return [];
      }
    });
  }

  async getClientRoutines(clientId: string) {
    const key = `coach:routines:${clientId}`;
    return await this.supabaseService.memoized(key, async () => {
      try {
        const { data: routines, error } = await this.supabase
          .from('routines')
          .select('id,name,description,frequency,days,is_active,created_at,updated_at,program_id,code,order_index')
          .eq('user_id', clientId)
          .order('order_index', { ascending: true })
          .order('created_at', { ascending: false });
        if (error) throw error;

        const rids = (routines || []).map((r: any) => r.id);
        const { data: rex } = await this.supabase
          .from('routine_exercises')
          .select('routine_id,exercise_id,exercise_name,target_sets,target_reps,order_index,weight,weight_unit,reserve_reps,notes,sets_json,goal_weight,goal_unit')
          .in('routine_id', rids);
        const { data: rdays } = await this.supabase
          .from('routine_days')
          .select('routine_id,day')
          .in('routine_id', rids);

        // Fetch all exercise details (description, and name fallback)
        const allExIds = Array.from(new Set((rex || []).map((e: any) => e.exercise_id).filter(Boolean)));
        const exDetailsMap = new Map<string, { name: string; description: string }>();

        if (allExIds.length > 0) {
          const { data: exRows } = await this.supabase
            .from('exercises')
            .select('id,name,description')
            .eq('user_id', clientId)
            .in('id', allExIds);
          (exRows || []).forEach((row: any) => exDetailsMap.set(row.id, { name: row.name, description: row.description }));
        }

        // Get program names
        const { data: programs } = await this.supabase
          .from('programs')
          .select('id,name')
          .eq('user_id', clientId);
        const pname = new Map<string, string>();
        (programs || []).forEach((p: any) => pname.set(p.id, p.name));

        const exByRoutine = new Map<string, any[]>();
        (rex || []).forEach((e: any) => {
          const arr = exByRoutine.get(e.routine_id) || [];
          const parsedSets = e.sets_json ? (() => { try { return JSON.parse(e.sets_json); } catch { return []; } })() : [];
          const details = exDetailsMap.get(e.exercise_id);

          let displaySets = e.target_sets;
          let displayReps = e.target_reps;
          let displayWeight = typeof e.weight === 'number' ? e.weight : 0;
          let displayUnit = e.weight_unit || 'lb';

          if (parsedSets && parsedSets.length > 0) {
            displaySets = parsedSets.length;
            if (parsedSets[0]) {
              displayReps = Number(parsedSets[0].reps) || 0;
              displayWeight = Number(parsedSets[0].weight) || 0;
              if (parsedSets[0].weightUnit) {
                displayUnit = parsedSets[0].weightUnit;
              }
            }
          }

          arr.push({
            exerciseId: e.exercise_id,
            exerciseName: e.exercise_name || details?.name || '',
            exerciseDescription: details?.description || '',
            weight: displayWeight,
            weightUnit: displayUnit,
            targetSets: displaySets,
            targetReps: displayReps,
            reserveReps: typeof e.reserve_reps === 'number' ? e.reserve_reps : 0,
            notes: e.notes || '',
            goalWeight: e.goal_weight,
            goalUnit: e.goal_unit,
            order: e.order_index,
            sets: parsedSets,
          });
          exByRoutine.set(e.routine_id, arr);
        });
        const daysByRoutine = new Map<string, string[]>();
        (rdays || []).forEach((d: any) => {
          const arr = daysByRoutine.get(d.routine_id) || [];
          arr.push(d.day);
          daysByRoutine.set(d.routine_id, arr);
        });
        return (routines || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          description: r.description || '',
          exercises: (exByRoutine.get(r.id) || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
          frequency: r.frequency || 'weekly',
          days: Array.from(new Set(daysByRoutine.get(r.id) || r.days || [])),
          isActive: !!r.is_active,
          createdAt: new Date(r.created_at),
          updatedAt: new Date(r.updated_at),
          programId: r.program_id || null,
          programName: r.program_id ? pname.get(r.program_id) : undefined,
          code: r.code || undefined,
        }));
      } catch (error) {
        console.error('Error getting client routines:', error);
        return [];
      }
    });
  }

  async upsertClientProgram(clientId: string, program: { name: string; description?: string }): Promise<void> {
    try {
      const { error } = await this.supabase.rpc('coach_upsert_program_for_client', {
        p_client: clientId,
        p_name: program.name,
        p_description: program.description ?? null,
      });
      if (error) throw error;
      this.supabaseService.invalidateMemo(`coach:programs:${clientId}`);
    } catch (error) {
      console.error('Error upserting client program:', error);
      throw error;
    }
  }

  async importProgramByCodeForClient(clientId: string, code: string): Promise<void> {
    try {
      const rpc = await this.supabase.rpc('get_program_bundle_by_code', { c: code });
      const rows: any[] = (rpc.data || []);
      if (!rows.length) throw new Error('Código de programa inválido');
      const pName = rows[0].program_name;
      const pDesc = rows[0].program_description || null;
      // Insert program for client
      const { data: progIns, error: pErr } = await this.supabase
        .from('programs')
        .insert({ user_id: clientId, name: pName, description: pDesc, code: null })
        .select('id')
        .limit(1);
      if (pErr) throw pErr;
      const programId = (progIns && progIns[0]?.id) || null;
      if (!programId) throw new Error('No se pudo crear el programa');

      // Group routines, days, exercises from bundle
      const routinesMap = new Map<string, { name: string; description?: string; frequency?: string }>();
      const daysByRoutine = new Map<string, string[]>();
      const exByRoutine = new Map<string, any[]>();
      rows.forEach((r: any) => {
        if (r.routine_id) {
          if (!routinesMap.has(r.routine_id)) {
            routinesMap.set(r.routine_id, { name: r.routine_name, description: r.routine_description || null, frequency: r.frequency || 'weekly' });
          }
          if (r.day) {
            const arr = daysByRoutine.get(r.routine_id) || [];
            arr.push(r.day);
            daysByRoutine.set(r.routine_id, arr);
          }
          if (r.exercise_id) {
            const arr = exByRoutine.get(r.routine_id) || [];
            arr.push({
              exercise_id: r.exercise_id,
              exercise_name: r.exercise_name,
              target_sets: r.target_sets,
              target_reps: r.target_reps,
              order_index: r.order_index,
              weight: r.weight,
              weight_unit: r.weight_unit || 'lb',
              reserve_reps: r.reserve_reps,
              notes: r.notes,
              sets_json: r.sets_json || null,
            });
            exByRoutine.set(r.routine_id, arr);
          }
        }
      });

      // Insert routines for client
      for (const [rid, meta] of routinesMap.entries()) {
        const { data: rIns, error: rErr } = await this.supabase
          .from('routines')
          .insert({
            user_id: clientId,
            name: meta.name,
            description: meta.description || null,
            frequency: meta.frequency || 'weekly',
            days: [],
            is_active: true,
            program_id: programId,
            code: this.generateCode(),
          })
          .select('id')
          .limit(1);
        if (rErr) throw rErr;
        const newRid = (rIns && rIns[0]?.id) || null;
        if (!newRid) continue;

        // Insert routine days
        const days = Array.from(new Set(daysByRoutine.get(rid) || []));
        if (days.length) {
          const drows = days.map(d => ({ user_id: clientId, routine_id: newRid, day: d }));
          await this.supabase.from('routine_days').upsert(drows, { onConflict: 'routine_id,day' });
        }

        // Insert routine exercises
        const exs = exByRoutine.get(rid) || [];
        if (exs.length) {
          const rowsEx = exs.map(e => ({
            user_id: clientId,
            routine_id: newRid,
            exercise_id: e.exercise_id,
            exercise_name: e.exercise_name || null,
            target_sets: e.target_sets,
            target_reps: e.target_reps,
            order_index: e.order_index,
            weight: Number(e.weight || 0),
            weight_unit: e.weight_unit || 'lb',
            reserve_reps: Number(e.reserve_reps || 0),
            notes: e.notes || '',
            sets_json: e.sets_json || null,
          }));
          await this.supabase.from('routine_exercises').upsert(rowsEx, { onConflict: 'routine_id,exercise_id' });
        }
      }
      this.supabaseService.invalidateMemo(`coach:programs:${clientId}`);
      this.supabaseService.invalidateMemo(`coach:routines:${clientId}`);
    } catch (error) {
      console.error('Error importing program for client:', error);
      throw error;
    }
  }

  async importRoutineByCodeForClient(clientId: string, programName: string, code: string): Promise<void> {
    try {
      // Find source routine by code
      const { data: r } = await this.supabase
        .from('routines')
        .select('id,name,description,frequency,code')
        .eq('code', code)
        .limit(1)
        .maybeSingle();
      if (!r?.id) throw new Error('Código de rutina inválido');
      const rid = r.id;
      const { data: rex } = await this.supabase
        .from('routine_exercises')
        .select('exercise_id,exercise_name,target_sets,target_reps,order_index,weight,weight_unit,reserve_reps,notes,sets_json')
        .eq('routine_id', rid);
      const { data: rdays } = await this.supabase
        .from('routine_days')
        .select('day')
        .eq('routine_id', rid);

      // Get program id for client
      const { data: prog } = await this.supabase
        .from('programs')
        .select('id')
        .eq('user_id', clientId)
        .eq('name', programName)
        .limit(1)
        .maybeSingle();
      const programId = prog?.id || null;

      // Insert routine for client
      const { data: rIns } = await this.supabase
        .from('routines')
        .insert({
          user_id: clientId,
          name: r.name,
          description: r.description || null,
          frequency: r.frequency || 'weekly',
          days: [],
          is_active: true,
          program_id: programId,
          code: this.generateCode(),
        })
        .select('id')
        .limit(1);
      const newRid = (rIns && rIns[0]?.id) || null;
      if (!newRid) throw new Error('No se pudo crear la rutina');

      // Insert days
      const days = Array.from(new Set((rdays || []).map((d: any) => d.day).filter(Boolean)));
      if (days.length) {
        const drows = days.map(d => ({ user_id: clientId, routine_id: newRid, day: d }));
        await this.supabase.from('routine_days').upsert(drows, { onConflict: 'routine_id,day' });
      }

      // Insert exercises
      const exs = (rex || []) as any[];
      if (exs.length) {
        const rowsEx = exs.map(e => ({
          user_id: clientId,
          routine_id: newRid,
          exercise_id: e.exercise_id,
          exercise_name: e.exercise_name || null,
          target_sets: e.target_sets,
          target_reps: e.target_reps,
          order_index: e.order_index,
          weight: Number(e.weight || 0),
          weight_unit: e.weight_unit || 'lb',
          reserve_reps: Number(e.reserve_reps || 0),
          notes: e.notes || '',
          sets_json: e.sets_json || null,
        }));
        await this.supabase.from('routine_exercises').upsert(rowsEx, { onConflict: 'routine_id,exercise_id' });
      }
      this.supabaseService.invalidateMemo(`coach:routines:${clientId}`);
    } catch (error) {
      console.error('Error importing routine for client:', error);
      throw error;
    }
  }

  async deleteClientProgram(clientId: string, programId: string): Promise<void> {
    try {
      const { error } = await this.supabase.rpc('coach_delete_client_program', {
        p_client: clientId,
        p_program: programId,
      });
      if (error) throw error;
      this.supabaseService.invalidateMemo(`coach:programs:${clientId}`);
      this.supabaseService.invalidateMemo(`coach:routines:${clientId}`);
    } catch (error) {
      console.error('Error deleting client program:', error);
      throw error;
    }
  }

  async createClientRoutine(clientId: string, programName: string, routineName: string, code?: string, description?: string): Promise<string> {
    try {
      const { data: prog } = await this.supabase
        .from('programs')
        .select('id')
        .eq('user_id', clientId)
        .eq('name', programName)
        .limit(1)
        .maybeSingle();
      const programId = prog?.id || null;
      const payload: any = {
        user_id: clientId,
        name: routineName,
        description: description || null,
        frequency: 'weekly',
        days: [],
        is_active: true,
        program_id: programId,
        code: code || null,
      };
      const { data: inserted } = await this.supabase.from('routines').insert(payload).select('id').limit(1);
      const rid = (inserted && inserted[0]?.id) || '';
      this.supabaseService.invalidateMemo(`coach:routines:${clientId}`);
      return rid;
    } catch (error) {
      console.error('Error creating client routine:', error);
      throw error;
    }
  }

  async setClientRoutineDays(clientId: string, routineId: string, days: string[]): Promise<void> {
    try {
      await this.supabase.from('routine_days').delete().eq('routine_id', routineId);
      const unique = Array.from(new Set(days)).filter(Boolean);
      if (unique.length) {
        const rows = unique.map(d => ({ user_id: clientId, routine_id: routineId, day: d }));
        await this.supabase.from('routine_days').upsert(rows, { onConflict: 'routine_id,day' });
      }
      this.supabaseService.invalidateMemo(`coach:routines:${clientId}`);
    } catch (error) {
      console.error('Error setting routine days:', error);
      throw error;
    }
  }

  async updateClientRoutine(clientId: string, routineId: string, updates: { name?: string; description?: string }): Promise<void> {
    try {
      const payload: any = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.description !== undefined) payload.description = updates.description || null;

      const { error } = await this.supabase
        .from('routines')
        .update(payload)
        .eq('user_id', clientId)
        .eq('id', routineId);
      if (error) throw error;
      this.supabaseService.invalidateMemo(`coach:routines:${clientId}`);
    } catch (error) {
      console.error('Error updating client routine:', error);
      throw error;
    }
  }

  async updateClientRoutineOrder(clientId: string, updates: { id: string; name: string; order_index: number }[]): Promise<void> {
    if (!updates.length) return;
    try {
      const { error } = await this.supabase
        .from('routines')
        .upsert(
          updates.map(u => ({
            id: u.id,
            user_id: clientId,
            name: u.name,
            order_index: u.order_index,
            updated_at: new Date().toISOString()
          })),
          { onConflict: 'id' }
        );
      if (error) throw error;
      this.supabaseService.invalidateMemo(`coach:routines:${clientId}`);
    } catch (error) {
      console.error('Error updating routine order:', error);
      throw error;
    }
  }

  async deleteClientRoutine(clientId: string, routineId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('routines')
        .delete()
        .eq('user_id', clientId)
        .eq('id', routineId);
      if (error) throw error;
      try { await this.supabase.from('routine_exercises').delete().eq('routine_id', routineId); } catch {}
      try { await this.supabase.from('routine_days').delete().eq('routine_id', routineId); } catch {}
      this.supabaseService.invalidateMemo(`coach:routines:${clientId}`);
    } catch (error) {
      console.error('Error deleting client routine:', error);
      throw error;
    }
  }

  async addClientRoutineExercise(clientId: string, routineId: string, payload: { exerciseName: string; targetSets: number; targetReps: number; weight?: number; weightUnit?: 'lb'|'kg'; reserveReps?: number; notes?: string; order?: number; sets?: any[]; goalWeight?: number; goalUnit?: string }): Promise<void> {
    try {
      let exerciseId: string | null = null;
      const { data: existing } = await this.supabase
        .from('exercises')
        .select('id')
        .eq('user_id', clientId)
        .eq('name', payload.exerciseName)
        .limit(1)
        .maybeSingle();
      exerciseId = existing?.id || null;
      if (!exerciseId) {
        const { data: created } = await this.supabase
          .from('exercises')
          .insert({
            user_id: clientId,
            name: payload.exerciseName,
            muscle_group: 'full_body',
            equipment: 'other',
            description: '',
            default_weight_unit: payload.weightUnit || 'lb',
            is_custom: true,
          })
          .select('id')
          .limit(1);
        exerciseId = (created && created[0]?.id) || null;
      }
      if (!exerciseId) throw new Error('No se pudo crear/obtener el ejercicio');

      const row = {
        user_id: clientId,
        routine_id: routineId,
        exercise_id: exerciseId,
        exercise_name: payload.exerciseName || null,
        target_sets: Number(payload.targetSets) || 0,
        target_reps: Number(payload.targetReps) || 0,
        order_index: Number(payload.order ?? 0) || 0,
        weight: Number(payload.weight ?? 0) || 0,
        weight_unit: payload.weightUnit || 'lb',
        reserve_reps: Number(payload.reserveReps ?? 0) || 0,
        notes: payload.notes || '',
        sets_json: payload.sets ? JSON.stringify(payload.sets) : null,
        goal_weight: Number(payload.goalWeight ?? 0) || null,
        goal_unit: payload.goalUnit || 'kg'
      } as any;
      const { error } = await this.supabase
        .from('routine_exercises')
        .upsert(row, { onConflict: 'routine_id,exercise_id' });
      if (error) throw error;
      this.supabaseService.invalidateMemo(`coach:routines:${clientId}`);
    } catch (error) {
      console.error('Error adding client routine exercise:', error);
      throw error;
    }
  }

  async updateClientRoutineExercise(clientId: string, routineId: string, exerciseId: string, payload: { exerciseName?: string; targetSets?: number; targetReps?: number; weight?: number; weightUnit?: 'lb'|'kg'; reserveReps?: number; notes?: string; order?: number; sets?: any[]; goalWeight?: number; goalUnit?: string }): Promise<void> {
    try {
      const row: any = {
        user_id: clientId,
        routine_id: routineId,
        exercise_id: exerciseId,
      };
      if (payload.exerciseName !== undefined) row.exercise_name = payload.exerciseName || null;
      if (payload.targetSets !== undefined) row.target_sets = Number(payload.targetSets) || 0;
      if (payload.targetReps !== undefined) row.target_reps = Number(payload.targetReps) || 0;
      if (payload.order !== undefined) row.order_index = Number(payload.order ?? 0) || 0;
      if (payload.weight !== undefined) row.weight = Number(payload.weight ?? 0) || 0;
      if (payload.weightUnit !== undefined) row.weight_unit = payload.weightUnit || 'lb';
      if (payload.reserveReps !== undefined) row.reserve_reps = Number(payload.reserveReps ?? 0) || 0;
      if (payload.notes !== undefined) row.notes = payload.notes || '';
      if (payload.sets !== undefined) row.sets_json = payload.sets ? JSON.stringify(payload.sets) : null;
      if (payload.goalWeight !== undefined) row.goal_weight = Number(payload.goalWeight ?? 0) || null;
      if (payload.goalUnit !== undefined) row.goal_unit = payload.goalUnit || 'kg';

      const { error } = await this.supabase
        .from('routine_exercises')
        .upsert(row, { onConflict: 'routine_id,exercise_id' });
      if (error) throw error;
      this.supabaseService.invalidateMemo(`coach:routines:${clientId}`);
    } catch (error) {
      console.error('Error updating client routine exercise:', error);
      throw error;
    }
  }

  async deleteClientRoutineExercise(routineId: string, exerciseId: string, clientId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('routine_exercises')
        .delete()
        .eq('routine_id', routineId)
        .eq('exercise_id', exerciseId);
      if (error) throw error;
      this.supabaseService.invalidateMemo(`coach:routines:${clientId}`);
    } catch (error) {
      console.error('Error deleting client routine exercise:', error);
      throw error;
    }
  }

  async getClientLogDates(clientId: string, start: Date, end: Date): Promise<string[]> {
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    const key = `coach:log_dates:${clientId}:${startStr}:${endStr}`;
    return await this.supabaseService.memoized(key, async () => {
      try {
        const { data } = await this.supabase
          .from('exercise_logs')
          .select('log_date')
          .eq('user_id', clientId)
          .gte('log_date', startStr)
          .lte('log_date', endStr);
        return (data || []).map((row: any) => row.log_date.split('T')[0]);
      } catch (error) {
        console.error('Error getting client log dates:', error);
        return [];
      }
    });
  }

  async getClientDailyLogs(clientId: string, date: Date): Promise<string[]> {
    const dateStr = date.toISOString().split('T')[0];
    const key = `coach:daily_logs:${clientId}:${dateStr}`;
    return await this.supabaseService.memoized(key, async () => {
      try {
        const { data } = await this.supabase
          .from('exercise_logs')
          .select('routine_id')
          .eq('user_id', clientId)
          .eq('log_date', dateStr);
        return (data || []).map((h: any) => h.routine_id).filter(Boolean);
      } catch (error) {
        console.error('Error getting client daily logs:', error);
        return [];
      }
    });
  }

  async getClientRoutineLog(clientId: string, routineId: string, date: Date): Promise<any | null> {
    const dateStr = date.toISOString().split('T')[0];
    const key = `coach:routine_log:${clientId}:${routineId}:${dateStr}`;
    return await this.supabaseService.memoized(key, async () => {
      try {
        const { data } = await this.supabase
          .from('exercise_logs')
          .select('*, exercise_sets(*)')
          .eq('user_id', clientId)
          .eq('routine_id', routineId)
          .eq('log_date', dateStr)
          .maybeSingle();
        return data || null;
      } catch (error) {
        console.error('Error getting client routine log:', error);
        return null;
      }
    });
  }

  async findUserBy7DigitId(userId7Digit: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id_7digit', userId7Digit)
        .single();
      if (error) return null;
      return data;
    } catch (error) {
      console.error('Error finding user by 7-digit ID:', error);
      return null;
    }
  }

  private generateCode(): string {
    return Math.floor(1000000 + Math.random() * 9000000).toString();
  }
}

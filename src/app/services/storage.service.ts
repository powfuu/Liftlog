import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { CapacitorSQLite, SQLiteDBConnection, SQLiteConnection, capSQLiteSet } from '@capacitor-community/sqlite';
import { Exercise, ExerciseLog, ExerciseSet } from '../models/exercise.model';
import { UserWeightLog } from '../models/weight.model';
import { Routine, RoutineExercise, UserPreferences } from '../models/routine.model';
import { SupabaseService } from './supabase.service';
import { LoaderService } from './loader.service';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private sqlite: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;
  private isInitialized = false;
  private supabase = inject(SupabaseService);
  private loader = inject(LoaderService);

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  async refreshProgramsCache(): Promise<void> {
    try { if (await this.supabase.isAuthenticated()) { await this.supabase.refreshProgramsCache(); } } catch {}
  }

  /**
   * Check if running in web environment
   */
  private isWebEnvironment(): boolean {
    return !Capacitor.isNativePlatform();
  }

  /**
   * Initialize database
   */
  async initializeDatabase(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Check if we're in a web environment
      if (this.isWebEnvironment()) {
        this.isInitialized = true;
        return;
      }

      // Ensure connections are consistent and reuse if exists
      await this.sqlite.checkConnectionsConsistency();
      try {
        this.db = await this.sqlite.retrieveConnection('liftlog_db', false);
      } catch {
        this.db = await this.sqlite.createConnection(
          'liftlog_db',
          false,
          'no-encryption',
          1,
          false
        );
      }

      await this.db.open();

      // Create tables
      await this.createTables();

      // Insert default exercises
      await this.insertDefaultExercises();

      // Insert default preferences
      await this.insertDefaultPreferences();

      this.isInitialized = true;

    } catch (error) {
      console.error('Error initializing database:', error);
      // Fallback to web storage for development
      this.isInitialized = true;
    }
  }

  /**
   * Create database tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const createExercisesTable = `
      CREATE TABLE IF NOT EXISTS exercises (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        muscleGroup TEXT NOT NULL,
        equipment TEXT NOT NULL,
        description TEXT,
        isCustom BOOLEAN DEFAULT 0,
        defaultWeightUnit TEXT NOT NULL DEFAULT 'lb' CHECK (defaultWeightUnit IN ('lb', 'kg')),
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const createExerciseLogsTable = `
      CREATE TABLE IF NOT EXISTS exercise_logs (
        id TEXT PRIMARY KEY,
        exerciseId TEXT NOT NULL,
        routineId TEXT,
        notes TEXT,
        date DATETIME NOT NULL,
        totalVolume REAL NOT NULL,
        maxWeight REAL NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (exerciseId) REFERENCES exercises(id),
        FOREIGN KEY (routineId) REFERENCES routines(id)
      );
    `;

    const createExerciseSetsTable = `
      CREATE TABLE IF NOT EXISTS exercise_sets (
        logId TEXT NOT NULL,
        reps INTEGER NOT NULL,
        weight REAL NOT NULL,
        weightUnit TEXT NOT NULL CHECK (weightUnit IN ('lb', 'kg')),
        isPersonalRecord BOOLEAN DEFAULT 0,
        orderIndex INTEGER NOT NULL,
        PRIMARY KEY (logId, orderIndex),
        FOREIGN KEY (logId) REFERENCES exercise_logs(id)
      );
    `;

    const createRoutinesTable = `
      CREATE TABLE IF NOT EXISTS routines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'custom')),
        isActive BOOLEAN DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const createRoutineExercisesTable = `
      CREATE TABLE IF NOT EXISTS routine_exercises (
        routineId TEXT NOT NULL,
        exerciseId TEXT NOT NULL,
        targetSets INTEGER NOT NULL,
        targetReps INTEGER NOT NULL,
        orderIndex INTEGER NOT NULL,
        weight REAL DEFAULT 0,
        weightUnit TEXT DEFAULT 'lb',
        reserveReps INTEGER DEFAULT 0,
        notes TEXT DEFAULT '',
        setsJson TEXT,
        PRIMARY KEY (routineId, exerciseId),
        FOREIGN KEY (routineId) REFERENCES routines(id),
        FOREIGN KEY (exerciseId) REFERENCES exercises(id)
      );
    `;

    const createRoutineDaysTable = `
      CREATE TABLE IF NOT EXISTS routine_days (
        routineId TEXT NOT NULL,
        day TEXT NOT NULL,
        PRIMARY KEY (routineId, day),
        FOREIGN KEY (routineId) REFERENCES routines(id)
      );
    `;

    const createUserPreferencesTable = `
      CREATE TABLE IF NOT EXISTS user_preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const createUserWeightLogsTable = `
      CREATE TABLE IF NOT EXISTS user_weight_logs (
        id TEXT PRIMARY KEY,
        date DATETIME NOT NULL,
        weight REAL NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('lb','kg')),
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await this.db.execute(createExercisesTable);
    await this.db.execute(createExerciseLogsTable);
    await this.db.execute(createExerciseSetsTable);
    await this.db.execute(createRoutinesTable);
    await this.db.execute(createRoutineExercisesTable);
    await this.ensureRoutineExerciseOptionalColumns();
    await this.db.execute(createRoutineDaysTable);
    await this.db.execute(createUserPreferencesTable);
    await this.db.execute(createUserWeightLogsTable);
    await this.ensureRoutineProgramNameColumn();
  }

  private async getTableColumns(table: string): Promise<Set<string>> {
    if (!this.db) throw new Error('Database not initialized');
    const res = await this.db.query(`PRAGMA table_info(${table})`);
    const cols = new Set<string>();
    for (const row of (res.values || [])) {
      const n = (row as any).name as string;
      if (n) cols.add(n);
    }
    return cols;
  }

  private async ensureRoutineExerciseOptionalColumns(): Promise<void> {
    const cols = await this.getTableColumns('routine_exercises');
    if (!cols.has('weight')) {
      await this.db!.run(`ALTER TABLE routine_exercises ADD COLUMN weight REAL DEFAULT 0`);
    }
    if (!cols.has('weightUnit')) {
      await this.db!.run(`ALTER TABLE routine_exercises ADD COLUMN weightUnit TEXT DEFAULT 'lb'`);
    }
    if (!cols.has('reserveReps')) {
      await this.db!.run(`ALTER TABLE routine_exercises ADD COLUMN reserveReps INTEGER DEFAULT 0`);
    }
    if (!cols.has('notes')) {
      await this.db!.run(`ALTER TABLE routine_exercises ADD COLUMN notes TEXT DEFAULT ''`);
    }
    if (!cols.has('setsJson')) {
      await this.db!.run(`ALTER TABLE routine_exercises ADD COLUMN setsJson TEXT`);
    }
    if (!cols.has('goalWeight')) {
      await this.db!.run(`ALTER TABLE routine_exercises ADD COLUMN goalWeight REAL`);
    }
    if (!cols.has('goalUnit')) {
      await this.db!.run(`ALTER TABLE routine_exercises ADD COLUMN goalUnit TEXT CHECK (goalUnit IN ('lb','kg'))`);
    }
  }

  private async ensureRoutineProgramNameColumn(): Promise<void> {
    const cols = await this.getTableColumns('routines');
    if (!cols.has('programName')) {
      await this.db!.run(`ALTER TABLE routines ADD COLUMN programName TEXT`);
    }
  }

  /**
   * Insert default exercises
   */
  private async insertDefaultExercises(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const defaultExercises = [
      { id: 'bench_press', name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell', description: 'Flat bench barbell press', defaultWeightUnit: 'lb' },
      { id: 'squat', name: 'Squat', muscleGroup: 'legs', equipment: 'barbell', description: 'Back squat', defaultWeightUnit: 'lb' },
      { id: 'deadlift', name: 'Deadlift', muscleGroup: 'back', equipment: 'barbell', description: 'Conventional deadlift', defaultWeightUnit: 'lb' },
      { id: 'overhead_press', name: 'Overhead Press', muscleGroup: 'shoulders', equipment: 'barbell', description: 'Standing overhead press', defaultWeightUnit: 'lb' },
      { id: 'pull_up', name: 'Pull Up', muscleGroup: 'back', equipment: 'bodyweight', description: 'Standard pull-up', defaultWeightUnit: 'lb' },
      { id: 'dumbbell_curl', name: 'Dumbbell Curl', muscleGroup: 'arms', equipment: 'dumbbell', description: 'Bicep curl with dumbbells', defaultWeightUnit: 'lb' },
      { id: 'tricep_dip', name: 'Tricep Dip', muscleGroup: 'arms', equipment: 'bodyweight', description: 'Parallel bar dips', defaultWeightUnit: 'lb' },
      { id: 'leg_press', name: 'Leg Press', muscleGroup: 'legs', equipment: 'machine', description: 'Machine leg press', defaultWeightUnit: 'lb' },
      { id: 'lat_pulldown', name: 'Lat Pulldown', muscleGroup: 'back', equipment: 'cable', description: 'Cable lat pulldown', defaultWeightUnit: 'lb' },
      { id: 'chest_fly', name: 'Chest Fly', muscleGroup: 'chest', equipment: 'dumbbell', description: 'Dumbbell chest fly', defaultWeightUnit: 'lb' }
    ];

    for (const exercise of defaultExercises) {
      await this.db.run(`
        INSERT OR IGNORE INTO exercises (id, name, muscleGroup, equipment, description, isCustom, defaultWeightUnit)
        VALUES (?, ?, ?, ?, ?, 0, ?)
      `, [exercise.id, exercise.name, exercise.muscleGroup, exercise.equipment, exercise.description, exercise.defaultWeightUnit]);
    }
  }

  /**
   * Insert default preferences
   */
  private async insertDefaultPreferences(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const defaultPreferences = [
      { key: 'weight_unit', value: 'lb' },
      { key: 'theme', value: 'dark' },
      { key: 'date_format', value: 'MM/DD/YYYY' },
      { key: 'notifications_enabled', value: 'true' }
    ];

    for (const pref of defaultPreferences) {
      await this.db.run(`
        INSERT OR IGNORE INTO user_preferences (key, value)
        VALUES (?, ?)
      `, [pref.key, pref.value]);
    }
  }

  /**
   * Get all exercises
   */
  async getExercises(): Promise<Exercise[]> {
    if (await this.supabase.isAuthenticated()) {
      try { return await this.supabase.getExercises(); } catch {}
    }
    if (this.isWebEnvironment()) {
      try {
        const res = await Preferences.get({ key: 'exercises' });
        const list: Exercise[] = res.value ? JSON.parse(res.value) : [];
        if (list.length === 0) {
          return this.getMockExercises();
        }
        return list.map(e => ({ ...e, createdAt: new Date(e.createdAt), updatedAt: new Date(e.updatedAt) }));
      } catch { return this.getMockExercises(); }
    }
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.query('SELECT * FROM exercises ORDER BY name');
    return result.values || [];
  }

  /**
   * Get exercise by ID
   */
  async getExerciseById(id: string): Promise<Exercise | null> {
    if (await this.supabase.isAuthenticated()) {
      try { return await (this.supabase.getExerciseById(id) as unknown as Promise<Exercise | null>); } catch { return null; }
    }
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.query('SELECT * FROM exercises WHERE id = ?', [id]);
    return result.values?.[0] || null;
  }

  /**
   * Create custom exercise
   */
  async createExercise(exercise: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>): Promise<Exercise> {
    if (await this.supabase.isAuthenticated()) {
      const res = await this.supabase.upsertExercise({ name: exercise.name, muscleGroup: exercise.muscleGroup, equipment: exercise.equipment, description: exercise.description, defaultWeightUnit: exercise.defaultWeightUnit, isCustom: true });
      return {
        id: res.id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
        description: exercise.description,
        isCustom: true,
        defaultWeightUnit: exercise.defaultWeightUnit,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
    if (!this.db) throw new Error('Database not initialized');
    const id = this.generateId();
    const now = new Date().toISOString();
    await this.db.run(`
      INSERT INTO exercises (id, name, muscleGroup, equipment, description, isCustom, defaultWeightUnit, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `, [id, exercise.name, exercise.muscleGroup, exercise.equipment, exercise.description || '', exercise.defaultWeightUnit, now, now]);
    return { id, name: exercise.name, muscleGroup: exercise.muscleGroup, equipment: exercise.equipment, description: exercise.description, isCustom: true, defaultWeightUnit: exercise.defaultWeightUnit, createdAt: new Date(now), updatedAt: new Date(now) };
  }

  /**
   * Log exercise
   */
  async logExercise(log: Omit<ExerciseLog, 'id' | 'createdAt'>): Promise<ExerciseLog> {
    if (await this.supabase.isAuthenticated()) {
      const res = await this.supabase.logExercise({
        exerciseId: log.exerciseId,
        routineId: log.routineId,
        sets: log.sets,
        notes: log.notes,
        date: log.date,
        totalVolume: log.totalVolume,
        maxWeight: log.maxWeight
      });
      const now = new Date();
      return { id: res.id, ...log, createdAt: now } as ExerciseLog;
    }
    if (this.isWebEnvironment()) {
      const now = new Date();
      const newLog = { id: this.generateId(), ...log, createdAt: now } as ExerciseLog;
      try {
        const res = await Preferences.get({ key: 'exercise_logs' });
        const prev: ExerciseLog[] = res.value ? JSON.parse(res.value) : [];
        await Preferences.set({ key: 'exercise_logs', value: JSON.stringify([...prev, newLog]) });
      } catch (e) {
        console.error('[StorageService] Failed to persist log in web environment:', e);
      }
      return newLog;
    }
    if (!this.db) throw new Error('Database not initialized');
    const id = this.generateId();
    const now = new Date().toISOString();
    const dateStr = log.date.toISOString();
    await this.db.run(`
      INSERT INTO exercise_logs (id, exerciseId, routineId, notes, date, totalVolume, maxWeight, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, log.exerciseId, log.routineId || null, log.notes || '', dateStr, log.totalVolume, log.maxWeight, now]);
    for (let i = 0; i < log.sets.length; i++) {
      const set = log.sets[i];
      await this.db.run(`
        INSERT INTO exercise_sets (logId, reps, weight, weightUnit, isPersonalRecord, orderIndex)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, set.reps, set.weight, set.weightUnit, set.isPersonalRecord ? 1 : 0, i]);
    }
    return { id, ...log, createdAt: new Date(now) } as ExerciseLog;
  }

  async logExercisesBulk(logs: Array<Omit<ExerciseLog, 'id' | 'createdAt'>>): Promise<ExerciseLog[]> {
    if (await this.supabase.isAuthenticated()) {
      const ids = await this.supabase.logExercisesBulk(logs.map(l => ({
        exerciseId: l.exerciseId,
        routineId: l.routineId,
        sets: l.sets,
        notes: l.notes,
        date: l.date,
        totalVolume: l.totalVolume,
        maxWeight: l.maxWeight,
      })));
      const now = new Date();
      return logs.map((l, i) => ({ id: ids[i] || '', ...l, createdAt: now } as ExerciseLog));
    }
    if (this.isWebEnvironment()) {
      const now = new Date();
      try {
        const res = await Preferences.get({ key: 'exercise_logs' });
        const prev: ExerciseLog[] = res.value ? JSON.parse(res.value) : [];
        const saved: ExerciseLog[] = logs.map(l => ({ id: this.generateId(), ...l, createdAt: now } as ExerciseLog));
        await Preferences.set({ key: 'exercise_logs', value: JSON.stringify([...prev, ...saved]) });
        return saved;
      } catch {
        return logs.map(l => ({ id: this.generateId(), ...l, createdAt: now } as ExerciseLog));
      }
    }
    if (!this.db) throw new Error('Database not initialized');
    const out: ExerciseLog[] = [];
    for (const log of logs) {
      const saved = await this.logExercise(log);
      out.push(saved);
    }
    return out;
  }

  /**
   * Get user preferences (fixed values - no settings needed)
   */
  async getUserPreferences(): Promise<UserPreferences> {
    // Always return fixed values - no settings needed
    return {
      weightUnit: 'lb',
      theme: 'dark',
      language: 'es',
      dateFormat: 'MM/DD/YYYY',
      notificationsEnabled: true
    };
  }

  /**
   * Update user preference (no-op since settings are removed)
   */
  async updateUserPreference(key: string, value: string): Promise<void> {
    // No-op since settings are removed - preferences are fixed
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Get mock exercises for web environment
   */
  private getMockExercises(): Exercise[] {
    return [
      {
        id: 'bench_press',
        name: 'Bench Press',
        muscleGroup: 'chest',
        equipment: 'barbell',
        description: 'Flat bench barbell press',
        isCustom: false,
        defaultWeightUnit: 'lb',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'squat',
        name: 'Squat',
        muscleGroup: 'legs',
        equipment: 'barbell',
        description: 'Back squat',
        isCustom: false,
        defaultWeightUnit: 'lb',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'deadlift',
        name: 'Deadlift',
        muscleGroup: 'back',
        equipment: 'barbell',
        description: 'Conventional deadlift',
        isCustom: false,
        defaultWeightUnit: 'lb',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'overhead_press',
        name: 'Overhead Press',
        muscleGroup: 'shoulders',
        equipment: 'barbell',
        description: 'Standing overhead press',
        isCustom: false,
        defaultWeightUnit: 'lb',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'pull_up',
        name: 'Pull Up',
        muscleGroup: 'back',
        equipment: 'bodyweight',
        description: 'Standard pull-up',
        isCustom: false,
        defaultWeightUnit: 'lb',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
  }

  /**
   * Get mock exercise logs for web environment
   */
  private getMockExerciseLogs(): ExerciseLog[] {
    return [
      {
        id: 'log_1',
        exerciseId: 'bench_press',
        sets: [
          { reps: 10, weight: 135, weightUnit: 'lb', isPersonalRecord: false },
          { reps: 8, weight: 145, weightUnit: 'lb', isPersonalRecord: false },
          { reps: 6, weight: 155, weightUnit: 'lb', isPersonalRecord: true }
        ],
        notes: 'Great session!',
        date: new Date(),
        totalVolume: 135 * 10 + 145 * 8 + 155 * 6,
        maxWeight: 155,
        createdAt: new Date()
      },
      {
        id: 'log_2',
        exerciseId: 'squat',
        sets: [
          { reps: 12, weight: 185, weightUnit: 'lb', isPersonalRecord: false },
          { reps: 10, weight: 205, weightUnit: 'lb', isPersonalRecord: false },
          { reps: 8, weight: 225, weightUnit: 'lb', isPersonalRecord: false }
        ],
        notes: 'Feeling strong',
        date: new Date(),
        totalVolume: 185 * 12 + 205 * 10 + 225 * 8,
        maxWeight: 225,
        createdAt: new Date()
      }
    ];
  }

  /**
   * Get mock user preferences for web environment
   */
  private getMockUserPreferences(): UserPreferences {
    return {
      weightUnit: 'lb',
      theme: 'dark',
      language: 'es',
      dateFormat: 'MM/DD/YYYY',
      notificationsEnabled: true,
      userName: 'Liftlog User',
      userEmail: 'user@liftlog.com'
    };
  }

  /**
   * Get exercise logs for web environment
   */
  async getExerciseLogs(): Promise<ExerciseLog[]> {
    if (this.supabase.isLoggingOutState) {
      return [];
    }
    if (await this.supabase.isAuthenticated()) {
      try {
        const logs = await (this.supabase.getExerciseLogs() as unknown as Promise<ExerciseLog[]>);
        return logs;
      } catch (e) {
        console.error('[StorageService] Supabase error:', e);
        return [];
      }
    }
    if (this.isWebEnvironment()) {
      try {
        const res = await Preferences.get({ key: 'exercise_logs' });
        const list: ExerciseLog[] = res.value ? JSON.parse(res.value) : [];
        if (list.length === 0) {
          return this.getMockExerciseLogs();
        }
        return list.map(l => ({ ...l, date: new Date(l.date), createdAt: new Date((l as any).createdAt || l.date) }));
      } catch (e) {
        console.error('[StorageService] Preferences error:', e);
        return this.getMockExerciseLogs();
      }
    }
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.query('SELECT * FROM exercise_logs ORDER BY date DESC');
    const logs: ExerciseLog[] = (result.values || []).map(r => ({ id: r.id, exerciseId: r.exerciseId, routineId: r.routineId || undefined, sets: [], notes: r.notes || '', date: new Date(r.date), totalVolume: r.totalVolume, maxWeight: r.maxWeight, createdAt: new Date(r.createdAt) }));
    for (let i = 0; i < logs.length; i++) {
      const l = logs[i];
      const setsRes = await this.db.query('SELECT reps, weight, weightUnit, isPersonalRecord, orderIndex FROM exercise_sets WHERE logId = ? ORDER BY orderIndex', [l.id]);
      const sets: ExerciseSet[] = (setsRes.values || []).map(s => ({ reps: s.reps, weight: s.weight, weightUnit: (s.weightUnit as 'lb'|'kg') || 'lb', isPersonalRecord: Boolean(s.isPersonalRecord) }));
      l.sets = sets;
    }
    return logs;
  }

  async deleteExerciseLogsForDate(date: Date): Promise<void> {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    if (await this.supabase.isAuthenticated()) {
      try { await (this.supabase as any).deleteExerciseLogsForDate?.(date); return; } catch {}
      try { await (this.supabase as any).deleteExerciseLogsForDate?.(start, end); return; } catch {}
    }
    if (this.isWebEnvironment()) {
      try {
        const res = await Preferences.get({ key: 'exercise_logs' });
        const list: ExerciseLog[] = res.value ? JSON.parse(res.value) : [];
        const filtered = (list || []).filter(l => {
          const d = new Date((l as any).date);
          return d < start || d > end;
        });
        await Preferences.set({ key: 'exercise_logs', value: JSON.stringify(filtered) });
      } catch {}
      return;
    }
    if (!this.db) throw new Error('Database not initialized');
    try {
      const startStr = start.toISOString();
      const endStr = end.toISOString();
      const idsRes = await this.db.query('SELECT id FROM exercise_logs WHERE date >= ? AND date <= ?', [startStr, endStr]);
      const ids = (idsRes.values || []).map(r => r.id);
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        await this.db.run(`DELETE FROM exercise_sets WHERE logId IN (${placeholders})`, ids);
        await this.db.run(`DELETE FROM exercise_logs WHERE id IN (${placeholders})`, ids);
      }
    } catch {}
  }

  async deleteExerciseLogsForDateAndExercises(
    date: Date,
    targets: Array<{ exerciseId: string; routineId?: string | null }>
  ): Promise<void> {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    const exerciseIds = Array.from(new Set((targets || []).map(t => t?.exerciseId).filter(Boolean)));
    if (!exerciseIds.length) return;
    const wanted = new Set((targets || []).map(t => `${t.exerciseId}::${t.routineId ?? ''}`));

    if (await this.supabase.isAuthenticated()) {
      try { await (this.supabase as any).deleteExerciseLogsForDateAndExercises?.(date, targets); return; } catch {}
      try { await (this.supabase as any).deleteExerciseLogsForDateAndExercises?.(start, targets); return; } catch {}
    }

    if (this.isWebEnvironment()) {
      try {
        const res = await Preferences.get({ key: 'exercise_logs' });
        const list: ExerciseLog[] = res.value ? JSON.parse(res.value) : [];
        const filtered = (list || []).filter(l => {
          const d = new Date((l as any).date);
          if (d < start || d > end) return true;
          const key = `${(l as any).exerciseId}::${(l as any).routineId ?? ''}`;
          return !wanted.has(key);
        });
        await Preferences.set({ key: 'exercise_logs', value: JSON.stringify(filtered) });
      } catch {}
      return;
    }

    if (!this.db) throw new Error('Database not initialized');
    try {
      const startStr = start.toISOString();
      const endStr = end.toISOString();
      const placeholders = exerciseIds.map(() => '?').join(',');
      const res = await this.db.query(
        `SELECT id, exerciseId, routineId FROM exercise_logs WHERE date >= ? AND date <= ? AND exerciseId IN (${placeholders})`,
        [startStr, endStr, ...exerciseIds]
      );
      const ids = (res.values || [])
        .filter((r: any) => wanted.has(`${r.exerciseId}::${r.routineId ?? ''}`))
        .map((r: any) => r.id);
      if (ids.length) {
        const ph = ids.map(() => '?').join(',');
        await this.db.run(`DELETE FROM exercise_sets WHERE logId IN (${ph})`, ids);
        await this.db.run(`DELETE FROM exercise_logs WHERE id IN (${ph})`, ids);
      }
    } catch {}
  }

  /**
   * Save routine
   */
  async saveRoutine(routine: Routine, code?: string): Promise<void> {
    if (await this.supabase.isAuthenticated()) {
      await this.supabase.upsertRoutine({
        id: routine.id,
        name: routine.name,
        description: routine.description,
        frequency: routine.frequency,
        days: routine.days || [],
        isActive: !!routine.isActive,
        programName: routine.programName,
        exercises: routine.exercises || [],
        createdAt: routine.createdAt,
        updatedAt: routine.updatedAt,
        code
      });
      return;
    }
    if (this.isWebEnvironment()) {
      try {
        const res = await Preferences.get({ key: 'routines' });
        const list: Routine[] = res.value ? JSON.parse(res.value) : [];
        const idx = list.findIndex(r => r.id === routine.id);
        const serialized: Routine = {
          ...routine,
          exercises: (routine.exercises || []).map((e: any) => ({
            exerciseId: e.exerciseId,
            exerciseName: e.exerciseName,
            weight: typeof e.weight === 'number' ? e.weight : 0,
            weightUnit: e.weightUnit || 'lb',
            targetSets: Number(e.targetSets) || 0,
            targetReps: Number(e.targetReps) || 0,
            reserveReps: Number(e.reserveReps || 0) || 0,
            notes: e.notes || '',
            order: Number(e.order || 0) || 0,
            sets: Array.isArray((e as any).sets) ? (e as any).sets : [],
            goalWeight: typeof (e as any).goalWeight === 'number' ? Number((e as any).goalWeight) : undefined,
            goalUnit: (e as any).goalUnit || undefined,
          }))
        } as any;
        if (idx >= 0) list[idx] = serialized; else list.push(serialized);
        await Preferences.set({ key: 'routines', value: JSON.stringify(list) });
      } catch {}
      return;
    }
    if (!this.db) throw new Error('Database not initialized');
    try {
      await this.db.run(`
        INSERT OR REPLACE INTO routines (id, name, description, frequency, isActive, createdAt, updatedAt, programName)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        routine.id,
        routine.name,
        routine.description,
        routine.frequency,
        routine.isActive ? 1 : 0,
        routine.createdAt.toISOString(),
        routine.updatedAt.toISOString(),
        routine.programName || null
      ]);
    } catch {
      await this.db.run(`
        INSERT OR REPLACE INTO routines (id, name, description, frequency, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        routine.id,
        routine.name,
        routine.description,
        routine.frequency,
        routine.isActive ? 1 : 0,
        routine.createdAt.toISOString(),
        routine.updatedAt.toISOString()
      ]);
    }
    await this.db.run('DELETE FROM routine_exercises WHERE routineId = ?', [routine.id]);
    await this.db.run('DELETE FROM routine_days WHERE routineId = ?', [routine.id]);
    for (const exercise of routine.exercises) {
      let exerciseId = exercise.exerciseId;
      const existing = await this.getExerciseById(exerciseId);
      if (!existing) {
        const created = await this.createExercise({ name: exercise.exerciseName, muscleGroup: 'full_body', equipment: 'other', description: '', defaultWeightUnit: exercise.weightUnit, isCustom: true });
        exerciseId = created.id;
      }
      const setsSerialized = JSON.stringify(((exercise as any).sets || []));
      try {
        await this.db.run(`
          INSERT INTO routine_exercises (routineId, exerciseId, targetSets, targetReps, orderIndex, weight, weightUnit, reserveReps, notes, setsJson, goalWeight, goalUnit)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          routine.id,
          exerciseId,
          exercise.targetSets,
          exercise.targetReps,
          exercise.order,
          (isNaN(Number(exercise.weight)) ? 0 : Number(exercise.weight)),
          (exercise.weightUnit || 'lb'),
          (isNaN(Number((exercise.reserveReps as number))) ? 0 : Number((exercise.reserveReps as number))),
          exercise.notes || '',
          setsSerialized,
          (typeof (exercise as any).goalWeight === 'number' ? Number((exercise as any).goalWeight) : null),
          ((exercise as any).goalUnit || null)
        ]);
      } catch {
        await this.db.run(`
          INSERT INTO routine_exercises (routineId, exerciseId, targetSets, targetReps, orderIndex, weight, weightUnit, reserveReps, notes, goalWeight, goalUnit)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          routine.id,
          exerciseId,
          exercise.targetSets,
          exercise.targetReps,
          exercise.order,
          (isNaN(Number(exercise.weight)) ? 0 : Number(exercise.weight)),
          (exercise.weightUnit || 'lb'),
          (isNaN(Number((exercise.reserveReps as number))) ? 0 : Number((exercise.reserveReps as number))),
          exercise.notes || '',
          (typeof (exercise as any).goalWeight === 'number' ? Number((exercise as any).goalWeight) : null),
          ((exercise as any).goalUnit || null)
        ]);
      }
    }
    const daysToInsert = Array.from(new Set(routine.days || []));
    for (const day of daysToInsert) {
      await this.db.run(`INSERT INTO routine_days (routineId, day) VALUES (?, ?)`, [routine.id, day]);
    }
  }

  /**
   * Get routines
   */
  async getRoutines(): Promise<Routine[]> {
    if (this.supabase.isLoggingOutState) return [];
    if (await this.supabase.isAuthenticated()) {
      try { return await (this.supabase.getRoutines() as unknown as Promise<Routine[]>); } catch {}
    }
    if (this.isWebEnvironment()) {
      const result = await Preferences.get({ key: 'routines' });
      return result.value ? JSON.parse(result.value) : [];
    }

    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.query('SELECT * FROM routines ORDER BY createdAt DESC');
    const routines: Routine[] = [];

    for (const row of result.values || []) {
      // Get exercises for this routine
      const exercisesResult = await this.db.query(`
        SELECT re.*, e.name as exerciseName, e.muscleGroup, e.equipment, e.defaultWeightUnit
        FROM routine_exercises re
        JOIN exercises e ON re.exerciseId = e.id
        WHERE re.routineId = ?
        ORDER BY re.orderIndex
      `, [row.id]);

      const exercises: RoutineExercise[] = (exercisesResult.values || []).map(ex => {
        const base: RoutineExercise = {
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          weight: typeof ex.weight === 'number' ? ex.weight : 0,
          weightUnit: ex.weightUnit || ex.defaultWeightUnit || 'lb',
          targetSets: ex.targetSets,
          targetReps: ex.targetReps,
          reserveReps: typeof ex.reserveReps === 'number' ? ex.reserveReps : 0,
          notes: ex.notes || '',
          order: ex.orderIndex
        };
        const setsJson = (ex as any).setsJson;
        if (setsJson) {
          try { (base as any).sets = JSON.parse(setsJson); } catch { (base as any).sets = []; }
        }
        if (typeof (ex as any).goalWeight === 'number') { (base as any).goalWeight = (ex as any).goalWeight; }
        if ((ex as any).goalUnit) { (base as any).goalUnit = (ex as any).goalUnit; }
        return base;
      });

      // Get days for this routine
      const daysResult = await this.db.query('SELECT day FROM routine_days WHERE routineId = ?', [row.id]);
      const days: string[] = (daysResult.values || []).map(d => d.day);

      routines.push({
        id: row.id,
        name: row.name,
        description: row.description,
        exercises: exercises,
        frequency: row.frequency,
        days,
        isActive: Boolean(row.isActive),
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        programName: row.programName || undefined
      });
    }

    try {
      const res = await Preferences.get({ key: 'routines_order' });
      const order = res.value ? JSON.parse(res.value) : [];
      if (Array.isArray(order) && order.length > 0) {
        const idx = (id: string) => { const i = order.indexOf(id); return i >= 0 ? i : Number.MAX_SAFE_INTEGER; };
        const sorted = [...routines].sort((a, b) => idx(a.id) - idx(b.id));
        return sorted;
      }
    } catch {}
    return routines;
  }

  /** Programs API (Preferences-backed) */
  async getPrograms(): Promise<{ name: string; description?: string; code?: string }[]> {
    if (this.supabase.isLoggingOutState) return [];
    if (await this.supabase.isAuthenticated()) { try { return await (this.supabase.getPrograms() as unknown as Promise<any[]>); } catch {} }
    try {
      const result = await Preferences.get({ key: 'programs' });
      const list = result.value ? JSON.parse(result.value) : [];
      const codes = await Preferences.get({ key: 'program_codes' });
      const map = codes.value ? JSON.parse(codes.value) : {};
      return (list || []).map((p: any) => ({ name: p.name, description: p.description, code: map[p.name], isActive: (p.isActive !== false) }));
    } catch { return []; }
  }

  async saveProgram(program: { name: string; description?: string; code?: string }): Promise<void> {
    if (await this.supabase.isAuthenticated()) { try { await this.supabase.upsertProgram(program); return; } catch {} }
    const list = await this.getPrograms() as any[]; const idx = list.findIndex((p: any) => p.name === program.name); if (idx >= 0) list[idx] = { ...list[idx], ...program }; else list.push({ ...program, isActive: true } as any);
    await Preferences.set({ key: 'programs', value: JSON.stringify(list.map((p: any) => ({ name: p.name, description: p.description, isActive: (p.isActive !== false) })) ) });
    try { const codesRes = await Preferences.get({ key: 'program_codes' }); const map = codesRes.value ? JSON.parse(codesRes.value) : {}; if (program.code) { map[program.name] = program.code; } else if (!map[program.name]) { map[program.name] = String(Math.floor(1000000 + Math.random() * 9000000)); } await Preferences.set({ key: 'program_codes', value: JSON.stringify(map) }); } catch {}
  }

  async saveProgramsList(programs: { name: string; description?: string }[]): Promise<void> {
    if (await this.supabase.isAuthenticated()) { try { await this.supabase.upsertProgramsList(programs); return; } catch {} }
    try {
      const prev = await this.getPrograms() as any[];
      const prevActive = new Map<string, boolean>((prev || []).map(p => [p.name, (p.isActive !== false)]));
      const merged = (programs || []).map(p => ({ name: p.name, description: p.description, isActive: prevActive.get(p.name) !== false }));
      await Preferences.set({ key: 'programs', value: JSON.stringify(merged) });
    } catch {}
  }

  async setProgramActive(name: string, isActive: boolean): Promise<void> {
    if (await this.supabase.isAuthenticated()) { try { await (this.supabase as any).updateProgramActive?.(name, isActive); return; } catch {} }
    try {
      const list = await this.getPrograms() as any[];
      const next = (list || []).map(p => (p.name === name ? { ...p, isActive } : p));
      await Preferences.set({ key: 'programs', value: JSON.stringify(next.map((p: any) => ({ name: p.name, description: p.description, isActive: (p.isActive !== false) }))) });
    } catch {}
  }

  async saveProgramsOrder(order: string[]): Promise<void> {
    try { await Preferences.set({ key: 'programs_order', value: JSON.stringify(order) }); } catch {}
  }
  async getProgramsOrder(): Promise<string[]> {
    try { const res = await Preferences.get({ key: 'programs_order' }); return res.value ? JSON.parse(res.value) : []; } catch { return []; }
  }

  async saveCoachClientsOrder(order: string[]): Promise<void> {
    try { await Preferences.set({ key: 'coach_clients_order', value: JSON.stringify(order) }); } catch {}
  }
  async getCoachClientsOrder(): Promise<string[]> {
    try { const res = await Preferences.get({ key: 'coach_clients_order' }); return res.value ? JSON.parse(res.value) : []; } catch { return []; }
  }

  async deleteProgram(name: string): Promise<void> {
    if (await this.supabase.isAuthenticated()) {
      try { await this.supabase.deleteProgram(name); } catch {}
      try { await this.supabase.refreshProgramsCache(); } catch {}
    }
    const list = await this.getPrograms();
    const filtered = list.filter(p => p.name !== name);
    await Preferences.set({ key: 'programs', value: JSON.stringify(filtered) });

    if (this.isWebEnvironment()) {
      const routines = await this.getRoutines();
      const target = name.trim().toLowerCase();
      const toRemove = routines.filter(r => ((r.programName || '').trim().toLowerCase()) === target).map(r => r.id);
      const keep = routines.filter(r => !toRemove.includes(r.id));
      await Preferences.set({ key: 'routines', value: JSON.stringify(keep) });
      return;
    }

    if (!this.db) return;
    try {
      const routinesRes = await this.db.query('SELECT id FROM routines WHERE programName = ?', [name]);
      const rids = (routinesRes.values || []).map(r => r.id);
      if (rids.length) {
        const placeholders = rids.map(() => '?').join(',');
        const rexRes = await this.db.query(`SELECT DISTINCT exerciseId FROM routine_exercises WHERE routineId IN (${placeholders})`, rids);
        const exIds = (rexRes.values || []).map(e => e.exerciseId);
        await this.db.run(`DELETE FROM routine_exercises WHERE routineId IN (${placeholders})`, rids);
        await this.db.run(`DELETE FROM routine_days WHERE routineId IN (${placeholders})`, rids);
        await this.db.run(`DELETE FROM routines WHERE id IN (${placeholders})`, rids);
        if (exIds.length) {
          const ePlaceholders = exIds.map(() => '?').join(',');
          const still = await this.db.query(`SELECT exerciseId FROM routine_exercises WHERE exerciseId IN (${ePlaceholders})`, exIds);
          const stillSet = new Set<string>((still.values || []).map((r: any) => r.exerciseId));
          const toDelete = exIds.filter(id => !stillSet.has(id));
          if (toDelete.length) {
            const dPlaceholders = toDelete.map(() => '?').join(',');
            await this.db.run(`DELETE FROM exercises WHERE id IN (${dPlaceholders})`, toDelete);
          }
        }
      }
    } catch {}
  }

  async updateProgramNameAndDescription(oldName: string, newName: string, description?: string): Promise<void> {
    const from = (oldName || '').trim();
    const to = (newName || '').trim();
    if (!to) return;
    if (await this.supabase.isAuthenticated()) {
      try { await (this.supabase as any).updateProgramNameAndDescription?.(from, to, description); return; } catch {}
    }
    const list = await this.getPrograms();
    const idx = list.findIndex(p => (p.name || '').trim() === from);
    if (idx < 0) { await this.saveProgram({ name: to, description }); return; }
    const code = (list[idx] as any).code;
    list[idx] = { name: to, description, code } as any;
    await Preferences.set({ key: 'programs', value: JSON.stringify(list.map(p => ({ name: p.name, description: p.description })) ) });
    try {
      const codesRes = await Preferences.get({ key: 'program_codes' });
      const map = codesRes.value ? JSON.parse(codesRes.value) : {};
      if (map[from]) { map[to] = map[from]; delete map[from]; }
      await Preferences.set({ key: 'program_codes', value: JSON.stringify(map) });
    } catch {}
    try {
      const res = await Preferences.get({ key: 'programs_order' });
      const order: string[] = res.value ? JSON.parse(res.value) : [];
      const i = order.indexOf(from);
      if (i >= 0) { order[i] = to; await Preferences.set({ key: 'programs_order', value: JSON.stringify(order) }); }
    } catch {}
    // Local routines reference programName string; update for consistency
    try {
      const routines = await this.getRoutines();
      const next = routines.map(r => {
        const n = (r.programName || '').trim();
        if (n.toLowerCase() === from.toLowerCase()) return { ...r, programName: to };
        return r;
      });
      await Preferences.set({ key: 'routines', value: JSON.stringify(next) });
    } catch {}
  }

  async saveRoutinesOrder(routines: Routine[]): Promise<void> {
    try {
      const ids = routines.map(r => r.id);
      await Preferences.set({ key: 'routines_order', value: JSON.stringify(ids) });
      if (this.isWebEnvironment()) {
        const data = routines.map(r => ({ ...r }));
        await Preferences.set({ key: 'routines', value: JSON.stringify(data) });
      }
    } catch {}
  }

  async getRoutinesOrder(): Promise<string[]> {
    try {
      const res = await Preferences.get({ key: 'routines_order' });
      return res.value ? JSON.parse(res.value) : [];
    } catch {
      return [];
    }
  }

  /**
   * Delete routine
   */
  async deleteRoutine(id: string): Promise<void> {
    if (await this.supabase.isAuthenticated()) { try { await this.supabase.deleteRoutine(id); return; } catch {} }
    if (this.isWebEnvironment()) return;
    if (!this.db) throw new Error('Database not initialized');
    const rex = await this.db.query('SELECT DISTINCT exerciseId FROM routine_exercises WHERE routineId = ?', [id]);
    const exIds: string[] = (rex.values || []).map(r => r.exerciseId);
    await this.db.run('DELETE FROM routine_exercises WHERE routineId = ?', [id]);
    await this.db.run('DELETE FROM routine_days WHERE routineId = ?', [id]);
    await this.db.run('DELETE FROM routines WHERE id = ?', [id]);
    if (exIds.length) {
      const placeholders = exIds.map(() => '?').join(',');
      const still = await this.db.query(`SELECT exerciseId FROM routine_exercises WHERE exerciseId IN (${placeholders})`, exIds);
      const stillSet = new Set<string>((still.values || []).map((r: any) => r.exerciseId));
      const toDelete = exIds.filter(eid => !stillSet.has(eid));
      if (toDelete.length) {
        const dph = toDelete.map(() => '?').join(',');
        await this.db.run(`DELETE FROM exercises WHERE id IN (${dph})`, toDelete);
      }
    }
  }

  async getRoutineCode(id: string): Promise<string | null> {
    if (await this.supabase.isAuthenticated()) { try { return await this.supabase.getRoutineCode(id); } catch { return null; } }
    try { const res = await Preferences.get({ key: 'routine_codes' }); const map = res.value ? JSON.parse(res.value) : {}; return map[id] || null; } catch { return null; }
  }

  async importProgramByCode(code: string): Promise<string | null> {
    const bundle = await this.supabase.getProgramByCode(code);
    if (!bundle || !bundle.program) return null;
    const baseName = (bundle.program.name || 'Imported Program').trim();
    let name = baseName;
    try {
      const existing = await this.getPrograms();
      const names = new Set(existing.map(p => (p.name || '').trim()));
      if (names.has(name)) {
        let i = 2;
        while (names.has(`${baseName} ${i}`)) i++;
        name = `${baseName} ${i}`;
      }
    } catch {}
    const authed = await this.supabase.isAuthenticated();
    const daysByRoutine = new Map<string, string[]>();
    for (const d of (bundle.days || [])) {
      const arr = daysByRoutine.get(d.routine_id) || [];
      if (d.day) arr.push(d.day);
      daysByRoutine.set(d.routine_id, arr);
    }
    if (authed) {
      await this.supabase.upsertProgram({ name, description: bundle.program.description || undefined });
      for (const r of (bundle.routines || [])) {
        const exs = (bundle.exercises || [])
          .filter((e: any) => e.routine_id === r.id)
          .map((e: any, idx: number) => ({
            exerciseId: e.exercise_id,
            exerciseName: e.exercise_name || '',
            weight: typeof e.weight === 'number' ? e.weight : 0,
            weightUnit: e.weight_unit || 'lb',
            targetSets: e.target_sets,
            targetReps: e.target_reps,
            reserveReps: typeof e.reserve_reps === 'number' ? e.reserve_reps : 0,
            notes: e.notes || '',
            order: typeof e.order_index === 'number' ? e.order_index : idx,
            sets: e.sets_json ? (() => { try { return JSON.parse(e.sets_json); } catch { return []; } })() : [],
          }));
        await this.supabase.upsertRoutine({
          name: r.name,
          description: r.description || undefined,
          frequency: r.frequency || 'weekly',
          days: Array.from(new Set(daysByRoutine.get(r.id) || [])),
          isActive: !!r.is_active,
          programName: name,
          exercises: exs,
          createdAt: new Date(r.created_at || Date.now()),
          updatedAt: new Date(),
        } as any);
      }
      try {
        const latestPrograms = await this.getPrograms();
        await this.saveProgramsOrder(latestPrograms.map(p => p.name));
      } catch {}
    } else {
      await this.saveProgram({ name, description: bundle.program.description || undefined });
      for (const r of (bundle.routines || [])) {
        const exs = (bundle.exercises || [])
          .filter((e: any) => e.routine_id === r.id)
          .map((e: any, idx: number) => ({
            exerciseId: e.exercise_id,
            exerciseName: e.exercise_name || '',
            weight: typeof e.weight === 'number' ? e.weight : 0,
            weightUnit: e.weight_unit || 'lb',
            targetSets: e.target_sets,
            targetReps: e.target_reps,
            reserveReps: typeof e.reserve_reps === 'number' ? e.reserve_reps : 0,
            notes: e.notes || '',
            order: typeof e.order_index === 'number' ? e.order_index : idx,
            sets: e.sets_json ? (() => { try { return JSON.parse(e.sets_json); } catch { return []; } })() : [],
          }));
        const payload: Routine = {
          id: r.id,
          name: r.name,
          description: r.description || '',
          exercises: exs,
          frequency: r.frequency || 'weekly',
          days: Array.from(new Set(daysByRoutine.get(r.id) || [])),
          isActive: !!r.is_active,
          createdAt: new Date(r.created_at || Date.now()),
          updatedAt: new Date(),
          programName: name,
        };
        await this.saveRoutine(payload);
      }
    }
    return name;
  }

  async importRoutineByCode(code: string, targetProgramName?: string): Promise<string | null> {
    if (await this.supabase.isAuthenticated()) {
      const data = await (this.supabase.getRoutineByCode(code));
      if (!data) return null;
      const r = data.routine;
      const baseName = (r.name || 'Imported Routine').trim();
      let name = baseName;
      try {
        const existing = await this.getRoutines();
        const names = new Set(
          (existing || [])
            .filter(rr => !targetProgramName || (rr.programName === targetProgramName))
            .map(rr => (rr.name || '').trim())
        );
        if (names.has(name)) {
          let i = 1;
          while (names.has(`${baseName} ${i}`)) i++;
          name = `${baseName} ${i}`;
        }
      } catch {}
      const exs = (data.exercises || []).map((e: any, idx: number) => ({
        exerciseId: e.exercise_id,
        exerciseName: e.exercise_name || '',
        weight: typeof e.weight === 'number' ? e.weight : 0,
        weightUnit: e.weight_unit || 'lb',
        targetSets: e.target_sets,
        targetReps: e.target_reps,
        reserveReps: typeof e.reserve_reps === 'number' ? e.reserve_reps : 0,
        notes: e.notes || '',
        order: typeof e.order_index === 'number' ? e.order_index : idx,
        sets: e.sets_json ? (() => { try { return JSON.parse(e.sets_json); } catch { return []; } })() : [],
      }));
      await this.supabase.upsertRoutine({
        name,
        description: r.description || undefined,
        frequency: r.frequency || 'weekly',
        days: Array.from(new Set((data.days || []).map((d: any) => d.day))),
        isActive: !!r.is_active,
        programName: targetProgramName,
        exercises: exs,
        createdAt: new Date(r.created_at),
        updatedAt: new Date(),
      } as any);
      return name;
    }
    return null;
  }

  /**
   * Training state persistence (Preferences on all platforms)
   */
  async setTrainingState(state: { inProgress: boolean; startedAt: string; routineIds?: string[]; exercises?: any[] }): Promise<void> {
    await Preferences.set({ key: 'training_state', value: JSON.stringify(state) });
  }

  async getTrainingState(): Promise<{ inProgress: boolean; startedAt: string; routineIds?: string[]; exercises?: any[] } | null> {
    const result = await Preferences.get({ key: 'training_state' });
    if (!result.value) return null;
    try {
      return JSON.parse(result.value);
    } catch {
      return null;
    }
  }

  async clearTrainingState(): Promise<void> {
    await Preferences.remove({ key: 'training_state' });
  }

  /** Persist training order for a given date (Preferences-backed) */
  async saveTrainingOrder(dateStr: string, exerciseIds: string[]): Promise<void> {
    try { await Preferences.set({ key: `training_order_${dateStr}`, value: JSON.stringify(exerciseIds) }); } catch {}
  }
  async getTrainingOrder(dateStr: string): Promise<string[]> {
    try {
      const res = await Preferences.get({ key: `training_order_${dateStr}` });
      return res.value ? JSON.parse(res.value) : [];
    } catch { return []; }
  }

  async updateRoutineExerciseSets(routineId: string, exerciseId: string, sets: Array<{ reps: number; weight: number; rir: number; unit?: 'lb'|'kg' }>, targetReps?: number, orderIndex?: number): Promise<void> {
    if (await this.supabase.isAuthenticated()) { try { await (this.supabase as any).updateRoutineExerciseSets?.(routineId, exerciseId, sets, targetReps, orderIndex); return; } catch {} }
    if (this.isWebEnvironment()) {
      try {
        const res = await Preferences.get({ key: 'routines' });
        const routines: Routine[] = res.value ? JSON.parse(res.value) : [];
        const updated = routines.map(r => {
          if (r.id !== routineId) return r;
          const exs = (r.exercises || []).map(e => {
            if (e.exerciseId !== exerciseId) return e;
            // Filter by orderIndex if provided (to handle duplicates)
            if (typeof orderIndex === 'number' && e.order !== orderIndex) return e;

            const next: any = { ...e };
            if (typeof targetReps === 'number') next.targetReps = targetReps;
            next.sets = sets;
            return next;
          });
          return { ...r, exercises: exs } as any;
        });
        await Preferences.set({ key: 'routines', value: JSON.stringify(updated) });
      } catch {}
      return;
    }
    if (!this.db) throw new Error('Database not initialized');
    const setsSerialized = JSON.stringify(sets || []);
    // Use orderIndex in WHERE clause if available
    if (typeof orderIndex === 'number') {
        await this.db.run(`UPDATE routine_exercises SET setsJson = ? WHERE routineId = ? AND exerciseId = ? AND orderIndex = ?`, [setsSerialized, routineId, exerciseId, orderIndex]);
        if (typeof targetReps === 'number') {
          await this.db.run(`UPDATE routine_exercises SET targetReps = ? WHERE routineId = ? AND exerciseId = ? AND orderIndex = ?`, [targetReps, routineId, exerciseId, orderIndex]);
        }
    } else {
        await this.db.run(`UPDATE routine_exercises SET setsJson = ? WHERE routineId = ? AND exerciseId = ?`, [setsSerialized, routineId, exerciseId]);
        if (typeof targetReps === 'number') {
          await this.db.run(`UPDATE routine_exercises SET targetReps = ? WHERE routineId = ? AND exerciseId = ?`, [targetReps, routineId, exerciseId]);
        }
    }
  }

  async updateRoutineExerciseWeight(routineId: string, exerciseId: string, weight: number, orderIndex?: number): Promise<void> {
    if (await this.supabase.isAuthenticated()) {
      try { await (this.supabase as any).updateRoutineExerciseWeight?.(routineId, exerciseId, weight, orderIndex); return; } catch {}
    }
    if (this.isWebEnvironment()) {
      try {
        const res = await Preferences.get({ key: 'routines' });
        const routines: Routine[] = res.value ? JSON.parse(res.value) : [];
        const updated = routines.map(r => {
          if (r.id !== routineId) return r;
          const exs = (r.exercises || []).map(e => {
            if (e.exerciseId !== exerciseId) return e;
            if (typeof orderIndex === 'number' && e.order !== orderIndex) return e;
            return { ...e, weight };
          });
          return { ...r, exercises: exs } as any;
        });
        await Preferences.set({ key: 'routines', value: JSON.stringify(updated) });
      } catch {}
      return;
    }
    if (!this.db) throw new Error('Database not initialized');
    if (typeof orderIndex === 'number') {
      await this.db.run(`UPDATE routine_exercises SET weight = ? WHERE routineId = ? AND exerciseId = ? AND orderIndex = ?`, [weight, routineId, exerciseId, orderIndex]);
    } else {
      await this.db.run(`UPDATE routine_exercises SET weight = ? WHERE routineId = ? AND exerciseId = ?`, [weight, routineId, exerciseId]);
    }
  }

  async updateRoutineExerciseGoal(routineId: string, exerciseId: string, goalWeight: number | null, goalUnit: 'lb'|'kg' | null): Promise<void> {
    if (await this.supabase.isAuthenticated()) { try { await (this.supabase as any).updateRoutineExerciseGoal?.(routineId, exerciseId, goalWeight, goalUnit); return; } catch {} }
    if (this.isWebEnvironment()) {
      try {
        const res = await Preferences.get({ key: 'routines' });
        const routines: Routine[] = res.value ? JSON.parse(res.value) : [];
        const updated = routines.map(r => {
          if (r.id !== routineId) return r;
          const exs = (r.exercises || []).map(e => {
            if (e.exerciseId !== exerciseId) return e;
            const next: any = { ...e };
            next.goalWeight = goalWeight ?? undefined;
            next.goalUnit = goalUnit ?? undefined;
            return next;
          });
          return { ...r, exercises: exs } as any;
        });
        await Preferences.set({ key: 'routines', value: JSON.stringify(updated) });
      } catch {}
      return;
    }
    if (!this.db) throw new Error('Database not initialized');
    await this.db.run(`UPDATE routine_exercises SET goalWeight = ?, goalUnit = ? WHERE routineId = ? AND exerciseId = ?`, [goalWeight, goalUnit, routineId, exerciseId]);
  }

  async updateRoutineExerciseOrder(routineId: string, orderedExerciseIds: string[]): Promise<void> {
    if (await this.supabase.isAuthenticated()) { try { await this.supabase.updateRoutineExerciseOrder(routineId, orderedExerciseIds); return; } catch {} }
    if (this.isWebEnvironment()) {
      try {
        const res = await Preferences.get({ key: 'routines' });
        const routines: Routine[] = res.value ? JSON.parse(res.value) : [];
        const updated = routines.map(r => {
          if (r.id !== routineId) return r;
          const exs = [...(r.exercises || [])].sort((a, b) => {
            const ai = orderedExerciseIds.indexOf(a.exerciseId);
            const bi = orderedExerciseIds.indexOf(b.exerciseId);
            const av = ai >= 0 ? ai : Number.MAX_SAFE_INTEGER;
            const bv = bi >= 0 ? bi : Number.MAX_SAFE_INTEGER;
            return av - bv;
          }).map((e, idx) => ({ ...e, order: idx }));
          return { ...r, exercises: exs } as any;
        });
        await Preferences.set({ key: 'routines', value: JSON.stringify(updated) });
      } catch {}
      return;
    }
    if (!this.db) throw new Error('Database not initialized');
    for (let i = 0; i < orderedExerciseIds.length; i++) {
      const id = orderedExerciseIds[i];
      await this.db.run(`UPDATE routine_exercises SET orderIndex = ? WHERE routineId = ? AND exerciseId = ?`, [i, routineId, id]);
    }
  }

  async saveWorkoutSessionLocal(dateUS: string, startTs: number, endTs: number, durationSec: number, exercises?: any[], completedRoutineIds?: string[]): Promise<void> {
    try {
      const payload = { startTs, endTs, durationSec, exercises, completedRoutineIds };
      await Preferences.set({ key: `workout_session_${dateUS}`, value: JSON.stringify(payload) });
    } catch {}
  }
  async getWorkoutSessionLocal(dateUS: string): Promise<{ startTs: number; endTs: number; durationSec: number; exercises?: any[]; completedRoutineIds?: string[] } | null> {
    try {
      const res = await Preferences.get({ key: `workout_session_${dateUS}` });
      return res.value ? JSON.parse(res.value) : null;
    } catch { return null; }
  }
  async clearWorkoutSessionLocal(dateUS: string): Promise<void> {
    try { await Preferences.remove({ key: `workout_session_${dateUS}` }); } catch {}
  }

  async appendWorkoutSegmentLocal(dateUS: string, startTs: number, endTs: number, durationSec: number, routineIds?: string[]): Promise<void> {
    try {
      const res = await Preferences.get({ key: `workout_segments_${dateUS}` });
      const list: Array<{ startTs: number; endTs: number; durationSec: number; routineIds?: string[] }> = res.value ? JSON.parse(res.value) : [];
      list.push({ startTs, endTs, durationSec, routineIds: Array.isArray(routineIds) ? routineIds : undefined });
      await Preferences.set({ key: `workout_segments_${dateUS}`, value: JSON.stringify(list) });
      const total = list.reduce((acc, s) => acc + (Number(s.durationSec) || 0), 0);
      await Preferences.set({ key: `workout_total_${dateUS}`, value: String(total) });
    } catch {}
  }
  async getWorkoutTotalDurationLocal(dateUS: string): Promise<number> {
    try {
      const segs = await Preferences.get({ key: `workout_segments_${dateUS}` });
      const list: Array<{ durationSec: number; routineIds?: string[] }> = segs.value ? JSON.parse(segs.value) : [];
      const num = (v: any) => (typeof v === 'number' ? v : Number(v || 0));
      const sum = list.reduce((acc, s) => acc + num(s.durationSec), 0);
      if (sum > 0) {
        await Preferences.set({ key: `workout_total_${dateUS}`, value: String(Math.round(sum)) });
        return Math.round(sum);
      }
      const legacy = await this.getWorkoutSessionLocal(dateUS);
      return legacy && typeof legacy.durationSec === 'number' ? Math.round(legacy.durationSec) : 0;
    } catch { return 0; }
  }

  async clearWorkoutSegmentsLocal(dateUS: string): Promise<void> {
    try { await Preferences.remove({ key: `workout_segments_${dateUS}` }); } catch {}
    try { await Preferences.remove({ key: `workout_total_${dateUS}` }); } catch {}
  }

  async clearWorkoutSegmentsForRoutineLocal(dateUS: string, routineId: string): Promise<void> {
    if (!routineId) return;
    try {
      const segs = await Preferences.get({ key: `workout_segments_${dateUS}` });
      const list: Array<{ startTs: number; endTs: number; durationSec: number; routineIds?: string[] }> = segs.value ? JSON.parse(segs.value) : [];
      if (!Array.isArray(list) || list.length === 0) return;
      const out: Array<{ startTs: number; endTs: number; durationSec: number; routineIds?: string[] }> = [];
      for (const s of list) {
        const rids = Array.isArray(s.routineIds) ? s.routineIds : [];
        if (!rids.includes(routineId)) { out.push(s); continue; }
        const nextRids = rids.filter(id => id !== routineId);
        if (nextRids.length > 0) out.push({ ...s, routineIds: nextRids });
      }
      await Preferences.set({ key: `workout_segments_${dateUS}`, value: JSON.stringify(out) });
      const num = (v: any) => (typeof v === 'number' ? v : Number(v || 0));
      const total = out.reduce((acc, s) => acc + num(s.durationSec), 0);
      await Preferences.set({ key: `workout_total_${dateUS}`, value: String(Math.round(total)) });
    } catch {}
  }

  async getRoutineDurationForDate(dateUS: string, routineId: string): Promise<number> {
    if (!routineId) return 0;
    try {
      const segs = await Preferences.get({ key: `workout_segments_${dateUS}` });
      const list: Array<{ durationSec: number; routineIds?: string[] }> = segs.value ? JSON.parse(segs.value) : [];
      const sum = list.reduce((acc, s) => acc + ((Array.isArray(s.routineIds) && s.routineIds.includes(routineId)) ? (Number(s.durationSec) || 0) : 0), 0);
      return Math.round(sum);
    } catch { return 0; }
  }

  async getOnboardingCompleted(): Promise<boolean> {
    const res = await Preferences.get({ key: 'onboarding_completed' });
    return res.value === 'true';
  }

  async setOnboardingCompleted(val: boolean): Promise<void> {
    await Preferences.set({ key: 'onboarding_completed', value: val ? 'true' : 'false' });
  }

  async clearAllData(): Promise<void> {
    if (this.isWebEnvironment()) {
      await Preferences.clear();
      return;
    }
    if (!this.db) throw new Error('Database not initialized');
    try {
      await this.db.run('DELETE FROM exercise_sets');
      await this.db.run('DELETE FROM exercise_logs');
      await this.db.run('DELETE FROM routine_exercises');
      await this.db.run('DELETE FROM routine_days');
      await this.db.run('DELETE FROM routines');
      await this.db.run('DELETE FROM exercises');
      await this.db.run('DELETE FROM user_preferences');
    } catch {}
    try {
      await Preferences.clear();
    } catch {}
  }

  async getLanguage(): Promise<'en' | 'es' | 'de' | 'ko'> {
    const res = await Preferences.get({ key: 'language' });
    const v = (res.value || 'en');
    return (v === 'es' || v === 'de' || v === 'ko') ? (v as any) : 'en';
  }

  async setLanguage(lang: 'en' | 'es' | 'de' | 'ko'): Promise<void> {
    await Preferences.set({ key: 'language', value: lang });
  }
  async saveUserWeightLog(entry: Omit<UserWeightLog, 'id' | 'createdAt'>): Promise<UserWeightLog> {
    if (await this.supabase.isAuthenticated()) {
      const res = await this.supabase.addWeightLog(entry.weight, entry.unit, entry.date);
      return { id: res.id, date: res.date, weight: res.weight, unit: res.unit, createdAt: res.date };
    }
    if (this.isWebEnvironment()) {
      const res = await Preferences.get({ key: 'user_weight_logs' });
      const list: UserWeightLog[] = res.value ? JSON.parse(res.value) : [];
      const log: UserWeightLog = { id: this.generateId(), ...entry, createdAt: new Date() };
      list.push({ ...log, date: entry.date });
      await Preferences.set({ key: 'user_weight_logs', value: JSON.stringify(list) });
      return log;
    }
    if (!this.db) throw new Error('Database not initialized');
    const id = this.generateId();
    const now = new Date().toISOString();
    const dateStr = entry.date.toISOString();
    await this.db.run(
      `INSERT INTO user_weight_logs (id, date, weight, unit, createdAt) VALUES (?, ?, ?, ?, ?)`,
      [id, dateStr, entry.weight, entry.unit, now]
    );
    const saved = { id, date: entry.date, weight: entry.weight, unit: entry.unit, createdAt: new Date(now) };
    return saved;
  }

  async getUserWeightLogs(): Promise<UserWeightLog[]> {
    if (this.supabase.isLoggingOutState) return [];
    if (await this.supabase.isAuthenticated()) {
      try { const rows = await this.supabase.getUserWeightLogs(); return rows.map(r => ({ id: r.id, date: r.date, weight: r.weight, unit: r.unit, createdAt: r.date })); } catch { return []; }
    }
    if (this.isWebEnvironment()) return [];
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.query('SELECT * FROM user_weight_logs ORDER BY date DESC');
    return (result.values || []).map(r => ({ id: r.id, date: new Date(r.date), weight: r.weight, unit: r.unit, createdAt: new Date(r.createdAt) }));
  }

  async deleteUserWeightLog(id: string): Promise<void> {
    if (await this.supabase.isAuthenticated()) { await this.supabase.deleteUserWeightLog(id); return; }
    if (this.isWebEnvironment()) {
      const res = await Preferences.get({ key: 'user_weight_logs' });
      const list: UserWeightLog[] = res.value ? JSON.parse(res.value) : [];
      const filtered = list.filter(l => l.id !== id);
      await Preferences.set({ key: 'user_weight_logs', value: JSON.stringify(filtered) });
      return;
    }
    if (!this.db) throw new Error('Database not initialized');
    await this.db.run('DELETE FROM user_weight_logs WHERE id = ?', [id]);
  }

}

// no-op

import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { CapacitorSQLite, SQLiteDBConnection, SQLiteConnection, capSQLiteSet } from '@capacitor-community/sqlite';
import { Exercise, ExerciseLog, ExerciseSet } from '../models/exercise.model';
import { Routine, RoutineExercise, UserPreferences } from '../models/routine.model';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private sqlite: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;
  private isInitialized = false;

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
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
        console.log('Running in web environment - using Preferences storage');
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

    await this.db.execute(createExercisesTable);
    await this.db.execute(createExerciseLogsTable);
    await this.db.execute(createExerciseSetsTable);
    await this.db.execute(createRoutinesTable);
    await this.db.execute(createRoutineExercisesTable);
    try { await this.db.run(`ALTER TABLE routine_exercises ADD COLUMN weight REAL DEFAULT 0`); } catch {}
    try { await this.db.run(`ALTER TABLE routine_exercises ADD COLUMN weightUnit TEXT DEFAULT 'lb'`); } catch {}
    try { await this.db.run(`ALTER TABLE routine_exercises ADD COLUMN reserveReps INTEGER DEFAULT 0`); } catch {}
    try { await this.db.run(`ALTER TABLE routine_exercises ADD COLUMN notes TEXT DEFAULT ''`); } catch {}
    await this.db.execute(createRoutineDaysTable);
    await this.db.execute(createUserPreferencesTable);
    try { await this.db.run(`ALTER TABLE routines ADD COLUMN programName TEXT`); } catch {}
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
    if (this.isWebEnvironment()) {
      // Return mock data for web environment
      return this.getMockExercises();
    }

    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.query('SELECT * FROM exercises ORDER BY name');
    return result.values || [];
  }

  /**
   * Get exercise by ID
   */
  async getExerciseById(id: string): Promise<Exercise | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.query('SELECT * FROM exercises WHERE id = ?', [id]);
    return result.values?.[0] || null;
  }

  /**
   * Create custom exercise
   */
  async createExercise(exercise: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>): Promise<Exercise> {
    if (!this.db) throw new Error('Database not initialized');

    const id = this.generateId();
    const now = new Date().toISOString();

    await this.db.run(`
      INSERT INTO exercises (id, name, muscleGroup, equipment, description, isCustom, defaultWeightUnit, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `, [id, exercise.name, exercise.muscleGroup, exercise.equipment, exercise.description || '', exercise.defaultWeightUnit, now, now]);

    return {
      id,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      equipment: exercise.equipment,
      description: exercise.description,
      isCustom: true,
      defaultWeightUnit: exercise.defaultWeightUnit,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    };
  }

  /**
   * Log exercise
   */
  async logExercise(log: Omit<ExerciseLog, 'id' | 'createdAt'>): Promise<ExerciseLog> {
    if (this.isWebEnvironment()) {
      // In web environment, just log the exercise for now
      console.log('Exercise logged:', log);
      return {
        id: this.generateId(),
        ...log,
        createdAt: new Date()
      };
    }

    if (!this.db) throw new Error('Database not initialized');

    const id = this.generateId();
    const now = new Date().toISOString();
    const dateStr = log.date.toISOString();

    await this.db.run(`
      INSERT INTO exercise_logs (id, exerciseId, routineId, notes, date, totalVolume, maxWeight, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, log.exerciseId, log.routineId || null, log.notes || '', dateStr, log.totalVolume, log.maxWeight, now]);

    // Insert sets
    for (let i = 0; i < log.sets.length; i++) {
      const set = log.sets[i];
      await this.db.run(`
        INSERT INTO exercise_sets (logId, reps, weight, weightUnit, isPersonalRecord, orderIndex)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, set.reps, set.weight, set.weightUnit, set.isPersonalRecord ? 1 : 0, i]);
    }

    return {
      id,
      exerciseId: log.exerciseId,
      routineId: log.routineId,
      sets: log.sets,
      notes: log.notes,
      date: log.date,
      totalVolume: log.totalVolume,
      maxWeight: log.maxWeight,
      createdAt: new Date(now)
    };
  }

  /**
   * Get user preferences (fixed values - no settings needed)
   */
  async getUserPreferences(): Promise<UserPreferences> {
    // Always return fixed values - no settings needed
    return {
      weightUnit: 'lb',
      theme: 'dark',
      dateFormat: 'MM/DD/YYYY',
      notificationsEnabled: true
    };
  }

  /**
   * Update user preference (no-op since settings are removed)
   */
  async updateUserPreference(key: string, value: string): Promise<void> {
    // No-op since settings are removed - preferences are fixed
    console.log(`Preference update ignored: ${key} = ${value}`);
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
    if (this.isWebEnvironment()) {
      return this.getMockExerciseLogs();
    }

    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.query('SELECT * FROM exercise_logs ORDER BY date DESC');
    return result.values || [];
  }

  /**
   * Save routine
   */
  async saveRoutine(routine: Routine): Promise<void> {
    if (this.isWebEnvironment()) {
      // Store in Preferences for web environment
      const routines = await this.getRoutines();
      const existingIndex = routines.findIndex(r => r.id === routine.id);

      if (existingIndex >= 0) {
        routines[existingIndex] = routine;
      } else {
        routines.push(routine);
      }

      await Preferences.set({
        key: 'routines',
        value: JSON.stringify(routines)
      });
      return;
    }

    if (!this.db) throw new Error('Database not initialized');

    // Save routine
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

    // Delete existing routine exercises
    await this.db.run('DELETE FROM routine_exercises WHERE routineId = ?', [routine.id]);
    // Delete existing routine days
    await this.db.run('DELETE FROM routine_days WHERE routineId = ?', [routine.id]);

    // Insert routine exercises
    for (const exercise of routine.exercises) {
      let exerciseId = exercise.exerciseId;
      const existing = await this.getExerciseById(exerciseId);
      if (!existing) {
        const created = await this.createExercise({
          name: exercise.exerciseName,
          muscleGroup: 'full_body',
          equipment: 'other',
          description: '',
          defaultWeightUnit: exercise.weightUnit,
          isCustom: true
        });
        exerciseId = created.id;
      }
      await this.db.run(`
        INSERT INTO routine_exercises (routineId, exerciseId, targetSets, targetReps, orderIndex, weight, weightUnit, reserveReps, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        routine.id,
        exerciseId,
        exercise.targetSets,
        exercise.targetReps,
        exercise.order,
        (isNaN(Number(exercise.weight)) ? 0 : Number(exercise.weight)),
        (exercise.weightUnit || 'lb'),
        (isNaN(Number((exercise.reserveReps as number))) ? 0 : Number((exercise.reserveReps as number))),
        exercise.notes || ''
      ]);
    }

    // Insert routine days (deduplicated)
    const daysToInsert = Array.from(new Set(routine.days || []));
    for (const day of daysToInsert) {
      await this.db.run(
        `INSERT INTO routine_days (routineId, day) VALUES (?, ?)`,
        [routine.id, day]
      );
    }
  }

  /**
   * Get routines
   */
  async getRoutines(): Promise<Routine[]> {
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

      const exercises: RoutineExercise[] = (exercisesResult.values || []).map(ex => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        weight: typeof ex.weight === 'number' ? ex.weight : 0,
        weightUnit: ex.weightUnit || ex.defaultWeightUnit || 'lb',
        targetSets: ex.targetSets,
        targetReps: ex.targetReps,
        reserveReps: typeof ex.reserveReps === 'number' ? ex.reserveReps : 0,
        notes: ex.notes || '',
        order: ex.orderIndex
      }));

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

    return routines;
  }

  /** Programs API (Preferences-backed) */
  async getPrograms(): Promise<{ name: string; description?: string }[]> {
    try {
      const result = await Preferences.get({ key: 'programs' });
      return result.value ? JSON.parse(result.value) : [];
    } catch { return []; }
  }

  async saveProgram(program: { name: string; description?: string }): Promise<void> {
    const list = await this.getPrograms();
    const idx = list.findIndex(p => p.name === program.name);
    if (idx >= 0) list[idx] = program; else list.push(program);
    await Preferences.set({ key: 'programs', value: JSON.stringify(list) });
  }

  async saveProgramsList(programs: { name: string; description?: string }[]): Promise<void> {
    try {
      await Preferences.set({ key: 'programs', value: JSON.stringify(programs) });
    } catch {}
  }

  async deleteProgram(name: string): Promise<void> {
    const list = await this.getPrograms();
    const filtered = list.filter(p => p.name !== name);
    await Preferences.set({ key: 'programs', value: JSON.stringify(filtered) });

    if (this.isWebEnvironment()) {
      const routines = await this.getRoutines();
      const target = name.trim().toLowerCase();
      const updated = routines.map(r => (((r.programName || '').trim().toLowerCase()) === target ? { ...r, programName: undefined } : r));
      await Preferences.set({ key: 'routines', value: JSON.stringify(updated) });
      return;
    }

    if (!this.db) return;
    try {
      await this.db.run('UPDATE routines SET programName = NULL WHERE programName = ?', [name]);
    } catch {}
  }

  async saveRoutinesOrder(routines: Routine[]): Promise<void> {
    // Persist order only in web environment (Preferences-backed)
    try {
      const data = routines.map(r => ({ ...r }));
      await Preferences.set({ key: 'routines', value: JSON.stringify(data) });
    } catch {}
  }

  /**
   * Delete routine
   */
  async deleteRoutine(id: string): Promise<void> {
    if (this.isWebEnvironment()) {
      const routines = await this.getRoutines();
      const filteredRoutines = routines.filter(r => r.id !== id);

      await Preferences.set({
        key: 'routines',
        value: JSON.stringify(filteredRoutines)
      });
      return;
    }

    if (!this.db) throw new Error('Database not initialized');

    await this.db.run('DELETE FROM routine_exercises WHERE routineId = ?', [id]);
    await this.db.run('DELETE FROM routine_days WHERE routineId = ?', [id]);
    await this.db.run('DELETE FROM routines WHERE id = ?', [id]);
  }

  /**
   * Training state persistence (Preferences on all platforms)
   */
  async setTrainingState(state: { inProgress: boolean; startedAt: string }): Promise<void> {
    await Preferences.set({ key: 'training_state', value: JSON.stringify(state) });
  }

  async getTrainingState(): Promise<{ inProgress: boolean; startedAt: string } | null> {
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

  async getOnboardingCompleted(): Promise<boolean> {
    const res = await Preferences.get({ key: 'onboarding_completed' });
    return res.value === 'true';
  }

  async setOnboardingCompleted(val: boolean): Promise<void> {
    await Preferences.set({ key: 'onboarding_completed', value: val ? 'true' : 'false' });
  }

  async getLanguage(): Promise<'en' | 'es'> {
    const res = await Preferences.get({ key: 'language' });
    const v = (res.value || 'en');
    return (v === 'es' ? 'es' : 'en');
  }

  async setLanguage(lang: 'en' | 'es'): Promise<void> {
    await Preferences.set({ key: 'language', value: lang });
  }
}

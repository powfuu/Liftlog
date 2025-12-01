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
        updatedAt: new Date(row.updatedAt)
      });
    }

    return routines;
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
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, IonModal, IonDatetime, IonPopover } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { flame, calendar, barbell, informationCircle, close, refresh, chevronDown, chevronUp, checkmark, add, remove, funnel, apps, globe, chevronBack, chevronForward, trash, swapVertical } from 'ionicons/icons';
import { Router } from '@angular/router';
import { StoreService } from '../services/store.service';
import { AlertService } from '../services/alert.service';
import { NotchHeaderComponent } from '../shared/notch-header/notch-header.component';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay } from 'date-fns';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonIcon, IonModal, IonDatetime, IonPopover, NotchHeaderComponent]
})
export class HomePage implements OnInit {
  showTraining = false;
  trainingInitiated = false;
  showProgramFilter = false;
  selectedProgramFilter: string = 'all';
  panelState: 'entering'|'exiting'|'idle' = 'idle';
  routinesToday: any[] = [];
  todayExercises: any[] = [];
  todayLabel = '';
  totalExercisesToday = 0;
  todayDateStr = '';
  todayDateShort = '';
  showPreview = false;
  previewRoutine: any | null = null;
  isLoading = false;
  private expandedIds = new Set<string>();
  private elapsedSeconds = 0;
  private timerId: any;
  private resumeChecked = false;
  private focusedInputs = new Set<string>();

  constructor(private router: Router, private store: StoreService, private storage: StorageService, private alerts: AlertService) {
    addIcons({ flame, calendar, barbell, informationCircle, close, refresh, chevronDown, chevronUp, checkmark, add, remove, funnel, apps, globe, chevronBack, chevronForward, trash, swapVertical });
  }

  async ngOnInit() {
    try {
      const langRes = await Preferences.get({ key: 'language' });
      this.selectedLanguage = langRes.value === 'es' ? 'es' : 'en';
    } catch { this.selectedLanguage = 'en'; }
    const today = new Date();
    this.selectedDateISO = today.toISOString();
    this.applySelectedDate(today);
  }

  private async bootstrapData(dayName: string) {
    try {
      await this.storage.initializeDatabase();
      this.store.getState$().subscribe(state => {
        this.isLoading = state.isLoading;
        const routines = state.routines || [];
        this.routinesToday = routines.filter(r => Array.isArray(r.days) ? r.days.includes(dayName) : r.frequency === 'daily');
        this.totalExercisesToday = this.routinesToday.reduce((sum, r) => sum + (r.exercises?.length || 0), 0);
        if (!this.resumeChecked) { this.resumeTrainingIfNeeded(dayName); }
      });
      await this.loadCompletedForToday();
    } catch {}
  }

  navigateToRoutines() { this.router.navigate(['/tabs/programs']); }
  formatTimer(): string { const m = Math.floor(this.elapsedSeconds / 60); const s = this.elapsedSeconds % 60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
  async finishTraining() { this.panelState = 'exiting'; await this.finishTrainingAndMark(); this.showTraining = false; setTimeout(()=>{ this.panelState = 'idle'; }, 280); }
  getTotalTargetSets(): number { return this.todayExercises.reduce((sum, ex) => sum + (Number(ex.targetSets) || 0), 0); }
  isExpanded(ex: any): boolean { return this.expandedIds.has(ex.exerciseId); }
  toggleExercise(ex: any) { if (this.expandedIds.has(ex.exerciseId)) { this.expandedIds.delete(ex.exerciseId); } else { this.expandedIds.add(ex.exerciseId); } }
  adjustValue(ex: any, field: keyof any, delta: number, min: number, max: number) { const next = Math.max(min, Math.min(max, Number(ex[field]) + delta)); (ex as any)[field] = next; this.persistExercise(ex); }
  setUnit(ex: any, unit: 'lb'|'kg') { ex.weightUnit = unit; this.persistExercise(ex); }

  trackBySetIndex(index: number): number { return index; }
  private key(ex: any, index: number, field: 'reps' | 'weight' | 'rir'): string { return `${ex.exerciseId}:${index}:${field}`; }
  private isInputFocused(ex: any, index: number, field: 'reps' | 'weight' | 'rir'): boolean { return this.focusedInputs.has(this.key(ex, index, field)); }
  onInputFocus(ex: any, index: number, field: 'reps' | 'weight' | 'rir') { this.focusedInputs.add(this.key(ex, index, field)); }
  onInputBlur(ex: any, index: number, field: 'reps' | 'weight' | 'rir') { this.focusedInputs.delete(this.key(ex, index, field)); }
  getDisplayValue(ex: any, index: number, field: 'reps' | 'weight' | 'rir'): any {
    const list = this.getSets(ex);
    if (index < 0 || index >= list.length) return 0;
    const v = (list[index] as any)[field];
    if (this.isInputFocused(ex, index, field) && Number(v) === 0) return '';
    return v;
  }

  getSets(ex: any): Array<{ reps: number; weight: number; rir: number; unit?: 'kg' | 'lb'; unitOpen?: boolean; unitPulse?: boolean }> {
    const arr = (ex as any).sets as Array<{ reps: number; weight: number; rir: number; unit?: 'kg' | 'lb' }>;
    return Array.isArray(arr) ? arr : [];
  }
  addSet(ex: any) {
    const list = this.getSets(ex);
    const next = { reps: ex.targetReps || 10, weight: ex.weight || 0, rir: ex.reserveReps || 0, unit: ex.weightUnit || 'kg' } as any;
    const cur = Array.isArray((ex as any).sets) ? (ex as any).sets : [];
    (ex as any).sets = [...cur, next];
    ex.targetSets = this.getSets(ex).length;
    this.persistExercise(ex);
  }
  removeSet(ex: any, index: number) {
    const list = this.getSets(ex);
    if (index < 0 || index >= list.length) return;
    const cur = [...list];
    cur.splice(index, 1);
    (ex as any).sets = cur;
    ex.targetSets = this.getSets(ex).length;
    this.persistExercise(ex);
  }
  updateSetValue(ex: any, index: number, field: 'reps' | 'weight' | 'rir', value: any) {
    const list = this.getSets(ex);
    if (index < 0 || index >= list.length) return;
    let v = Number(value);
    if (Number.isNaN(v)) v = 0;
    if (field === 'reps') {
      v = Math.max(0, Math.min(200, Math.round(v)));
    } else if (field === 'weight') {
      v = Math.max(0, Math.min(1000, Number(v.toFixed(2))));
    } else if (field === 'rir') {
      v = Math.max(0, Math.min(10, Math.round(v)));
    }
    const cur = [...list];
    const item = { ...cur[index] } as any;
    item[field] = v;
    cur[index] = item;
    (ex as any).sets = cur;
    ex.targetSets = this.getSets(ex).length;
    this.persistExercise(ex);
  }
  setUnitForSet(ex: any, index: number, unit: 'kg' | 'lb') {
    const list = this.getSets(ex);
    if (index < 0 || index >= list.length) return;
    const cur = [...list];
    const item = { ...(cur[index] as any) };
    const prev: 'kg' | 'lb' = (item.unit as any) || ex.weightUnit || 'kg';
    if (prev === unit) return;
    const factor = unit === 'lb' ? 2.20462 : 1 / 2.20462;
    item.weight = Number((Number(item.weight || 0) * factor).toFixed(1));
    item.unit = unit;
    item.unitPulse = true;
    cur[index] = item as any;
    (ex as any).sets = cur;
    this.closeUnitDropdown(ex, index);
    setTimeout(() => {
      const l = this.getSets(ex);
      if (index < 0 || index >= l.length) return;
      const c = [...l];
      const it = { ...(c[index] as any) };
      it.unitPulse = false;
      c[index] = it;
      (ex as any).sets = c;
    }, 260);
    this.persistExercise(ex);
  }
  isUnitDropdownOpen(ex: any, index: number): boolean { const list = this.getSets(ex); const item = list[index] as any; return !!(item && item.unitOpen); }
  toggleUnitDropdown(ex: any, index: number) { const list = this.getSets(ex); if (index < 0 || index >= list.length) return; const cur = [...list]; const item = { ...(cur[index] as any) }; item.unitOpen = !item.unitOpen; cur[index] = item; (ex as any).sets = cur; }
  closeUnitDropdown(ex: any, index: number) { const list = this.getSets(ex); if (index < 0 || index >= list.length) return; const cur = [...list]; const item = { ...(cur[index] as any) }; item.unitOpen = false; cur[index] = item; (ex as any).sets = cur; }
  isUnitJustSelected(ex: any, index: number): boolean { const list = this.getSets(ex); const item = list[index] as any; return !!(item && item.unitPulse); }
  setUnitForExercise(ex: any, unit: 'kg' | 'lb') {
    const prev = ex.weightUnit || 'kg';
    if (prev === unit) return;
    const factor = unit === 'lb' ? 2.20462 : 1 / 2.20462;
    const sets = this.getSets(ex).map(s => ({ ...s, weight: Number((Number(s.weight || 0) * factor).toFixed(1)) }));
    (ex as any).sets = sets;
    ex.weight = Number(((ex.weight || 0) * factor).toFixed(1));
    ex.weightUnit = unit;
    this.persistExercise(ex);
  }
  async persistExercise(ex: any) {
    try {
      const routines = await this.storage.getRoutines();
      let changed = false;
      for (const r of routines) {
        const idx = (r.exercises || []).findIndex(e => e.exerciseId === ex.exerciseId);
        if (idx !== -1) {
          r.exercises[idx] = {
            ...r.exercises[idx],
            weight: Number(ex.weight) || 0,
            weightUnit: ex.weightUnit || 'lb',
            targetSets: Number(ex.targetSets) || 0,
            targetReps: Number(ex.targetReps) || 0,
            reserveReps: Number(ex.reserveReps) || 0,
            notes: ex.notes || ''
          } as any;
          await this.storage.saveRoutine(r);
          changed = true;
        }
      }
      if (changed) {
        const latest = await this.storage.getRoutines();
        this.store.setRoutines(latest);
      }
    } catch {}
  }
  openPreview(routine: any, ev?: Event) { if (ev) ev.stopPropagation(); this.previewRoutine = routine; this.showPreview = true; }
  closePreview() { this.showPreview = false; this.previewRoutine = null; }
  openTrainingDay() { this.openTrainingSelected(); }
  async openTrainingSelected() {
    if (this.selectedRoutineIds.size === 0 && this.previewRoutine?.id && !this.completedRoutineIds.has(this.previewRoutine.id)) {
      this.selectedRoutineIds.add(this.previewRoutine.id);
    }
    if (this.selectedRoutineIds.size === 0) return;
    const selected = this.routinesToday.filter(r => this.selectedRoutineIds.has(r.id) && !this.completedRoutineIds.has(r.id));
    const list: any[] = [];
    selected.forEach(r => r.exercises?.forEach((e: any) => list.push({ ...e })));
    if (list.length === 0) return;
    this.todayExercises = list;
    this.expandedIds = new Set(this.todayExercises.map(ex => ex.exerciseId));
    this.trainingInitiated = true;
    this.showTraining = true;
    this.panelState = 'entering';
    setTimeout(()=>{ this.panelState = 'idle'; }, 350);
    this.startTimer(0);
    try {
      await this.storage.setTrainingState({ inProgress: true, startedAt: new Date().toISOString() });
      await Preferences.set({ key: this.getTrainingSelectionKey(), value: JSON.stringify(Array.from(this.selectedRoutineIds)) });
    } catch {}
  }
  getRoutineNameForExercise(exerciseId: string): string | undefined { const r = this.routinesToday.find(rt => Array.isArray(rt.exercises) && rt.exercises.some((e: any) => e.exerciseId === exerciseId)); return r?.name; }
  getDaysPerWeekLabel(routine: any): string { const days = routine?.days || []; if (Array.isArray(days) && days.length > 0) { return `${days.length} days/week`; } switch (routine?.frequency) { case 'daily': return '7 days/week'; case 'weekly': return '1 day/week'; default: return 'Custom'; } }

  getSelectedProgramLabel(): string {
    if (this.selectedRoutineIds.size === 0) return 'Program';
    const selected = this.routinesToday.filter(r => this.selectedRoutineIds.has(r.id));
    if (selected.length === 1) {
      return selected[0].programName || 'General';
    }
    const names = Array.from(new Set(selected.map(r => r.programName || 'General')));
    return names.length === 1 ? names[0] : 'Multiple programs';
  }

  selectedRoutineIds = new Set<string>();
  completedRoutineIds = new Set<string>();
  justCompletedIds = new Set<string>();
  toggleRoutineSelection(id: string) { if (this.completedRoutineIds.has(id)) return; if (this.selectedRoutineIds.has(id)) { this.selectedRoutineIds.delete(id); } else { this.selectedRoutineIds.add(id); } }
  isRoutineSelected(id: string): boolean { return this.selectedRoutineIds.has(id); }
  isRoutineCompleted(id: string): boolean { return this.completedRoutineIds.has(id); }
  isJustCompleted(id: string): boolean { return this.justCompletedIds.has(id); }
  hasSelection(): boolean { return this.selectedRoutineIds.size > 0; }
  areAllCompleted(): boolean { return this.routinesToday.length > 0 && this.routinesToday.every(r => this.completedRoutineIds.has(r.id)); }
  getProgramsToday(): string[] { const set = new Set<string>(); for (const r of this.routinesToday) { const name = r.programName || 'General'; set.add(name); } return Array.from(set); }
  filteredRoutinesToday(): any[] { if (this.selectedProgramFilter === 'all') return this.routinesToday; return this.routinesToday.filter(r => (r.programName || 'General') === this.selectedProgramFilter); }
  setProgramFilter(p: string) { this.selectedProgramFilter = p; this.showProgramFilter = false; }
  selectablePendingCountToday(): number { const source = this.filteredRoutinesToday(); return source.filter(r => !this.completedRoutineIds.has(r.id) && !this.justCompletedIds.has(r.id)).length; }
  getStartButtonText(): string { if (this.areAllCompleted()) return 'Done for today'; if (!this.hasSelection()) return 'Select routine'; const c = this.selectedRoutineIds.size; return c === 1 ? 'Start routine' : 'Start routines'; }

  selectAllAvailable() { const source = this.filteredRoutinesToday(); source.forEach(r => { if (!this.completedRoutineIds.has(r.id) && !this.justCompletedIds.has(r.id)) { this.selectedRoutineIds.add(r.id); } }); }
  unselectAllAvailable() { const source = this.filteredRoutinesToday(); source.forEach(r => { if (!this.completedRoutineIds.has(r.id) && !this.justCompletedIds.has(r.id)) { this.selectedRoutineIds.delete(r.id); } }); }
  areAllSelectableSelected(): boolean { const source = this.filteredRoutinesToday(); const selectable = source.filter(r => !this.completedRoutineIds.has(r.id) && !this.justCompletedIds.has(r.id)); if (selectable.length === 0) return false; return selectable.every(r => this.selectedRoutineIds.has(r.id)); }
  toggleSelectAll() { if (this.areAllSelectableSelected()) { this.unselectAllAvailable(); } else { this.selectAllAvailable(); } }

  // Date & language controls
  showDatePicker = false;
  datePopoverEvent?: any;
  selectedDateISO = '';
  selectedLanguage: 'en'|'es' = 'en';
  shouldAnimateDays = false;
  isSelectedToday = true;
  isSelectedFuture = false;
  selectedDateUS = '';
  openDatePicker(ev?: Event) { this.datePopoverEvent = ev; this.showDatePicker = true; this.shouldAnimateDays = true; }
  closeDatePicker() { this.showDatePicker = false; }
  onDateChange(ev: any) { try { const iso = ev?.detail?.value; if (!iso) return; const d = new Date(iso); this.applySelectedDate(d); this.closeDatePicker(); } catch {} }
  async setLanguage(lang: 'en'|'es') { this.selectedLanguage = lang; try { await Preferences.set({ key: 'language', value: lang }); } catch {} const d = new Date(this.selectedDateISO); this.applySelectedDate(d); }
  toggleLanguage() { this.setLanguage(this.selectedLanguage === 'en' ? 'es' : 'en'); }
  getLanguageFlag(): string { return this.selectedLanguage === 'en' ? '🇺🇸' : '🇪🇸'; }
  calendarYear = 0;
  calendarMonth = 0;
  calendarDays: Date[] = [];
  calendarMonthLabel = '';
  weekdayLabels: string[] = [];
  trainedDayKeys = new Set<string>();
  prevMonth() { const d = new Date(this.calendarYear, this.calendarMonth, 1); d.setMonth(this.calendarMonth - 1); this.shouldAnimateDays = true; this.prepareCalendar(d); }
  nextMonth() { const d = new Date(this.calendarYear, this.calendarMonth, 1); d.setMonth(this.calendarMonth + 1); this.shouldAnimateDays = true; this.prepareCalendar(d); }
  selectDate(d: Date) { this.shouldAnimateDays = false; this.applySelectedDate(d); }
  confirmSelectedDate() { this.closeDatePicker(); }
  isCurrentMonth(d: Date): boolean { return isSameMonth(d, new Date(this.calendarYear, this.calendarMonth, 1)); }
  isSelected(d: Date): boolean { return isSameDay(d, new Date(this.selectedDateISO)); }
  isToday(d: Date): boolean { return isSameDay(d, new Date()); }
  isPastDay(d: Date): boolean { const t = new Date(); const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); const b = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime(); return a < b; }
  private keyForDate(d: Date): string { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; }
  isTrainedDay(d: Date): boolean { return this.trainedDayKeys.has(this.keyForDate(d)); }
  getDayNumber(d: Date): string { return format(d, 'd'); }
  getScheduledLabel(): string { return this.isSelectedToday ? 'Scheduled today' : `Scheduled on ${this.todayDateStr}`; }
  private prepareCalendar(base: Date) {
    this.calendarYear = base.getFullYear();
    this.calendarMonth = base.getMonth();
    const start = startOfMonth(base);
    const end = endOfMonth(base);
    const days: Date[] = [];
    let cur = start;
    while (cur <= end) { days.push(cur); cur = addDays(cur, 1); }
    this.calendarDays = days;
    const locale = this.selectedLanguage === 'es' ? 'es-ES' : 'en-US';
    this.calendarMonthLabel = base.toLocaleString(locale, { month: 'long' });
    const ref = new Date(2020, 5, 7);
    this.weekdayLabels = Array.from({ length: 7 }, (_, i) => new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + i).toLocaleString(locale, { weekday: 'short' })).map(s => s.replace('.', '').toUpperCase());
    this.refreshTrainedDaysForMonth(base);
  }
  async refreshTrainedDaysForMonth(base: Date) {
    try {
      const logs = await this.storage.getExerciseLogs();
      const y = base.getFullYear();
      const m = base.getMonth();
      const set = new Set<string>();
      for (const log of logs || []) {
        const dt = new Date((log as any).date);
        if (dt.getFullYear() === y && dt.getMonth() === m) {
          set.add(this.keyForDate(dt));
        }
      }
      this.trainedDayKeys = set;
    } catch {}
  }
  private applySelectedDate(d: Date) {
    this.selectedDateISO = d.toISOString();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    this.todayDateStr = `${dd}-${mm}`;
    this.todayDateShort = `${dd}-${mm}`;
    this.selectedDateUS = `${mm}-${dd}`;
    this.isSelectedToday = isSameDay(d, new Date());
    {
      const t = new Date();
      const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const b = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
      this.isSelectedFuture = a > b;
    }
    const displayLocale = this.selectedLanguage === 'es' ? 'es-ES' : 'en-US';
    const dayNameDisplay = d.toLocaleString(displayLocale, { weekday: 'long' });
    this.todayLabel = this.isSelectedToday ? `${dayNameDisplay}` : this.selectedDateUS;
    const dayNameEn = d.toLocaleString('en-US', { weekday: 'long' });
    this.bootstrapData(dayNameEn);
    this.loadCompletedForToday();
    this.prepareCalendar(d);
  }

  async loadCompletedForToday() { try { const key = this.getCompletionKey(); const res = await Preferences.get({ key }); const arr = res.value ? JSON.parse(res.value) as string[] : []; this.completedRoutineIds = new Set(arr); } catch {} }
  async saveCompletedForToday() { try { const key = this.getCompletionKey(); const arr = Array.from(this.completedRoutineIds); await Preferences.set({ key, value: JSON.stringify(arr) }); } catch {} }
  private getCompletionKey(): string { return `completed_routines_${this.todayDateStr}`; }
  private getTrainingSelectionKey(): string { return `training_selection_${this.todayDateStr}`; }

  async resetRoutineForToday(routine: any) {
    try {
      const confirmed = await this.alerts.confirm({
        header: 'Reset Routine',
        message: `Are you sure you want to reset "${routine?.name || 'this routine'}" for today? You will need to finish it again.`,
        confirmText: 'Reset',
        cancelText: 'Cancel'
      });
      if (!confirmed) return;
      this.completedRoutineIds.delete(routine.id);
      this.justCompletedIds.delete(routine.id);
      this.selectedRoutineIds.delete(routine.id);
      await this.saveCompletedForToday();
      try { await Preferences.set({ key: this.getTrainingSelectionKey(), value: JSON.stringify(Array.from(this.selectedRoutineIds)) }); } catch {}
      await this.alerts.success('Routine reset for today');
    } catch {}
  }

  async finishTrainingAndMark() {
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
    const justNow = Array.from(this.selectedRoutineIds).filter(id => !this.completedRoutineIds.has(id));
    this.justCompletedIds = new Set(justNow);
    setTimeout(async () => {
      justNow.forEach(id => this.completedRoutineIds.add(id));
      this.justCompletedIds.clear();
      this.selectedRoutineIds.clear();
      try {
        await this.saveCompletedForToday();
        await this.storage.clearTrainingState();
        await Preferences.remove({ key: this.getTrainingSelectionKey() });
        await this.alerts.success('Training finished for today, good work!');
      } catch {}
    }, 1000);
    this.elapsedSeconds = 0;
  }

  startTimer(initialSeconds?: number) {
    this.elapsedSeconds = initialSeconds ?? 0;
    if (this.timerId) { clearInterval(this.timerId); }
    this.timerId = setInterval(() => { this.elapsedSeconds += 1; }, 1000);
  }
  private async resumeTrainingIfNeeded(dayName: string) {
    try {
      const state = await this.storage.getTrainingState();
      if (state && state.inProgress && state.startedAt) {
        const started = new Date(state.startedAt);
        const now = new Date();
        const diffSec = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1000));
        const sel = await Preferences.get({ key: this.getTrainingSelectionKey() });
        const selectedIds: string[] = sel.value ? JSON.parse(sel.value) : [];
        this.selectedRoutineIds = new Set(selectedIds);
        // Determine source routines: if store hasn't loaded yet, read from storage directly
        let sourceRoutines = this.routinesToday;
        if (!sourceRoutines || sourceRoutines.length === 0) {
          const all = await this.storage.getRoutines();
          sourceRoutines = all.filter(r => Array.isArray(r.days) ? r.days.includes(dayName) : r.frequency === 'daily');
        }
        if (this.selectedRoutineIds.size === 0) {
          this.selectedRoutineIds = new Set(sourceRoutines.map(r => r.id));
        }
        const selected = sourceRoutines.filter(r => this.selectedRoutineIds.has(r.id) && !this.completedRoutineIds.has(r.id));
        const list: any[] = [];
        selected.forEach(r => r.exercises?.forEach((e: any) => list.push({ ...e })));
        if (list.length > 0) {
          this.todayExercises = list;
          this.expandedIds = new Set(this.todayExercises.map(ex => ex.exerciseId));
          this.trainingInitiated = true;
          this.showTraining = true;
          this.panelState = 'idle';
          this.startTimer(diffSec);
          this.resumeChecked = true;
        }
      }
    } catch {}
  }
}

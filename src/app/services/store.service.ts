import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Exercise, ExerciseLog } from '../models/exercise.model';
import { UserWeightLog } from '../models/weight.model';
import { Routine, UserPreferences } from '../models/routine.model';
import { StorageService } from './storage.service';

export interface AppState {
  exercises: Exercise[];
  exerciseLogs: ExerciseLog[];
  userWeightLogs: UserWeightLog[];
  routines: Routine[];
  activeRoutine: Routine | null;
  userPreferences: UserPreferences;
  isLoading: boolean;
  error: string | null;
  programs: { name: string; description?: string }[];
  hydrated: boolean;
}

const initialState: AppState = {
  exercises: [],
  exerciseLogs: [],
  userWeightLogs: [],
  routines: [],
  activeRoutine: null,
  userPreferences: {
    weightUnit: 'lb',
    theme: 'dark',
    language: 'es',
    dateFormat: 'MM/DD/YYYY',
    notificationsEnabled: true
  },
  isLoading: false,
  error: null,
  programs: [],
  hydrated: false
};

@Injectable({
  providedIn: 'root'
})
export class StoreService {
  private state$ = new BehaviorSubject<AppState>(initialState);
  private cleared$ = new BehaviorSubject<number>(0);
  dataCleared$ = this.cleared$.asObservable();

  private storageService = inject(StorageService);
  constructor() { this.initializeStore(); }

  /**
   * Initialize store with data from storage
   */
  private async initializeStore(): Promise<void> {
    try {
      this.setLoading(true);

      // Initialize storage
      await this.storageService.initializeDatabase();

      // Load exercises
      const exercises = await this.storageService.getExercises();
      this.setExercises(exercises);

      // Load exercise logs
      const exerciseLogs = await this.storageService.getExerciseLogs();
      this.setExerciseLogs(exerciseLogs);

      const userWeightLogs = await this.storageService.getUserWeightLogs();
      this.setUserWeightLogs(userWeightLogs);

      const routines = await this.storageService.getRoutines();
      try {
        const rOrder = await (this.storageService as any).getRoutinesOrder?.();
        const orderedRoutines = (Array.isArray(rOrder) && rOrder.length > 0)
          ? [...routines].sort((a, b) => {
              const ai = rOrder.indexOf(a.id);
              const bi = rOrder.indexOf(b.id);
              const av = ai >= 0 ? ai : Number.MAX_SAFE_INTEGER;
              const bv = bi >= 0 ? bi : Number.MAX_SAFE_INTEGER;
              return av - bv;
            })
          : routines;
        this.setRoutines(orderedRoutines);
      } catch {
        this.setRoutines(routines);
      }

      const programs = await this.storageService.getPrograms();
      try {
        const order = await (this.storageService as any).getProgramsOrder?.();
        const ordered = (Array.isArray(order) && order.length > 0)
          ? [...programs].sort((a, b) => {
              const ai = order.indexOf(a.name);
              const bi = order.indexOf(b.name);
              const av = ai >= 0 ? ai : Number.MAX_SAFE_INTEGER;
              const bv = bi >= 0 ? bi : Number.MAX_SAFE_INTEGER;
              return av - bv;
            })
          : programs;
        this.setPrograms(ordered);
      } catch {
        this.setPrograms(programs);
      }

      // Load user preferences
      const userPreferences = await this.storageService.getUserPreferences();
      const lang = await this.storageService.getLanguage();
      userPreferences.language = lang;
      this.setState({ userPreferences });


    } catch (error) {
      console.error('Error initializing store:', error);
      this.setError('Failed to initialize data');
    } finally {
      this.setLoading(false);
      this.setState({ hydrated: true });
    }
  }

  /**
   * Get current state
   */
  getState(): AppState {
    return this.state$.value;
  }

  /**
   * Get state as observable
   */
  getState$(): Observable<AppState> {
    return this.state$.asObservable();
  }

  /**
   * Get specific state slice
   */
  select<T>(selector: (state: AppState) => T): Observable<T> {
    return new Observable<T>(observer => {
      const currentValue = selector(this.state$.value);
      observer.next(currentValue);

      const subscription = this.state$.subscribe(state => {
        observer.next(selector(state));
      });

      return () => subscription.unsubscribe();
    });
  }

  /**
   * Set language
   */
  setLanguage(language: 'en' | 'es' | 'de' | 'ko'): void {
    this.storageService.setLanguage(language);
    this.setState({
      userPreferences: {
        ...this.state$.value.userPreferences,
        language: language as any
      }
    });
  }

  /**
   * Update state
   */
  setState(newState: Partial<AppState>): void {
    this.state$.next({
      ...this.state$.value,
      ...newState
    });
  }

  /**
   * Set loading state
   */
  setLoading(isLoading: boolean): void {
    this.setState({ isLoading });
  }

  /**
   * Set error
   */
  setError(error: string | null): void {
    this.setState({ error });
  }

  /**
   * Clear error
   */
  clearError(): void {
    this.setState({ error: null });
  }

  /**
   * Update exercises
   */
  setExercises(exercises: Exercise[]): void {
    this.setState({ exercises });
  }

  /**
   * Add exercise
   */
  addExercise(exercise: Exercise): void {
    const currentExercises = this.state$.value.exercises;
    this.setState({ exercises: [...currentExercises, exercise] });
  }

  /**
   * Update exercise logs
   */
  setExerciseLogs(logs: ExerciseLog[]): void {
    this.setState({ exerciseLogs: logs });
  }

  /**
   * Add exercise log
   */
  addExerciseLog(log: ExerciseLog): void {
    const currentLogs = this.state$.value.exerciseLogs;
    this.setState({ exerciseLogs: [...currentLogs, log] });
  }

  setUserWeightLogs(logs: UserWeightLog[]): void {
    this.setState({ userWeightLogs: logs });
  }

  addUserWeightLog(log: UserWeightLog): void {
    const currentLogs = this.state$.value.userWeightLogs;
    this.setState({ userWeightLogs: [...currentLogs, log] });
  }

  removeUserWeightLog(id: string): void {
    const currentLogs = this.state$.value.userWeightLogs;
    this.setState({ userWeightLogs: currentLogs.filter(l => l.id !== id) });
  }

  /**
   * Update routines
   */
  setRoutines(routines: Routine[]): void {
    this.setState({ routines });
  }

  setPrograms(programs: { name: string; description?: string }[]): void {
    this.setState({ programs });
  }

  /**
   * Add routine
   */
  addRoutine(routine: Routine): void {
    const currentRoutines = this.state$.value.routines;
    this.setState({ routines: [...currentRoutines, routine] });
  }

  /**
   * Update active routine
   */
  setActiveRoutine(routine: Routine | null): void {
    this.setState({ activeRoutine: routine });
  }

  /**
   * Update user preferences (no-op since settings are removed)
   */
  updateUserPreferences(preferences: Partial<UserPreferences>): void {
    // No-op since settings are removed - preferences are fixed
  }

  /**
   * Reset to initial state
   */
  resetState(): void {
    this.state$.next(initialState);
  }

  announceDataCleared(): void {
    this.cleared$.next(Date.now());
  }
}

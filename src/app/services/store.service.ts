import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Exercise, ExerciseLog } from '../models/exercise.model';
import { Routine, UserPreferences } from '../models/routine.model';
import { StorageService } from './storage.service';

export interface AppState {
  exercises: Exercise[];
  exerciseLogs: ExerciseLog[];
  routines: Routine[];
  activeRoutine: Routine | null;
  userPreferences: UserPreferences;
  isLoading: boolean;
  error: string | null;
}

const initialState: AppState = {
  exercises: [],
  exerciseLogs: [],
  routines: [],
  activeRoutine: null,
  userPreferences: {
    weightUnit: 'lbs',
    theme: 'dark',
    dateFormat: 'MM/DD/YYYY',
    notificationsEnabled: true
  },
  isLoading: false,
  error: null
};

@Injectable({
  providedIn: 'root'
})
export class StoreService {
  private state$ = new BehaviorSubject<AppState>(initialState);

  constructor(private storageService: StorageService) {
    // Initialize store asynchronously to avoid blocking
    setTimeout(() => {
      this.initializeStore();
    }, 100);
  }

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

      // Load routines
      const routines = await this.storageService.getRoutines();
      this.setRoutines(routines);

      // Load user preferences
      const userPreferences = await this.storageService.getUserPreferences();
      this.setState({ userPreferences });

    } catch (error) {
      console.error('Error initializing store:', error);
      this.setError('Failed to initialize data');
    } finally {
      this.setLoading(false);
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

  /**
   * Update routines
   */
  setRoutines(routines: Routine[]): void {
    this.setState({ routines });
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
    console.log('User preferences update ignored - settings removed');
  }

  /**
   * Reset to initial state
   */
  resetState(): void {
    this.state$.next(initialState);
  }
}

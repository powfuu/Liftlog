import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonInput, IonButton, IonIcon, IonCard, IonCardContent, IonChip, IonBackButton, IonButtons } from '@ionic/angular/standalone';
import { NotchHeaderComponent } from '../shared/notch-header/notch-header.component';
import { add, remove, swapVertical } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { StoreService } from '../services/store.service';
import { Exercise, ExerciseLog, ExerciseSet } from '../models/exercise.model';
import { UtilService } from '../services/util.service';

@Component({
  selector: 'app-exercise-log',
  templateUrl: './exercise-log.page.html',
  styleUrls: ['./exercise-log.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonBackButton, IonButtons,
    IonList, IonItem, IonLabel, IonInput, IonButton, IonIcon,
    IonCard, IonCardContent, IonChip,
    NotchHeaderComponent
  ],
})
export class ExerciseLogPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  exercises$: Observable<Exercise[]>;
  selectedExercise: Exercise | null = null;
  weightUnit: 'lbs' | 'kg' = 'lbs';
  sets: ExerciseSet[] = [
    { reps: 10, weight: 0, weightUnit: 'lbs', isPersonalRecord: false }
  ];
  notes = '';
  isLoading = false;

  constructor(
    private store: StoreService,
    private utilService: UtilService
  ) {
    addIcons({ add, remove, swapVertical });
    
    this.exercises$ = this.store.select(state => state.exercises);
  }

  ngOnInit() {
    // Load exercises if not already loaded
    this.exercises$.pipe(takeUntil(this.destroy$)).subscribe(exercises => {
      if (exercises.length === 0) {
        // Load default exercises
        this.loadDefaultExercises();
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadDefaultExercises() {
    // This would load from storage in a real app
    const defaultExercises: Exercise[] = [
      {
        id: 'bench_press',
        name: 'Bench Press',
        muscleGroup: 'chest',
        equipment: 'barbell',
        description: 'Flat bench barbell press',
        isCustom: false,
        defaultWeightUnit: 'lbs',
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
        defaultWeightUnit: 'lbs',
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
        defaultWeightUnit: 'lbs',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    this.store.setExercises(defaultExercises);
  }

  onExerciseSelect(exercise: Exercise) {
    this.selectedExercise = exercise;
    // Set weight unit based on exercise's default
    this.weightUnit = exercise.defaultWeightUnit;
    this.updateSetsUnit();
  }

  addSet() {
    const lastSet = this.sets[this.sets.length - 1];
    this.sets.push({
      reps: lastSet.reps,
      weight: lastSet.weight,
      weightUnit: this.weightUnit,
      isPersonalRecord: false
    });
  }

  removeSet(index: number) {
    if (this.sets.length > 1) {
      this.sets.splice(index, 1);
    }
  }

  updateSetWeight(index: number, weight: number) {
    this.sets[index].weight = weight;
  }

  updateSetReps(index: number, reps: number) {
    this.sets[index].reps = reps;
  }

  toggleWeightUnit() {
    const newUnit = this.weightUnit === 'lbs' ? 'kg' : 'lbs';
    
    // Convert all set weights
    this.sets.forEach(set => {
      set.weight = this.utilService.convertWeight(set.weight, this.weightUnit, newUnit);
      set.weightUnit = newUnit;
    });
    
    this.weightUnit = newUnit;
  }

  private updateSetsUnit() {
    this.sets.forEach(set => {
      set.weightUnit = this.weightUnit;
    });
  }

  getTotalVolume(): number {
    return this.sets.reduce((sum, set) => sum + (set.weight * set.reps), 0);
  }

  getTotalReps(): number {
    return this.sets.reduce((sum, set) => sum + set.reps, 0);
  }

  saveLog() {
    if (!this.selectedExercise || this.sets.length === 0) {
      return;
    }

    this.isLoading = true;

    try {
      const totalVolume = this.utilService.calculateTotalVolume(this.sets);
      const maxWeight = this.utilService.findMaxWeight(this.sets);
      
      const log: Omit<ExerciseLog, 'id' | 'createdAt'> = {
        exerciseId: this.selectedExercise.id,
        sets: this.sets,
        notes: this.notes,
        date: new Date(),
        totalVolume,
        maxWeight
      };

      // This would save to storage in a real app
      const completeLog: ExerciseLog = {
        ...log,
        id: this.utilService.generateId()
      };

      this.store.addExerciseLog(completeLog);
      
      // Reset form
      this.resetForm();
      
      // Show success message (would use toast in real app)
      console.log('Exercise logged successfully!');
      
    } catch (error) {
      console.error('Error saving exercise log:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private resetForm() {
    this.selectedExercise = null;
    this.sets = [{ reps: 10, weight: 0, weightUnit: this.weightUnit, isPersonalRecord: false }];
    this.notes = '';
  }

  getMuscleGroupIcon(muscleGroup: string): string {
    const iconMap: { [key: string]: string } = {
      'chest': 'body',
      'back': 'body',
      'shoulders': 'body',
      'arms': 'hand-right',
      'legs': 'walk',
      'core': 'body',
      'full_body': 'body'
    };
    return iconMap[muscleGroup] || 'body';
  }
}

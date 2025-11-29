import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, remove, chevronDown, save, close, list, barbell, informationCircle, trash } from 'ionicons/icons';
import { Routine, RoutineExercise } from '../../models/routine.model';
import { StorageService } from '../../services/storage.service';
import { StoreService } from '../../services/store.service';
import { AlertService } from '../../services/alert.service';

@Component({
  selector: 'app-routine-modal',
  templateUrl: './routine-modal.component.html',
  styleUrls: ['./routine-modal.component.scss'],
  imports: [CommonModule, FormsModule, IonIcon],
})
export class RoutineModalComponent implements OnInit, OnDestroy {
  @Input() routine?: Routine;
  routineName = '';
  routineDescription = '';
  daysOptions: string[] = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  selectedDays: string[] = [];
  exercises: RoutineExercise[] = [];
  expandedIds = new Set<string>();
  activeTab: 'exercises' | 'info' = 'exercises';
  tabTransition: '' | 'left' | 'right' = '';
  animationState: 'entering' | 'entered' | 'exiting' = 'entering';

  constructor(
    private modalController: ModalController,
    private storage: StorageService,
    private store: StoreService,
    private alerts: AlertService
  ) {
    addIcons({ add, remove, chevronDown, save, close, list, barbell, informationCircle, trash });
  }

  ngOnInit() {
    if (this.routine) {
      this.routineName = this.routine.name || '';
      this.routineDescription = this.routine.description || '';
      this.selectedDays = [...(this.routine.days || [])];
      this.exercises = this.routine.exercises.map(e => ({ ...e }));
      this.expandedIds = new Set(this.exercises.map(e => e.exerciseId));
      this.activeTab = 'exercises';
    } else {
      this.activeTab = 'exercises';
    }
    setTimeout(() => { this.animationState = 'entered'; }, 0);
  }

  ngOnDestroy() {}

  setTab(tab: 'exercises' | 'info') {
    if (tab === this.activeTab) return;
    this.tabTransition = tab === 'exercises' ? 'right' : 'left';
    this.activeTab = tab;
    setTimeout(() => { this.tabTransition = ''; }, 260);
  }

  toggleDay(day: string) {
    const idx = this.selectedDays.indexOf(day);
    if (idx >= 0) {
      this.selectedDays = this.selectedDays.filter(d => d !== day);
    } else {
      this.selectedDays = [...this.selectedDays, day];
    }
  }

  openAddForm() {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const order = this.exercises.length;
    const ex: RoutineExercise = {
      exerciseId: id,
      exerciseName: '',
      weight: 0,
      weightUnit: 'lbs',
      targetSets: 3,
      targetReps: 10,
      reserveReps: 0,
      notes: '',
      order
    };
    this.exercises = [ex, ...this.exercises];
    this.expandedIds.add(id);
    this.activeTab = 'exercises';
  }

  removeExercise(i: number) {
    const ex = this.exercises[i];
    if (!ex) return;
    this.exercises = this.exercises.filter((_, idx) => idx !== i);
    this.expandedIds.delete(ex.exerciseId);
  }

  isExpanded(ex: RoutineExercise): boolean { return this.expandedIds.has(ex.exerciseId); }
  toggleExercise(ex: RoutineExercise) {
    if (this.expandedIds.has(ex.exerciseId)) {
      this.expandedIds.delete(ex.exerciseId);
    } else {
      this.expandedIds.add(ex.exerciseId);
    }
  }

  adjustValue(ex: RoutineExercise, field: keyof RoutineExercise, delta: number, min: number, max: number) {
    const next = Math.max(min, Math.min(max, Number((ex as any)[field]) + delta));
    (ex as any)[field] = next;
  }

  async saveRoutine() {
    const now = new Date();
    const id = this.routine?.id || Date.now().toString(36) + Math.random().toString(36).slice(2);
    const payload: Routine = {
      id,
      name: this.routineName?.trim() ? this.routineName : 'New routine',
      description: this.routineDescription?.trim() ? this.routineDescription : '',
      exercises: this.exercises.map((e, idx) => ({ ...e, order: idx })),
      frequency: this.selectedDays.length > 0 ? 'custom' : 'daily',
      days: this.selectedDays,
      isActive: true,
      createdAt: this.routine?.createdAt || now,
      updatedAt: now
    };
    try {
      await this.storage.saveRoutine(payload);
      const latest = await this.storage.getRoutines();
      this.store.setRoutines(latest);
      await this.alerts.success('Routine saved');
      await this.modalController.dismiss(payload);
    } catch (e) {
      await this.alerts.error('Error saving routine');
    }
  }

  async dismiss() { await this.modalController.dismiss(); }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonBackButton, IonButtons, IonButton, IonIcon, IonCard, IonCardContent, IonCardHeader, IonLabel, IonChip, ModalController } from '@ionic/angular/standalone';
import { NotchHeaderComponent } from '../shared/notch-header/notch-header.component';
import { add, barbell, list, trash, create, chevronForward, refresh, calendar } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { RoutineModalComponent } from './routine-modal/routine-modal.component';
import { Routine } from '../models/routine.model';
import { StorageService } from '../services/storage.service';
import { StoreService } from '../services/store.service';
import { AlertService } from '../services/alert.service';

@Component({
  selector: 'app-routines',
  templateUrl: './routines.page.html',
  styleUrls: ['./routines.page.scss'],
  imports: [
    CommonModule,
    IonContent, IonIcon, IonButton, NotchHeaderComponent
  ],
})
export class RoutinesPage implements OnInit {
  routines: Routine[] = [];
  isLoading = true;
  removingId: string | null = null;
  enteringId: string | null = null;
  initialAnimation = false;
  todayDateShort = '';

  constructor(
    private modalController: ModalController,
    private storageService: StorageService,
    private alerts: AlertService,
    private store: StoreService
  ) {
    addIcons({ add, barbell, list, trash, create, chevronForward, refresh, calendar });
  }

  async ngOnInit() {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    this.todayDateShort = `${dd}-${mm}`;
    await this.loadRoutines();
  }

  async loadRoutines() {
    try {
      this.routines = await this.storageService.getRoutines();
      this.store.setRoutines(this.routines);
    } catch (error) {
      console.error('Error loading routines:', error);
    } finally {
      this.isLoading = false;
      this.initialAnimation = true;
      setTimeout(() => { this.initialAnimation = false; }, 1800);
    }
  }

  async createRoutine() {
    try {
      const modal = await this.modalController.create({
        component: RoutineModalComponent,
        cssClass: 'routine-modal-fullscreen'
      });

      modal.onDidDismiss().then(async (result) => {
        if (result.data) {
          await this.nextFrame();
          const exists = this.routines.find(r => r.id === result.data.id);
          if (!exists) {
            this.routines = [result.data, ...this.routines];
          } else {
            this.routines = this.routines.map(r => r.id === result.data.id ? result.data : r);
          }
          this.store.setRoutines(this.routines);
          await this.nextFrame();
          this.enteringId = result.data.id;
        }
      });

      await modal.present();
    } catch (error) {
      console.error('Error opening create routine modal:', error);
    }
  }

  async editRoutine(routine: Routine) {
    try {
      const modal = await this.modalController.create({
        component: RoutineModalComponent,
        cssClass: 'routine-modal-fullscreen',
        componentProps: { routine }
      });

      modal.onDidDismiss().then(async (result) => {
        if (result.data) {
          await this.nextFrame();
          this.routines = this.routines.map(r => r.id === result.data.id ? result.data : r);
          this.store.setRoutines(this.routines);
          await this.nextFrame();
          this.enteringId = result.data.id;
        }
      });

      await modal.present();
    } catch (error) {
      console.error('Error opening edit routine modal:', error);
    }
  }

  private nextFrame(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }

  // removed delay utility; animations coordinated via animationend

  async saveRoutine(routine: Routine) {
    try {
      await this.storageService.saveRoutine(routine);
      await this.alerts.success(`${routine.name} has been created.`);
      await this.loadRoutines();
    } catch (error) {
      console.error('Error saving routine:', error);
    }
  }

  async deleteRoutine(routine: Routine) {
    try {
      this.removingId = routine.id;
      await this.storageService.deleteRoutine(routine.id);
      await this.alerts.success(`${routine.name} has been deleted correctly`);
      const latest = await this.storageService.getRoutines();
      this.store.setRoutines(latest);
    } catch (error) {
      console.error('Error deleting routine:', error);
    } finally {
      // handled on animationend
    }
  }

  onCardAnimationEnd(routine: Routine) {
    if (this.removingId === routine.id) {
      this.routines = this.routines.filter(r => r.id !== routine.id);
      this.removingId = null;
      return;
    }
    if (this.enteringId === routine.id) {
      this.enteringId = null;
    }
  }

  async onDeleteRoutine(routine: Routine, ev?: Event) {
    if (ev) {
      ev.stopPropagation();
      ev.preventDefault();
    }
    const confirmed = await this.alerts.confirm({
      header: 'Delete Routine',
      message: `Are you sure you want to delete "${routine.name}"? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });
    if (confirmed) {
      await this.deleteRoutine(routine);
    }
  }

  getMuscleGroupColor(muscleGroup: string): string {
    const colors: { [key: string]: string } = {
      'chest': 'bg-red-500/20 text-red-400',
      'back': 'bg-blue-500/20 text-blue-400',
      'legs': 'bg-green-500/20 text-green-400',
      'shoulders': 'bg-yellow-500/20 text-yellow-400',
      'arms': 'bg-purple-500/20 text-purple-400',
      'core': 'bg-orange-500/20 text-orange-400'
    };
    return colors[muscleGroup] || 'bg-gray-500/20 text-gray-400';
  }

  getTotalExercises(routine: Routine): number {
    return routine.exercises.length;
  }

  getRoutineVolume(routine: Routine): number {
    return routine.exercises.reduce((total, exercise) => {
      return total + (exercise.weight * exercise.targetSets * exercise.targetReps);
    }, 0);
  }

  getTotalExerciseCount(): number {
    return this.routines.reduce((sum, routine) => sum + this.getTotalExercises(routine), 0);
  }

  getDaysShort(days: string[] = []): string {
    const map: { [key: string]: string } = {
      'Monday': 'Mon',
      'Tuesday': 'Tue',
      'Wednesday': 'Wed',
      'Thursday': 'Thu',
      'Friday': 'Fri',
      'Saturday': 'Sat',
      'Sunday': 'Sun'
    };
    return days.map(d => map[d] || d).join(', ');
  }

  getScheduleLabel(routine: Routine): string {
    const days = routine.days || [];
    if (days.length > 0) {
      return `${days.length} days/week`;
    }
    switch (routine.frequency) {
      case 'daily':
        return '7 days/week';
      case 'weekly':
        return '1 day/week';
      default:
        return 'Custom';
    }
  }
}

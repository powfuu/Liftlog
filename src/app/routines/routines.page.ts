import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonBackButton, IonButtons, IonButton, IonIcon, IonCard, IonCardContent, IonCardHeader, IonLabel, IonChip, ModalController } from '@ionic/angular/standalone';
import { NotchHeaderComponent } from '../shared/notch-header/notch-header.component';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { add, barbell, list, trash, create, chevronForward, refresh, calendar } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
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
    IonContent, IonIcon, IonButton, NotchHeaderComponent, DragDropModule
  ],
})
export class RoutinesPage implements OnInit {
  routines: Routine[] = [];
  filteredRoutines: Routine[] = [];
  isLoading = true;
  removingId: string | null = null;
  enteringId: string | null = null;
  initialAnimation = false;
  todayDateShort = '';
  currentProgram: string | null = null;
  hoverIndex: number | null = null;
  draggingId: string | null = null;

  constructor(
    private modalController: ModalController,
    private storageService: StorageService,
    private alerts: AlertService,
    private store: StoreService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    addIcons({ add, barbell, list, trash, create, chevronForward, refresh, calendar });
  }

  async ngOnInit() {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    this.todayDateShort = `${dd}-${mm}`;
    await this.loadRoutines();
    this.route.queryParamMap.subscribe(params => {
      const program = params.get('program');
      this.currentProgram = program;
      this.applyProgramFilter(program);
    });
  }

  async loadRoutines() {
    try {
      this.routines = await this.storageService.getRoutines();
      this.store.setRoutines(this.routines);
      const program = this.route.snapshot.queryParamMap.get('program');
      this.currentProgram = program;
      this.applyProgramFilter(program);
    } catch (error) {
      console.error('Error loading routines:', error);
    } finally {
      this.isLoading = false;
      this.initialAnimation = true;
      setTimeout(() => { this.initialAnimation = false; }, 1800);
    }
  }

  private applyProgramFilter(program: string | null) {
    const norm = (program || '').trim().toLowerCase();
    if (norm) {
      this.filteredRoutines = this.routines.filter(r => ((r.programName || 'General').trim().toLowerCase()) === norm);
    } else {
      this.filteredRoutines = this.routines;
    }
  }

  goToPrograms() { this.router.navigate(['/tabs/programs']); }

  async createRoutine() {
    try {
      const program = this.route.snapshot.queryParamMap.get('program') || 'General';
      const modal = await this.modalController.create({
        component: RoutineModalComponent,
        cssClass: 'routine-modal-fullscreen',
        componentProps: { programName: program }
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
          this.applyProgramFilter(this.route.snapshot.queryParamMap.get('program'));
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
          this.applyProgramFilter(this.route.snapshot.queryParamMap.get('program'));
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
      this.routines = latest;
      this.applyProgramFilter(this.route.snapshot.queryParamMap.get('program'));
    } catch (error) {
      console.error('Error deleting routine:', error);
    } finally {
      // handled on animationend
    }
  }

  onCardAnimationEnd(routine: Routine) {
    if (this.removingId === routine.id) {
      this.routines = this.routines.filter(r => r.id !== routine.id);
      this.filteredRoutines = this.filteredRoutines.filter(r => r.id !== routine.id);
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
    const list = this.currentProgram ? this.filteredRoutines : this.routines;
    return list.reduce((sum, routine) => sum + this.getTotalExercises(routine), 0);
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

  trackByRoutineId(index: number, r: Routine): string { return r.id; }

  dropRoutines(event: CdkDragDrop<Routine[]>) {
    const from = event.previousIndex;
    const to = (this.hoverIndex ?? event.currentIndex);
    if (from === to) { this.hoverIndex = null; return; }
    const list = this.currentProgram ? this.filteredRoutines : this.routines;
    const before = this.captureRects('routine-');
    moveItemInArray(list, from, to);
    if (this.currentProgram) {
      const norm = (this.currentProgram || '').trim().toLowerCase();
      const positions: number[] = [];
      for (let i = 0; i < this.routines.length; i++) {
        const pm = (this.routines[i].programName || 'General').trim().toLowerCase();
        if (pm === norm) positions.push(i);
      }
      for (let idx = 0; idx < positions.length; idx++) {
        this.routines[positions[idx]] = this.filteredRoutines[idx];
      }
    }
    this.store.setRoutines(this.routines);
    this.storageService.saveRoutinesOrder(this.routines).catch(() => {});
    this.hoverIndex = null;
    this.runFlip('routine-', before);
  }

  onRutDragEntered(index: number) { if (this.hoverIndex !== index) this.hoverIndex = index; }
  onRutDragExited(index: number) { if (this.hoverIndex === index) this.hoverIndex = null; }
  onRutDragStarted(id: string) { this.draggingId = id; }
  onRutDragEnded() { this.draggingId = null; this.hoverIndex = null; }

  private captureRects(prefix: string): Map<string, DOMRect> {
    const map = new Map<string, DOMRect>();
    const nodes = Array.from(document.querySelectorAll(`[id^="${prefix}"]`));
    for (const n of nodes) {
      const el = n as HTMLElement;
      map.set(el.id, el.getBoundingClientRect());
    }
    return map;
  }

  private async runFlip(prefix: string, before: Map<string, DOMRect>) {
    await this.nextFrame();
    const after = this.captureRects(prefix);
    after.forEach((rect, id) => {
      const prev = before.get(id);
      if (!prev) return;
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (dx === 0 && dy === 0) return;
      const el = document.getElementById(id) as HTMLElement | null;
      if (!el) return;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.willChange = 'transform';
      el.style.transition = 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)';
      requestAnimationFrame(() => {
        el.style.transform = '';
      });
      setTimeout(() => {
        el.style.willChange = '';
        el.style.transition = '';
      }, 480);
    });
  }
}

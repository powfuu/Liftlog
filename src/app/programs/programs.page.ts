import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, IonButton, IonModal, ModalController } from '@ionic/angular/standalone';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { ProgramModalComponent } from './program-modal/program-modal.component';
import { NotchHeaderComponent } from '../shared/notch-header/notch-header.component';
import { Router, ActivatedRoute } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { Routine } from '../models/routine.model';
import { addIcons } from 'ionicons';
import { list, add, chevronForward, trash, close, save, albums, calendar } from 'ionicons/icons';
import { barbell } from 'ionicons/icons';
import { AlertService } from '../services/alert.service';
import { StoreService } from '../services/store.service';

@Component({
  selector: 'app-programs',
  templateUrl: './programs.page.html',
  styleUrls: ['./programs.page.scss'],
  imports: [CommonModule, FormsModule, IonContent, IonIcon, IonButton, IonModal, NotchHeaderComponent, DragDropModule],
})
export class ProgramsPage implements OnInit {
  isLoading = true;
  programs: { name: string; description?: string; routineCount: number; exerciseCount: number; daysPerWeek: number }[] = [];
  view: 'programs' | 'routines' = 'programs';
  selectedProgram: string | null = null;
  routines: Routine[] = [];
  filteredRoutines: Routine[] = [];
  initialAnimation = false;
  lastAddedProgram: string | null = null;
  deletingPrograms = new Set<string>();
  hoverIndex: number | null = null;
  draggingId: string | null = null;

  constructor(private storage: StorageService, public router: Router, private route: ActivatedRoute, private alerts: AlertService, private modalController: ModalController, private store: StoreService) {
    addIcons({ list, add, chevronForward, trash, close, save, albums, barbell, calendar });
  }

  async ngOnInit() {
    await this.loadPrograms();
    this.route.queryParamMap.subscribe(async params => {
      const v = (params.get('view') as 'programs'|'routines') || 'programs';
      const p = params.get('program');
      this.view = v;
      this.selectedProgram = p;
      if (v === 'routines') {
        await this.loadRoutinesForProgram(p);
        this.initialAnimation = true;
        setTimeout(() => { this.initialAnimation = false; }, 1200);
      }
    });
  }

  async ionViewWillEnter() {
    this.isLoading = true;
    await this.loadPrograms();
  }

  async loadPrograms() {
    try {
      const savedPrograms = await this.storage.getPrograms();
      const routines: Routine[] = await this.storage.getRoutines();
      const routineCounts = new Map<string, number>();
      const exerciseCounts = new Map<string, number>();
      const daysSets = new Map<string, Set<string>>();
      for (const r of routines) {
        const n = r.programName;
        if (!n) continue;
        routineCounts.set(n, (routineCounts.get(n) || 0) + 1);
        exerciseCounts.set(n, (exerciseCounts.get(n) || 0) + ((r.exercises && r.exercises.length) || 0));
        if (r.days && r.days.length) {
          const set = daysSets.get(n) || new Set<string>();
          for (const d of r.days) set.add(d);
          daysSets.set(n, set);
        }
      }
      if (savedPrograms.length > 0) {
        this.programs = savedPrograms.map(p => ({
          name: p.name,
          description: p.description,
          routineCount: routineCounts.get(p.name) || 0,
          exerciseCount: exerciseCounts.get(p.name) || 0,
          daysPerWeek: (daysSets.get(p.name)?.size) || 0,
        }));
      } else {
        this.programs = [];
      }
    } finally {
      this.isLoading = false;
      this.initialAnimation = true;
      setTimeout(() => { this.initialAnimation = false; }, 1200);
    }
  }

  openProgram(name: string) {
    this.router.navigate(['/tabs/programs/routines'], { queryParams: { program: name } });
  }

  async openCreateProgram() {
    try {
      const modal = await this.modalController.create({
        component: ProgramModalComponent,
        cssClass: 'program-modal-floating'
      });
      modal.onDidDismiss().then(async (result) => {
        if (result.data && result.data.name) {
          await this.storage.saveProgram({ name: result.data.name, description: result.data.description });
          await this.alerts.success('Program has been saved');
          this.lastAddedProgram = result.data.name;
          await this.loadPrograms();
          const latestRoutines = await this.storage.getRoutines();
          this.store.setRoutines(latestRoutines);
          setTimeout(() => { this.lastAddedProgram = null; }, 1000);
        }
      });
      await modal.present();
    } catch (error) {
      console.error('Error opening create program modal:', error);
    }
  }

  async onDeleteProgram(name: string, ev?: Event) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    const confirmed = await this.alerts.confirm({ header: 'Delete Program', message: `Delete "${name}" and unassign its routines?`, confirmText: 'Delete', cancelText: 'Cancel' });
    if (!confirmed) return;
    await this.storage.deleteProgram(name);
    await this.alerts.success(`${name} has been deleted`);
    const latestRoutinesAfterDelete = await this.storage.getRoutines();
    this.store.setRoutines(latestRoutinesAfterDelete);
    this.deletingPrograms.add(name);
    if (this.view === 'routines' && this.selectedProgram === name) {
      this.selectedProgram = null;
      this.view = 'programs';
      this.router.navigate(['/tabs/programs']);
    }
    setTimeout(async () => {
      this.programs = this.programs.filter(p => p.name !== name);
      this.deletingPrograms.delete(name);
      await this.loadPrograms();
    }, 280);
  }

  private async loadRoutinesForProgram(program: string | null) {
    this.isLoading = true;
    try {
      this.routines = await this.storage.getRoutines();
      if (program) {
        this.filteredRoutines = this.routines.filter(r => r.programName === program);
      } else {
        this.filteredRoutines = this.routines;
      }
    } finally {
      this.isLoading = false;
    }
  }

  trackByRoutineId(index: number, r: Routine): string { return r.id; }

  dropPrograms(event: CdkDragDrop<{ name: string; description?: string; routineCount: number; exerciseCount: number; daysPerWeek: number }[]>) {
    const from = event.previousIndex;
    const to = (this.hoverIndex ?? event.currentIndex);
    if (from === to) { this.hoverIndex = null; return; }
    const tmp = this.programs[to];
    this.programs[to] = this.programs[from];
    this.programs[from] = tmp;
    this.hoverIndex = null;
    // Persist order to storage (names and descriptions only)
    const plain = this.programs.map(p => ({ name: p.name, description: p.description }));
    this.storage.saveProgramsList(plain).catch(() => {});
  }

  dropProgramRoutines(event: CdkDragDrop<Routine[]>) {
    const from = event.previousIndex;
    const to = (this.hoverIndex ?? event.currentIndex);
    if (from === to) { this.hoverIndex = null; return; }
    const list = this.filteredRoutines;
    const tmp = list[to];
    list[to] = list[from];
    list[from] = tmp;
    // Reflect back to full routines list
    const norm = (this.selectedProgram || '').trim().toLowerCase();
    const others = this.routines.filter(r => ((r.programName || 'General').trim().toLowerCase()) !== norm);
    this.filteredRoutines = list;
    this.routines = [...others, ...this.filteredRoutines];
    this.hoverIndex = null;
    // Persist routines order
    this.storage.saveRoutinesOrder(this.routines).catch(() => {});
    this.store.setRoutines(this.routines);
  }

  onProgDragEntered(index: number) { if (this.hoverIndex !== index) this.hoverIndex = index; }
  onProgDragExited(index: number) { if (this.hoverIndex === index) this.hoverIndex = null; }
  onProgDragStarted(id: string) { this.draggingId = id; }
  onProgDragEnded() { this.draggingId = null; this.hoverIndex = null; }

  onRutDragEntered(index: number) { if (this.hoverIndex !== index) this.hoverIndex = index; }
  onRutDragExited(index: number) { if (this.hoverIndex === index) this.hoverIndex = null; }
  onRutDragStarted(id: string) { this.draggingId = id; }
  onRutDragEnded() { this.draggingId = null; this.hoverIndex = null; }



  goToRoutinesView() {
    const qp = this.selectedProgram ? { program: this.selectedProgram } : {};
    this.router.navigate(['/tabs/programs/routines'], { queryParams: qp });
  }
}

import { Component, OnInit, OnDestroy, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { add, remove, chevronDown, chevronUp, save, close, list, barbell, informationCircle, trash, swapVertical } from 'ionicons/icons';
import { Routine, RoutineExercise } from '../../models/routine.model';
import { StorageService } from '../../services/storage.service';
import { StoreService } from '../../services/store.service';
import { AlertService } from '../../services/alert.service';

@Component({
  selector: 'app-routine-modal',
  templateUrl: './routine-modal.component.html',
  styleUrls: ['./routine-modal.component.scss'],
  imports: [CommonModule, FormsModule, IonIcon, DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoutineModalComponent implements OnInit, OnDestroy {
  @Input() routine?: Routine;
  @Input() programName?: string;
  routineName = '';
  routineDescription = '';
  daysOptions: string[] = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  selectedDays: string[] = [];
  exercises: RoutineExercise[] = [];
  expandedIds = new Set<string>();
  activeTab: 'exercises' | 'info' = 'exercises';
  tabTransition: '' | 'left' | 'right' = '';
  animationState: 'entering' | 'entered' | 'exiting' = 'entering';
  hoverIndex: number | null = null;
  draggingId: string | null = null;
  private focusedInputs = new Set<string>();

  constructor(
    private modalController: ModalController,
    private storage: StorageService,
    private store: StoreService,
    private alerts: AlertService
  ) {
    addIcons({ add, remove, chevronDown, chevronUp, save, close, list, barbell, informationCircle, trash, swapVertical });
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
    const hadExercises = this.exercises.length > 0;
    const ex: RoutineExercise = {
      exerciseId: id,
      exerciseName: '',
      weight: 0,
      weightUnit: 'kg',
      targetSets: 3,
      targetReps: 10,
      reserveReps: 0,
      notes: '',
      order
    };
    (ex as any).sets = [];
    this.exercises.push(ex);
    this.expandedIds.add(id);
    this.activeTab = 'exercises';
    if (hadExercises) {
      setTimeout(() => {
        const el = document.getElementById('exercise-' + id) as HTMLElement | null;
        const container = document.querySelector('.accordion-list') as HTMLElement | null;
        if (el && container) {
          const top = el.offsetTop - 8;
          container.scrollTo({ top, behavior: 'smooth' });
        }
      }, 0);
    }
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

  onHeaderClick(ex: RoutineExercise) {
    if (this.draggingId) { return; }
    this.toggleExercise(ex);
  }

  trackByExerciseId(index: number, ex: RoutineExercise): string { return ex.exerciseId; }
  trackBySetIndex(index: number, _s: any): number { return index; }

  private key(ex: RoutineExercise, index: number, field: 'reps' | 'weight' | 'rir'): string {
    return `${ex.exerciseId}:${index}:${field}`;
  }
  private isInputFocused(ex: RoutineExercise, index: number, field: 'reps' | 'weight' | 'rir'): boolean {
    return this.focusedInputs.has(this.key(ex, index, field));
  }
  onInputFocus(ex: RoutineExercise, index: number, field: 'reps' | 'weight' | 'rir') {
    this.focusedInputs.add(this.key(ex, index, field));
  }
  onInputBlur(ex: RoutineExercise, index: number, field: 'reps' | 'weight' | 'rir') {
    this.focusedInputs.delete(this.key(ex, index, field));
  }
  getDisplayValue(ex: RoutineExercise, index: number, field: 'reps' | 'weight' | 'rir'): any {
    const list = this.getSets(ex);
    if (index < 0 || index >= list.length) return 0;
    const v = (list[index] as any)[field];
    if (this.isInputFocused(ex, index, field) && Number(v) === 0) return '';
    return v;
  }

  dropCdk(event: CdkDragDrop<RoutineExercise[]>) {
    const from = event.previousIndex;
    const to = this.hoverIndex ?? event.currentIndex;
    if (from === to) { this.hoverIndex = null; return; }
    const before = this.captureRects('exercise-');
    moveItemInArray(this.exercises, from, to);
    for (let i = 0; i < this.exercises.length; i++) { this.exercises[i].order = i; }
    this.hoverIndex = null;
    this.runFlip('exercise-', before);
  }

  onDragEntered(index: number) { if (this.hoverIndex !== index) this.hoverIndex = index; }
  onDragExited(index: number) { if (this.hoverIndex === index) this.hoverIndex = null; }
  onDragStarted(id: string) { this.draggingId = id; }
  onDragEnded() { this.draggingId = null; this.hoverIndex = null; }

  private nextFrame(): Promise<void> { return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); }
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

  adjustValue(ex: RoutineExercise, field: keyof RoutineExercise, delta: number, min: number, max: number) {
    const next = Math.max(min, Math.min(max, Number((ex as any)[field]) + delta));
    (ex as any)[field] = next;
  }

  getSets(ex: RoutineExercise): Array<{ reps: number; weight: number; rir: number; unit?: 'kg' | 'lb' }> {
    const arr = (ex as any).sets as Array<{ reps: number; weight: number; rir: number; unit?: 'kg' | 'lb' }>;
    return Array.isArray(arr) ? arr : [];
  }

  addSet(ex: RoutineExercise) {
    const list = this.getSets(ex);
    const next = { reps: ex.targetReps || 10, weight: ex.weight || 0, rir: ex.reserveReps || 0, unit: ex.weightUnit || 'kg' } as any;
    const cur = Array.isArray((ex as any).sets) ? (ex as any).sets : [];
    (ex as any).sets = [...cur, next];
    ex.targetSets = this.getSets(ex).length;
  }

  removeSet(ex: RoutineExercise, index: number) {
    const list = this.getSets(ex);
    if (index < 0 || index >= list.length) return;
    const cur = [...list];
    cur.splice(index, 1);
    (ex as any).sets = cur;
    ex.targetSets = this.getSets(ex).length;
  }

  updateSetValue(ex: RoutineExercise, index: number, field: 'reps' | 'weight' | 'rir', value: any) {
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
    const item = { ...cur[index] };
    (item as any)[field] = v;
    cur[index] = item as any;
    (ex as any).sets = cur;
    ex.targetSets = this.getSets(ex).length;
  }

  setUnitForSet(ex: RoutineExercise, index: number, unit: 'kg' | 'lb') {
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
  }

  isUnitDropdownOpen(ex: RoutineExercise, index: number): boolean {
    const list = this.getSets(ex);
    const item = list[index] as any;
    return !!(item && item.unitOpen);
  }

  toggleUnitDropdown(ex: RoutineExercise, index: number) {
    const list = this.getSets(ex);
    if (index < 0 || index >= list.length) return;
    const cur = [...list];
    const item = { ...(cur[index] as any) };
    item.unitOpen = !item.unitOpen;
    cur[index] = item;
    (ex as any).sets = cur;
  }

  closeUnitDropdown(ex: RoutineExercise, index: number) {
    const list = this.getSets(ex);
    if (index < 0 || index >= list.length) return;
    const cur = [...list];
    const item = { ...(cur[index] as any) };
    item.unitOpen = false;
    cur[index] = item;
    (ex as any).sets = cur;
  }

  isUnitJustSelected(ex: RoutineExercise, index: number): boolean {
    const list = this.getSets(ex);
    const item = list[index] as any;
    return !!(item && item.unitPulse);
  }

  setUnitForExercise(ex: RoutineExercise, unit: 'kg' | 'lb') {
    const prev = ex.weightUnit || 'kg';
    if (prev === unit) return;
    const factor = unit === 'lb' ? 2.20462 : 1 / 2.20462;
    const sets = this.getSets(ex).map(s => ({
      ...s,
      weight: Number((s.weight * factor).toFixed(1)),
    }));
    (ex as any).sets = sets;
    ex.weight = Number(((ex.weight || 0) * factor).toFixed(1));
    ex.weightUnit = unit;
  }

  async saveRoutine() {
    const name = this.routineName?.trim();
    if (!name) { await this.alerts.error('Please set a routine name'); return; }
    if (this.selectedDays.length === 0) { await this.alerts.error('Please select at least one training day'); return; }
    const invalidExercise = this.exercises.find(e => !(e.exerciseName || '').trim());
    if (invalidExercise) { await this.alerts.error('Por favor asigna un nombre a todos los ejercicios'); return; }

    const now = new Date();
    const id = this.routine?.id || Date.now().toString(36) + Math.random().toString(36).slice(2);
    const payload: Routine = {
      id,
      name,
      description: this.routineDescription?.trim() ? this.routineDescription : '',
      exercises: this.exercises.map((e, idx) => ({ ...e, order: idx })),
      frequency: 'custom',
      days: this.selectedDays,
      isActive: true,
      createdAt: this.routine?.createdAt || now,
      updatedAt: now,
      programName: this.routine?.programName || this.programName || 'General'
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

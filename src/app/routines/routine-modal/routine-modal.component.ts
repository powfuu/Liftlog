import { Component, OnInit, Input, ChangeDetectionStrategy, NgZone, inject, ChangeDetectorRef, ElementRef, AfterViewInit } from '@angular/core';
import { Clipboard } from '@capacitor/clipboard';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon, ModalController, ToastController, GestureController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { add, remove, chevronDown, chevronUp, save, close, list, barbell, informationCircle, trash, swapVertical, trophy, copyOutline } from 'ionicons/icons';
import { Routine, RoutineExercise } from '../../models/routine.model';
import { StorageService } from '../../services/storage.service';
import { StoreService } from '../../services/store.service';
import { AlertService } from '../../services/alert.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { TranslationService } from '../../services/translation.service';
import { LoaderService } from '../../services/loader.service';

@Component({
  selector: 'app-routine-modal',
  templateUrl: './routine-modal.component.html',
  styleUrls: ['./routine-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, DragDropModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoutineModalComponent implements OnInit, AfterViewInit {
  @Input() routine?: Routine;
  @Input() programName?: string;
  @Input() externalSave: boolean = false;
  routineName = '';
  routineDescription = '';
  daysOptions: string[] = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  daysList = [
    { value: 'Monday', label: 'common.mon' },
    { value: 'Tuesday', label: 'common.tue' },
    { value: 'Wednesday', label: 'common.wed' },
    { value: 'Thursday', label: 'common.thu' },
    { value: 'Friday', label: 'common.fri' },
    { value: 'Saturday', label: 'common.sat' },
    { value: 'Sunday', label: 'common.sun' }
  ];
  selectedDays: string[] = [];
  exercises: RoutineExercise[] = [];
  expandedIds = new Set<string>();
  activeTab: 'exercises' | 'info' | 'import' = 'exercises';
  tabTransition: '' | 'left' | 'right' = '';
  animationState: 'entering' | 'entered' | 'exiting' = 'entering';
  hoverIndex: number | null = null;
  draggingId: string | null = null;
  private focusedInputs = new Set<string>();

  private modalController = inject(ModalController);
  private storage = inject(StorageService);
  private store = inject(StoreService);
  private alerts = inject(AlertService);
  private zone = inject(NgZone);
  private loader = inject(LoaderService);
  private cdr = inject(ChangeDetectorRef);
  private toastCtrl = inject(ToastController);
  private gestureCtrl = inject(GestureController);
  private el = inject(ElementRef);
  private translationService = inject(TranslationService);
  private iconsInit = addIcons({ add, remove, chevronDown, chevronUp, save, close, list, barbell, informationCircle, trash, swapVertical, trophy, copyOutline });
  isSaving = false;
  private animatedIds = new Set<string>();
  private destroy$ = new Subject<void>();
  routineCode: string | null = null;
  importCode = '';

  ngOnInit() {
    if (this.routine) {
      this.routineName = this.routine.name || '';
      this.routineDescription = this.routine.description || '';
      this.selectedDays = [...(this.routine.days || [])];
      this.exercises = this.routine.exercises.map(e => ({ ...e }));
      this.expandedIds = new Set(this.exercises.map(e => e.exerciseId));
      this.activeTab = 'exercises';
      if (this.routine.code) {
        this.routineCode = this.routine.code;
      } else {
        this.storage.getRoutineCode(this.routine.id).then(code => { this.routineCode = code; this.cdr.markForCheck(); }).catch(() => {});
      }
    } else {
      this.activeTab = 'exercises';
      this.routineCode = String(Math.floor(1000000 + Math.random() * 9000000));
    }
    setTimeout(() => { this.animationState = 'entered'; }, 0);
    // Prevent re-animating exercise items on subsequent updates
    this.exercises.forEach(e => this.animatedIds.add(e.exerciseId));
    (this as any)._onGlobalPointerDown = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      if (target && target.closest('.unit-dd')) return;
      this.zone.run(() => {
        this.closeAllUnitDropdowns();
        this.cdr.markForCheck();
      });
    };
    document.addEventListener('pointerdown', (this as any)._onGlobalPointerDown, true);
    this.store.select(s => s.routines)
      .pipe(takeUntil(this.destroy$))
      .subscribe((routines) => {
        const rid = this.routine?.id;
        if (!rid) return;
        const found = (routines || []).find(r => r.id === rid);
        if (found) {
          this.exercises = (found.exercises || []).map(e => ({ ...e }));
          if (found.code && found.code !== this.routineCode) {
            this.routineCode = found.code;
          }
          this.cdr.markForCheck();
        }
      });
  }

  ngAfterViewInit() {
    const gesture = this.gestureCtrl.create({
      el: this.el.nativeElement,
      gestureName: 'swipe-to-close',
      direction: 'y',
      passive: false,
      threshold: 5,
      onMove: (ev) => {
        if (ev.startY > 120) return;
        if (ev.deltaY > 0) {
          this.el.nativeElement.style.transform = `translateY(${ev.deltaY}px)`;
        }
      },
      onEnd: (ev) => {
        if (ev.startY > 120) return;
        if (ev.deltaY > 150) {
          this.dismiss();
        } else {
          this.el.nativeElement.style.transform = '';
          this.el.nativeElement.style.transition = 'transform 0.3s ease-out';
          setTimeout(() => {
            this.el.nativeElement.style.transition = '';
          }, 300);
        }
      }
    });
    gesture.enable();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if ((this as any)._onGlobalPointerDown) document.removeEventListener('pointerdown', (this as any)._onGlobalPointerDown, true);
  }

  private closeAllUnitDropdowns() {
    const exs = this.exercises || [];
    for (const ex of exs) {
      const list = this.getSets(ex);
      const cur = list.map((item: any) => ({ ...(item || {}), unitOpen: false }));
      (ex as any).sets = cur;
      if ((ex as any).goalUnitOpen) (ex as any).goalUnitOpen = false;
    }
  }

  hasAnimated(id: string): boolean { return this.animatedIds.has(id); }
  onExerciseAnimationEnd(id: string) { this.animatedIds.add(id); }


  setTab(tab: 'exercises' | 'info') {
    if (tab === this.activeTab) return;
    this.tabTransition = tab === 'exercises' ? 'right' : 'left';
    this.activeTab = tab;
    setTimeout(() => { this.tabTransition = ''; }, 260);
  }
  setTabImport() { if (this.activeTab === 'import') return; this.tabTransition = 'left'; this.activeTab = 'import'; setTimeout(() => { this.tabTransition = ''; }, 260); }
  async importByCode() {
    const c = String(this.importCode || '').trim();
    if (!c) { await this.alerts.error('Please enter a routine ID'); return; }
    try {
      if (this.externalSave) {
        this.isSaving = false;
        await this.modalController.dismiss({ importCode: c, programName: this.programName || null });
        return;
      }
      this.isSaving = true;
      const importedName = await this.storage.importRoutineByCode(c, this.programName);
      if (!importedName) {
        this.isSaving = false;
        const lang = this.translationService.getCurrentLang?.() || 'es';
        const msg = lang === 'es' ? 'Código de rutina inválido' : 'Invalid routine code';
        await this.toastCtrl.create({ message: msg, duration: 1600, color: 'danger', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
        return;
      }
      const latest = await this.storage.getRoutines();
      this.store.setRoutines(latest);
      const lang = this.translationService.getCurrentLang?.() || 'es';
      const ok = lang === 'es' ? `Rutina ${importedName} importada` : `Routine ${importedName} imported`;
      await this.toastCtrl.create({ message: ok, duration: 1200, color: 'success', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
      this.isSaving = false;
      this.modalController.dismiss().catch(() => {});
    } catch {
      this.isSaving = false;
      await this.alerts.error('Failed to import routine');
    }
  }

  onImportInput(el: HTMLInputElement) {
    try {
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    } catch {}

    const val = el.value;
    const clean = val.replace(/[^0-9]/g, '').slice(0, 7);
    if (val !== clean) {
      el.value = clean;
      this.importCode = clean;
    } else {
      this.importCode = val;
    }
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
    const base = list.length > 0 ? (list[0] as any) : { weight: ex.weight || 0, unit: ex.weightUnit || 'kg' };
    const next = { reps: ex.targetReps || 10, weight: Number(base.weight) || 0, rir: ex.reserveReps || 0, unit: (base.unit as any) || (ex.weightUnit || 'kg') } as any;
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
    if (field === 'weight' && index === 0) {
      const baseUnit: 'kg'|'lb' = (((cur[0] as any)?.unit as any) || ex.weightUnit || 'kg') as any;
      const convert = (w: number, from: 'kg'|'lb', to: 'kg'|'lb') => {
        if (from === to) return Number(w || 0);
        return (from === 'kg' && to === 'lb') ? Number((Number(w || 0) * 2.20462).toFixed(1)) : Number((Number(w || 0) / 2.20462).toFixed(1));
      };
      for (let i = 0; i < cur.length; i++) {
        const it = { ...(cur[i] as any) };
        const targetUnit: 'kg'|'lb' = ((it.unit as any) || ex.weightUnit || 'kg') as any;
        it.weight = convert(v, baseUnit, targetUnit);
        cur[i] = it as any;
      }
    } else {
      const item = { ...cur[index] };
      (item as any)[field] = v;
      cur[index] = item as any;
    }
    (ex as any).sets = cur;
    ex.targetSets = this.getSets(ex).length;
  }

  getRepsSummary(ex: RoutineExercise): any {
    const sets = this.getSets(ex);
    if (!Array.isArray(sets) || sets.length === 0) return ex.targetReps || 0;
    const reps = sets.map(s => Number((s as any).reps) || 0);
    const unique = Array.from(new Set(reps));
    if (unique.length === 1) return unique[0];
    const min = Math.min(...reps);
    const max = Math.max(...reps);
    if (min === max) return min;
    return `${min}-${max}`;
  }

  setUnitForSet(ex: RoutineExercise, index: number, unit: 'kg' | 'lb') {
    const list = this.getSets(ex);
    if (index < 0 || index >= list.length) return;
    const cur = [...list];
    const item = { ...(cur[index] as any) };
    const prev: 'kg' | 'lb' = (item.unit as any) || ex.weightUnit || 'kg';
    if (prev === unit) return;
    const convert = (w: number, from: 'kg'|'lb', to: 'kg'|'lb') => {
      if (from === to) return Number(w || 0);
      return (from === 'kg' && to === 'lb') ? Number((Number(w || 0) * 2.20462).toFixed(1)) : Number((Number(w || 0) / 2.20462).toFixed(1));
    };
    if (index === 0) {
      for (let i = 0; i < cur.length; i++) {
        const it = { ...(cur[i] as any) };
        const from: 'kg'|'lb' = (it.unit as any) || ex.weightUnit || 'kg';
        it.weight = convert(Number(it.weight || 0), from, unit);
        it.unit = unit;
        cur[i] = it as any;
      }
      (ex as any).sets = cur;
    } else {
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
    if (typeof (ex as any).goalWeight === 'number') {
      (ex as any).goalWeight = Number((((ex as any).goalWeight || 0) * factor).toFixed(1));
      (ex as any).goalUnit = unit;
    }
  }

  hasGoal(ex: RoutineExercise): boolean { return typeof (ex as any).goalWeight === 'number'; }
  createGoal(ex: RoutineExercise) {
    (ex as any).goalWeight = Number((ex.weight || 0).toFixed(1));
    (ex as any).goalUnit = ex.weightUnit || 'kg';
  }
  setGoalWeight(ex: RoutineExercise, value: any) {
    let v = Number(value);
    if (Number.isNaN(v)) v = 0;
    v = Math.max(0, Math.min(1000, Number(v.toFixed(2))));
    (ex as any).goalWeight = v;
  }
  getGoalWeight(ex: RoutineExercise): number { return Number(((ex as any).goalWeight || 0)); }
  getGoalUnit(ex: RoutineExercise): string { return ((ex as any).goalUnit || ex.weightUnit || 'kg').toUpperCase(); }
  removeGoal(ex: RoutineExercise) { delete (ex as any).goalWeight; delete (ex as any).goalUnit; }

  onGoalFocus(ex: RoutineExercise) { this.focusedInputs.add('goal:'+ex.exerciseId); }
  onGoalBlur(ex: RoutineExercise) { this.focusedInputs.delete('goal:'+ex.exerciseId); }
  private isGoalFocused(ex: RoutineExercise): boolean { return this.focusedInputs.has('goal:'+ex.exerciseId); }
  getGoalDisplayValue(ex: RoutineExercise): any {
    const v = this.getGoalWeight(ex);
    if (this.isGoalFocused(ex)) return '';
    return v;
  }

  isGoalUnitDropdownOpen(ex: RoutineExercise): boolean { return !!((ex as any).goalUnitOpen); }
  toggleGoalUnitDropdown(ex: RoutineExercise) { (ex as any).goalUnitOpen = !((ex as any).goalUnitOpen); }
  private closeGoalUnitDropdown(ex: RoutineExercise) { (ex as any).goalUnitOpen = false; }
  isGoalUnitJustSelected(ex: RoutineExercise): boolean { return !!((ex as any).goalUnitPulse); }
  isGoalUnitSelected(ex: RoutineExercise, unit: 'kg'|'lb'): boolean {
    const u: 'kg'|'lb' = (((ex as any).goalUnit as any) || ex.weightUnit || 'kg') as any;
    return u === unit;
  }
  setGoalUnit(ex: RoutineExercise, unit: 'kg'|'lb') {
    const prev: 'kg'|'lb' = ((ex as any).goalUnit as any) || ex.weightUnit || 'kg';
    if (prev === unit) { this.closeGoalUnitDropdown(ex); return; }
    const factor = unit === 'lb' ? 2.20462 : 1 / 2.20462;
    const w = Number(((ex as any).goalWeight || 0));
    (ex as any).goalWeight = Number((w * factor).toFixed(1));
    (ex as any).goalUnit = unit;
    (ex as any).goalUnitPulse = true;
    this.closeGoalUnitDropdown(ex);
    setTimeout(() => { (ex as any).goalUnitPulse = false; }, 260);
  }

  async saveRoutine() {
    const name = this.routineName?.trim();
    if (!name) {
      this.setTab('info');
      await this.alerts.error(this.translationService.translate('routines.name_required'));
      return;
    }
    if (this.selectedDays.length === 0) { await this.alerts.error(this.translationService.translate('routines.days_required')); return; }
    if (this.exercises.length === 0) { await this.alerts.error(this.translationService.translate('routines.exercises_required')); return; }
    const invalidExercise = this.exercises.find(e => !(e.exerciseName || '').trim());
    if (invalidExercise) { await this.alerts.error(this.translationService.translate('routines.exercise_names_required')); return; }

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
      programName: this.routine?.programName || this.programName || 'General',
      code: this.routineCode || undefined
    };
    if (this.externalSave) {
      try {
        this.isSaving = false;
        await this.modalController.dismiss(payload);
      } catch {}
      return;
    }
    try {
      this.isSaving = true;
      await this.storage.saveRoutine(payload, this.routineCode || undefined);
      this.isSaving = false;
      this.modalController.dismiss(payload).catch(() => {});
    } catch (e) {
      this.isSaving = false;
      this.alerts.error('Error saving routine').catch(() => {});
    }
  }

  async dismiss() { await this.modalController.dismiss(); }
  async copyRoutineCode() {
    const t = (this.routineCode ?? '').toString();
    if (!t) return;

    let success = false;
    try {
      await Clipboard.write({ string: t });
      success = true;
    } catch {
      try {
        await navigator.clipboard.writeText(t);
        success = true;
      } catch {
        try {
          const textArea = document.createElement("textarea");
          textArea.value = t;
          textArea.style.position = "fixed";
          textArea.style.left = "-9999px";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          success = document.execCommand('copy');
          document.body.removeChild(textArea);
        } catch {}
      }
    }

    if (success) {
      const lang = this.translationService.getCurrentLang?.() || 'es';
      const msg = lang === 'es' ? `Rutina ${t} copiada` : `Routine ${t} copied`;
      await this.toastCtrl.create({ message: msg, duration: 1200, color: 'medium', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(tt => tt.present());
    }
  }
}

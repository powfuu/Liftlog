import { Component, OnInit, NgZone, inject, ChangeDetectorRef, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { auditTime, distinctUntilChanged } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, IonModal, IonDatetime, IonPopover, IonToast, GestureController, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { addIcons } from 'ionicons';
import { flame, calendar, barbell, informationCircle, close, refresh, chevronDown, chevronUp, checkmark, add, remove, funnel, apps, globe, chevronBack, chevronForward, trash, swapVertical, alertCircle, trophy } from 'ionicons/icons';
import { Router } from '@angular/router';
import { StoreService } from '../services/store.service';
import { AlertService } from '../services/alert.service';
import { StorageService } from '../services/storage.service';
import { Routine, RoutineExercise } from '../models/routine.model';
import { NotchHeaderComponent } from '../shared/notch-header/notch-header.component';
import { TranslatePipe } from '../pipes/translate.pipe';
import { TranslationService } from '../services/translation.service';
import { LoaderService } from '../services/loader.service';
import { UtilService } from '../services/util.service';
import { SupabaseService } from '../services/supabase.service';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonIcon, IonModal, IonDatetime, IonPopover, IonToast, NotchHeaderComponent, TranslatePipe, DragDropModule, IonRefresher, IonRefresherContent]
})
export class HomePage implements OnInit, AfterViewInit, OnDestroy {
  private router = inject(Router);
  private store = inject(StoreService);
  private storageService = inject(StorageService);
  private translationService = inject(TranslationService);
  public utilService = inject(UtilService);
  private ngZone = inject(NgZone);
  private alerts = inject(AlertService);
  private loader = inject(LoaderService);
  private supabase = inject(SupabaseService);
  private notifications = inject(NotificationService);
  private gestureCtrl = inject(GestureController);
  private el = inject(ElementRef);
  private iconsInit = addIcons({ flame, alertCircle, calendar, barbell, informationCircle, close, refresh, chevronDown, chevronUp, checkmark, add, remove, funnel, apps, globe, chevronBack, chevronForward, trash, swapVertical, trophy });
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('datePopover', { read: IonPopover }) datePopover?: IonPopover;
  showTraining = false;
  trainingInitiated = false;
  showProgramFilter = false;
  selectedProgramFilters: Set<string> = new Set();
  panelState: 'entering'|'exiting'|'idle' = 'idle';
  routinesToday: Routine[] = [];
  private scheduledRoutinesToday: Routine[] = [];
  allRoutines: Routine[] = [];
  quickDayActive = false;
  showQuickDay = false;
  quickSelectionMode: 'routines'|'exercises' = 'routines';
  quickSelectedRoutineIds = new Set<string>();
  quickSelectedExerciseIds = new Set<string>();
  quickSelectedProgramFilter: string = 'all';
  quickSelectedRoutineFilter: string = 'all';
  quickFiltersMode: 'none'|'programs'|'routines' = 'none';
  quickDaySelectedIds = new Set<string>();
  todayExercises: RoutineExercise[] = [];
  todayLabel = '';
  totalExercisesToday = 0;
  todayDateStr = '';
  todayDateShort = '';
  showPreview = false;
  previewRoutine: any | null = null;
  previewDaysLabel = '';
  previewExercisesView: any[] = [];
  private previewExpandedIds = new Set<string>();
  isLoading = false;
  showQuickToast = false;
  quickToastMessage = '';
  quickToastColor: 'success'|'warning'|'primary'|'medium'|'dark' = 'success';
  private showQuickDayToast(msg: string, color: 'success'|'warning'|'primary'|'medium'|'dark' = 'success') {
    this.quickToastMessage = msg;
    this.quickToastColor = color;
    this.showQuickToast = true;
    setTimeout(() => { this.showQuickToast = false; }, 1800);
  }
  selectedLanguage: 'en' | 'es' | 'de' | 'ko' = 'es';
  showDatePicker = false;
  datePopoverEvent: any = null;
  calendarMonthLabel = '';
  calendarYear = this.utilService.getToday().getFullYear();
  private calendarBase = this.utilService.getToday();
  weekdayLabels: string[] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  calendarDays: Date[] = [];
  shouldAnimateDays = false;
  selectedDateUS = '';
  isSelectedToday = true;
  isSelectedFuture = false;
  expandedIds = new Set<string>();
  selectedRoutineIds = new Set<string>();
  private activeRoutineIds = new Set<string>();
  private exerciseRoutineNameMap = new Map<string, string>();
  private focusedInputs = new Set<string>();
  private timerInterval: any;
  private trainingStartTime: number | null = null;
  elapsedTimeStr = '00:00';
  private completedRoutineIds = new Set<string>();
  private completedExerciseIds = new Set<string>();
  private justResetRoutineIds = new Set<string>();
  private resettingRoutineIds = new Set<string>();
  routinesStaggerActive = true;
  private routinesStaggerTimer: any = null;
  dayCompleted = false;
  durationSeconds = 0;
  private finishConfirmAccepted = false;
  showFinishConfirm = false;
  finishTimeStr = '';
  private trainedDates = new Set<string>();

  quickRoutinesView: Routine[] = [];
  quickExercisesView: RoutineExercise[] = [];

  async handleRefresh(event: any) {
    try {
      await this.loadWorkoutSessionForDate();
      await this.updateTodayData(this.allRoutines);
      await this.checkActiveTraining();
      this.cdr.detectChanges();
    } catch (e) {
      console.error(e);
    } finally {
      event.target.complete();
    }
  }

  ngOnInit(): void {
    const alreadyHydrated = this.store.getState().hydrated;
    this.isLoading = true;
    if (!alreadyHydrated) {
      this.loader.show();
    }
    this.translationService.lang$.subscribe(lang => {
      this.selectedLanguage = lang;
      this.updateDateLabels();
      if (this.previewRoutine) {
        this.previewDaysLabel = this.getRoutineDaysLabel(this.previewRoutine);
      }
    });

    const today = this.utilService.getToday();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = today.getFullYear();
    this.todayDateStr = `${mm}/${dd}/${yyyy}`;
    this.todayDateShort = `${dd}-${mm}`;
    this.selectedDateUS = `${mm}/${dd}/${yyyy}`;
    this.calendarDays = this.generateMonthDays(today);

    this.store.select(s => s.exerciseLogs).pipe(auditTime(300)).subscribe(logs => {
      const dates = new Set<string>();
      if (Array.isArray(logs)) {
        logs.forEach(l => {
          try {
            const d = new Date(l.date);
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const y = d.getFullYear();
            dates.add(`${m}/${day}/${y}`);
          } catch {}
        });
      }
      this.trainedDates = dates;
      this.cdr.markForCheck();
    });

    this.updateDateLabels();

    this.store.select(s => s.routines).pipe(auditTime(60)).subscribe(routines => {
      this.allRoutines = Array.isArray(routines) ? routines : [];
      this.updateTodayData(routines);
      this.restoreQuickDayState();
      this.computeQuickViews();
      if (this.store.getState().hydrated) {
        this.isLoading = false;
      }
    });
    this.store.select(s => s.hydrated).pipe(auditTime(60), distinctUntilChanged()).subscribe(h => {
      if (!h) { this.isLoading = true; }
      if (h) {
        this.loader.hide();
        if (!this.routinesStaggerTimer) {
          this.routinesStaggerTimer = setTimeout(() => {
            this.routinesStaggerActive = false;
            this.routinesStaggerTimer = null;
            try { this.cdr.detectChanges(); } catch {}
          }, 700);
        }
      }
    });

    // Check for active training session
    this.checkActiveTraining();

    (this as any)._onGlobalPointerDown = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      if (target && target.closest('.unit-dd')) return;
      this.ngZone.run(() => {
        this.closeAllUnitDropdowns();
      });
    };
    document.addEventListener('pointerdown', (this as any)._onGlobalPointerDown, true);
  }
  private gesture: any;

  ngAfterViewInit() {
    this.gesture = this.gestureCtrl.create({
      el: this.el.nativeElement,
      gestureName: 'swipe-right-home',
      threshold: 15,
      direction: 'x',
      onEnd: (ev) => {
        // Swipe Right -> Navigate to Coaching
        if (ev.deltaX > 100 && Math.abs(ev.deltaY) < 50) {
          this.ngZone.run(() => {
            this.router.navigate(['/tabs/coaching']);
          });
        }
      }
    });
    this.gesture.enable();
  }

  ionViewWillEnter() {
    if (!this.showTraining && this.routinesToday.length === 0) {
      this.isLoading = true;
    }
  }

  async onIonViewDidEnter() {
    try {
      const routines = this.store.getState().routines || [];
      this.allRoutines = Array.isArray(routines) ? routines : [];
      this.restoreQuickDayState();

      await this.updateTodayData(this.allRoutines);
      this.computeQuickViews();
      this.checkActiveTraining();

      this.isLoading = false;
      this.cdr.detectChanges();
    } catch {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy(): void {
    if (this.gesture) {
      this.gesture.destroy();
      this.gesture = null;
    }
    if ((this as any)._onGlobalPointerDown) document.removeEventListener('pointerdown', (this as any)._onGlobalPointerDown, true);
    if (this.timerInterval) { try { clearInterval(this.timerInterval); } catch {} this.timerInterval = null; }
    this.showTraining = false;
    this.panelState = 'idle';
    this.showQuickDay = false;
    this.finishConfirmAccepted = false;
  }

  private closeAllUnitDropdowns() {
    const exercises = (this.visibleTodayExercises && this.visibleTodayExercises.length) ? this.visibleTodayExercises : (this.todayExercises || []);
    for (const ex of exercises) {
      const list = this.getSets(ex);
      const cur = list.map((item: any) => ({ ...(item || {}), unitOpen: false }));
      (ex as any).sets = cur;
      if ((ex as any).goalUnitOpen) (ex as any).goalUnitOpen = false;
    }
  }

  private async checkActiveTraining() {
    const state = await this.storageService.getTrainingState();
    if (state && state.inProgress && state.startedAt) {
      this.trainingStartTime = new Date(state.startedAt).getTime();
      if (Array.isArray((state as any).routineIds)) {
        this.activeRoutineIds = new Set<string>(((state as any).routineIds as string[]));
      }

      if (Array.isArray(state.exercises) && state.exercises.length > 0) {
        this.todayExercises = state.exercises;

        // Restore maps from saved exercises
        const map = new Map<string, string>();
        const pmap = new Map<string, string>();
        const idMap = new Map<string, string>();

        // We can recover IDs from __routineId if present. Names/Programs depend on store or saved state (which doesn't save names).
        // But we can try to find them in current store state if available.
        const currentRoutines = this.store.getState().routines || [];

        for (const ex of this.todayExercises) {
          const eid = ex.exerciseId;
          const rid = (ex as any).__routineId;
          if (rid) {
            idMap.set(eid, rid);
            const r = currentRoutines.find(cr => cr.id === rid);
            if (r) {
              map.set(eid, r.name);
              if (r.programName) pmap.set(eid, r.programName);
            }
          }
        }
        this.exerciseRoutineIdMap = idMap;
        this.exerciseRoutineNameMap = map;
        this.exerciseProgramNameMap = pmap;

        this.updateVisibleTodayExercises();
      }

      this.showTraining = true;
      this.startTimer(false);
      this.expandedIds = new Set<string>((this.todayExercises || []).map(ex => ex.exerciseId).filter((id: string) => !!id));
      // Note: We cannot easily restore the exact selection state without saving it.
      // For now, we restore the timer view but the user might need to re-select exercises if they were lost.
      // A better approach would be to save 'selectedRoutineIds' in the training state.
    }
  }

  updateDateLabels() {
    const today = this.utilService.getToday();
    const locale = this.selectedLanguage === 'es' ? 'es-ES' : (this.selectedLanguage === 'de' ? 'de-DE' : (this.selectedLanguage === 'ko' ? 'ko-KR' : 'en-US'));
    const selectedParts = this.selectedDateUS.split('/').map(s => parseInt(s, 10));
    const selectedDate = new Date(selectedParts[2], selectedParts[0] - 1, selectedParts[1]);
    this.todayLabel = selectedDate.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
    this.calendarMonthLabel = this.calendarBase.toLocaleString(locale, { month: 'long' });
    this.calendarYear = this.calendarBase.getFullYear();
    // Update weekday labels based on language if needed, or keep simple 3-letter codes
    if (this.selectedLanguage === 'es') {
      this.weekdayLabels = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    } else if (this.selectedLanguage === 'de') {
      this.weekdayLabels = ['Mo','Di','Mi','Do','Fr','Sa','So'];
    } else if (this.selectedLanguage === 'ko') {
      this.weekdayLabels = ['월','화','수','목','금','토','일'];
    } else {
      this.weekdayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    }
  }

  // ... (rest of the file)


  private generateMonthDays(base: Date): Date[] {
    const year = base.getFullYear();
    const month = base.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const dayOfWeek = firstDayOfMonth.getDay();

    // Adjust for Monday start (0=Mon, ..., 6=Sun)
    const adjustedStartDay = (dayOfWeek + 6) % 7;

    const gridStartDate = new Date(year, month, 1);
    gridStartDate.setDate(gridStartDate.getDate() - adjustedStartDay);

    const arr: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStartDate);
      d.setDate(gridStartDate.getDate() + i);
      arr.push(d);
    }
    return arr;
  }

  private prevSelectedDateUS: string | null = null;
  openDatePicker(ev: any) {
    this.prevSelectedDateUS = this.selectedDateUS;
    if (ev) {
      this.datePopover?.present({ target: ev.currentTarget || ev.target } as any);
    } else {
      this.datePopover?.present();
    }
  }

  // Swipe gesture properties for calendar
  closeDatePicker() { this.showDatePicker = false; this.prevSelectedDateUS = null; }
  cancelDatePicker() {
    try { (this as any).datePopover?.dismiss?.(); } catch {}
    if (this.prevSelectedDateUS) {
      this.selectedDateUS = this.prevSelectedDateUS;
      const [mm, dd, yyyy] = this.selectedDateUS.split('/').map(s => parseInt(s, 10));
      const d = new Date(yyyy, mm - 1, dd);
      this.isSelectedToday = this.isToday(d);
      this.isSelectedFuture = d.getTime() > this.utilService.getToday().getTime();
      this.todayDateStr = this.selectedDateUS;
      this.todayDateShort = `${String(dd).padStart(2,'0')}-${String(mm).padStart(2,'0')}`;
      this.updateDateLabels();
      this.completedRoutineIds.clear();
      this.completedExerciseIds.clear();
      this.updateTodayData(this.allRoutines);
      this.restoreQuickDayState();
      this.computeQuickViews();
    }
    this.closeDatePicker();
  }

  toggleLanguage() {
    const newLang = this.selectedLanguage === 'en' ? 'es' : 'en';
    this.store.setLanguage(newLang);
  }
  prevMonth() {
    const y = this.calendarBase.getFullYear();
    const m = this.calendarBase.getMonth();
    this.calendarBase = new Date(y, m - 1, 1);
    this.calendarDays = this.generateMonthDays(this.calendarBase);
    this.updateDateLabels();
    this.shouldAnimateDays = true;
    setTimeout(() => { this.shouldAnimateDays = false; }, 400);
  }
  nextMonth() {
    const y = this.calendarBase.getFullYear();
    const m = this.calendarBase.getMonth();
    this.calendarBase = new Date(y, m + 1, 1);
    this.calendarDays = this.generateMonthDays(this.calendarBase);
    this.updateDateLabels();
    this.shouldAnimateDays = true;
    setTimeout(() => { this.shouldAnimateDays = false; }, 400);
  }
  confirmSelectedDate() { try { (this as any).datePopover?.dismiss?.(); } catch {}; this.closeDatePicker(); }

  isCurrentMonth(d: Date): boolean {
    return d.getMonth() === this.calendarBase.getMonth() && d.getFullYear() === this.calendarBase.getFullYear();
  }
  isToday(d: Date): boolean { const t = this.utilService.getToday(); return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear(); }
  isSelected(d: Date): boolean {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return this.selectedDateUS === `${mm}/${dd}/${yyyy}`;
  }
  isTrainedDay(d: Date): boolean {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    const key = `${mm}/${dd}/${yyyy}`;
    return this.trainedDates.has(key);
  }
  isPastDay(d: Date): boolean {
    const t = this.utilService.getToday();
    const td = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return dd.getTime() < td.getTime();
  }
  isRestDay(d: Date): boolean {
    if (this.isPastDay(d)) return false;
    const list = this.store.getState().routines || [];
    const dayName = d.toLocaleString('en-US', { weekday: 'long' });
    const hasPlan = (list || []).some((r: any) => (r?.frequency === 'daily' && (!r.days || r.days.length === 0)) || (Array.isArray(r?.days) && r.days.includes(dayName)));
    return !hasPlan;
  }

  isExerciseCompleted(id: string): boolean { return !!id && this.completedExerciseIds.has(id); }
  async completeExercise(exercise: RoutineExercise) {
    const id = exercise?.exerciseId || '';
    if (!id) return;
    this.completedExerciseIds.add(id);
    exercise.completed = true;
    this.persistExercise(exercise);
    
    if (this.showTraining) {
      const allIds = (this.todayExercises || []).map(ex => ex.exerciseId).filter((eid: string) => !!eid);
      const allDone = allIds.length > 0 && allIds.every(eid => this.completedExerciseIds.has(eid));
      const rid = ((exercise as any).__routineId as string) || this.exerciseRoutineIdMap.get(id) || (() => { const ex = (this.todayExercises || []).find(e => e.exerciseId === id); return (ex ? ((ex as any).__routineId as string) : ''); })();
      if (rid) {
        const routineExIds = (this.todayExercises || []).filter(ex => {
          const reid = ((ex as any).__routineId as string) || this.exerciseRoutineIdMap.get(ex.exerciseId) || '';
          return reid === rid;
        }).map(ex => ex.exerciseId).filter((eid: string) => !!eid);
        const routineDone = routineExIds.length > 0 && routineExIds.every(eid => this.completedExerciseIds.has(eid));
        if (routineDone) {
          this.completedRoutineIds.add(rid);
        }
      }
      if (allDone) { this.finishTimeStr = this.formatTimer(); this.showFinishConfirm = true; }
    }
  }
  confirmFinishTraining() { this.finishConfirmAccepted = true; this.showFinishConfirm = false; this.finishTraining(); }
  cancelFinishTraining() { this.finishConfirmAccepted = false; this.showFinishConfirm = false; }
  openFinishConfirm() { this.finishTimeStr = this.formatTimer(); this.showFinishConfirm = true; }
  repeatExercise(exercise: RoutineExercise) {
    const id = exercise?.exerciseId || '';
    if (!id) return;
    this.completedExerciseIds.delete(id);
    exercise.completed = false;
    this.persistExercise(exercise);
    
    if (this.showTraining) {
      const rid = ((exercise as any).__routineId as string) || this.exerciseRoutineIdMap.get(id) || (() => { const ex = (this.todayExercises || []).find(e => e.exerciseId === id); return (ex ? ((ex as any).__routineId as string) : ''); })();
      if (rid) {
        const routineExIds = (this.todayExercises || []).filter(ex => {
          const reid = ((ex as any).__routineId as string) || this.exerciseRoutineIdMap.get(ex.exerciseId) || '';
          return reid === rid;
        }).map(ex => ex.exerciseId).filter((eid: string) => !!eid);
        const routineDone = routineExIds.length > 0 && routineExIds.every(eid => this.completedExerciseIds.has(eid));
        if (!routineDone && this.completedRoutineIds.has(rid)) {
          this.completedRoutineIds.delete(rid);
        }
      }
    }
  }
  selectDate(d: Date) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    this.selectedDateUS = `${mm}/${dd}/${yyyy}`;
    this.todayDateStr = this.selectedDateUS;
    this.todayDateShort = `${dd}-${mm}`;
    const today = this.utilService.getToday();
    this.isSelectedToday = (d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear());
    this.isSelectedFuture = d.getTime() > today.getTime();
    this.updateDateLabels();
    // Reload completed routines for the selected date
    this.completedRoutineIds.clear();
    if (!this.isSelectedFuture) {
      const savedCompleted = localStorage.getItem(`completed_routines_${this.selectedDateUS}`);
      if (savedCompleted) {
        try {
          const ids = JSON.parse(savedCompleted);
          if (Array.isArray(ids)) ids.forEach((id: string) => this.completedRoutineIds.add(id));
        } catch {}
      }
    }
    this.showProgramFilter = false;
    this.selectedProgramFilters = new Set();
    const routines = this.store.getState().routines || [];
    this.updateTodayData(routines);
    this.restoreQuickDayState();
    this.computeQuickViews();
  }
  getDayNumber(d: Date): number { return d.getDate(); }

  getScheduledLabel(): string { return this.translationService.translate('common.scheduled'); }
  setProgramFilter(val: string) {
    if (val === 'all') {
      this.selectedProgramFilters = new Set();
      this.showProgramFilter = false;
    } else {
      if (this.selectedProgramFilters.has(val)) {
        this.selectedProgramFilters.delete(val);
      } else {
        this.selectedProgramFilters.add(val);
      }
      this.selectedProgramFilters = new Set(this.selectedProgramFilters);
    }
  }
  getProgramsToday(): string[] {
    const set = new Set<string>();
    for (const r of this.routinesToday) { if (r.programName) set.add(r.programName); }
    return Array.from(set);
  }
  getProgramFilterLabel(): string {
    if (this.selectedProgramFilters.size === 0) return this.translationService.translate('common.all_programs');
    const names = Array.from(this.selectedProgramFilters);
    if (names.length === 1) return names[0];
    return `${names[0]} +${names.length - 1}`;
  }
  filteredRoutinesToday(): Routine[] {
    if (this.selectedProgramFilters.size === 0) return this.routinesToday;
    return this.routinesToday.filter(r => r.programName && this.selectedProgramFilters.has(r.programName));
  }
  isRoutineCompleted(id: string): boolean { if (id === 'logged-day') return this.dayCompleted === true; return this.completedRoutineIds.has(id); }
  isJustCompleted(_id: string): boolean { return false; }
  isJustReset(id: string): boolean { return this.justResetRoutineIds.has(id); }
  isResettingRoutine(id: string): boolean { return this.resettingRoutineIds.has(id); }

  private markRoutineJustReset(id: string) {
    if (!id) return;
    try {
      const el = document.getElementById(`routine-card-${id}`);
      if (el && typeof (el as any).scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest', behavior: 'auto' } as any);
      }
    } catch {}
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.justResetRoutineIds.add(id);
        try { this.cdr.detectChanges(); } catch {}
      });
    });
    setTimeout(() => {
      this.justResetRoutineIds.delete(id);
      try { this.cdr.detectChanges(); } catch {}
    }, 420);
  }

  previewExercises: RoutineExercise[] = [];
  previewFirst3: RoutineExercise[] = [];
  previewExercisesCount = 0;
  openPreview(routine: any, ev?: Event) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    this.previewRoutine = routine;
    this.previewDaysLabel = this.getRoutineDaysLabel(routine);
    this.previewExpandedIds.clear();
    try { document.body.classList.add('modal-open'); } catch {}
    const list = this.computePreviewExercises();
    this.previewExercises = list;
    this.updatePreviewView();
    this.showPreview = true;
    this.updatePreviewRoutineDuration(routine?.id);
  }

  private updatePreviewView() {
    if (!this.previewExercises) return;
    this.previewExercisesView = this.previewExercises.map(ex => {
      const sets = this.getSets(ex).map((s, i) => ({
        reps: Number((s as any).reps) || 0,
        weight: Number((s as any).weight) || 0,
        rir: Number((s as any).rir) || 0,
        unit: ((s as any).unit || ex.weightUnit || 'lb') as any,
        isExtra: i >= (Number(ex.targetSets) || 0)
      }));
      return {
        ...ex,
        previewSets: sets,
        repsSummary: this.getRepsSummary(ex),
        previewGoal: this.getPreviewGoal(ex)
      };
    });
    this.previewFirst3 = this.previewExercisesView.slice(0, 3);
    this.previewExercisesCount = this.previewExercisesView.length;
  }

  previewRoutineDurationSec: number = 0;
  private async updatePreviewRoutineDuration(routineId?: string) {
    try { const id = (routineId || this.previewRoutine?.id || ''); this.previewRoutineDurationSec = id ? await this.storageService.getRoutineDurationForDate(this.selectedDateUS, id) : 0; this.cdr.markForCheck(); } catch { this.previewRoutineDurationSec = 0; }
  }
  closePreview() {
    this.ngZone.run(() => {
      this.showPreview = false;
      this.previewExpandedIds.clear();
      this.previewRoutine = null;
      this.previewExercises = [];
      this.previewExercisesView = [];
      this.previewFirst3 = [];
      this.previewExercisesCount = 0;
      this.previewRoutineDurationSec = 0;
      this.previewDaysLabel = '';
      try { document.body.classList.remove('modal-open'); } catch {}
      try { this.cdr.detectChanges(); } catch {}
    });
  }
  navigateToRoutines() { this.router.navigate(['/tabs/programs']); }

  openQuickDay() {
    this.showQuickDay = true;
    // Do not reset selections here; preserve previous choices across openings
    // Keep current filters and mode; user can adjust within the modal
    this.quickFiltersMode = 'none';
    this.computeQuickViews();
  }
  closeQuickDay() { this.showQuickDay = false; }
  toggleQuickDaySelection(id: string) {
    if (!id) return;
    if (this.quickDaySelectedIds.has(id)) this.quickDaySelectedIds.delete(id); else this.quickDaySelectedIds.add(id);
  }
  isQuickDaySelected(id: string): boolean { return this.quickDaySelectedIds.has(id); }
  applyQuickDay() {
    if (this.quickSelectionMode === 'routines') {
      const selected = this.allRoutines.filter(r => this.quickSelectedRoutineIds.has(r.id));
      this.quickDayActive = selected.length > 0;
      if (!this.quickDayActive) { this.closeQuickDay(); return; }
      this.routinesToday = selected;
      this.totalExercisesToday = this.routinesToday.reduce((acc, r) => acc + ((r.exercises && r.exercises.length) || 0), 0);
      this.todayExercises = this.routinesToday.reduce((acc: RoutineExercise[], r: Routine) => acc.concat((r.exercises || []).map(ex => ({ ...ex, __routineId: r.id } as any))), [] as RoutineExercise[]);
      const map = new Map<string, string>();
      const pmap = new Map<string, string>();
      const idMap = new Map<string, string>();
      for (const r of this.routinesToday) { for (const ex of (r.exercises || [])) { if (ex.exerciseId) { map.set(ex.exerciseId, r.name); idMap.set(ex.exerciseId, r.id); if (r.programName) pmap.set(ex.exerciseId, r.programName); } } }
      this.exerciseRoutineNameMap = map;
      this.exerciseProgramNameMap = pmap;
      this.exerciseRoutineIdMap = idMap;
    } else {
      const allEx = this.getFilteredQuickExercises();
      const selectedEx = allEx.filter(ex => this.quickSelectedExerciseIds.has(ex.exerciseId));
      this.quickDayActive = selectedEx.length > 0;
      if (!this.quickDayActive) { this.closeQuickDay(); return; }
      const idMap = new Map<string, string>();
      for (const r of this.allRoutines) { for (const ex of (r.exercises || [])) { if (this.quickSelectedExerciseIds.has(ex.exerciseId)) { idMap.set(ex.exerciseId, r.id); } } }
      const withRoutine = selectedEx.map(ex => ({ ...ex, __routineId: idMap.get(ex.exerciseId) || '' } as any));
      const virtual: Routine = { id: 'quick-day', name: this.translationService.translate('quick.day_title'), description: this.translationService.translate('quick.day_desc'), exercises: withRoutine, frequency: 'custom', days: [], isActive: true, createdAt: new Date(), updatedAt: new Date(), programName: this.translationService.translate('quick.custom_program') } as any;
      this.routinesToday = [virtual];
      this.totalExercisesToday = selectedEx.length;
      this.todayExercises = withRoutine as any;
      const map = new Map<string, string>();
      const pmap = new Map<string, string>();
      for (const r of this.allRoutines) { for (const ex of (r.exercises || [])) { if (this.quickSelectedExerciseIds.has(ex.exerciseId)) { map.set(ex.exerciseId, r.name); idMap.set(ex.exerciseId, r.id); if (r.programName) pmap.set(ex.exerciseId, r.programName); } } }
      this.exerciseRoutineNameMap = map;
      this.exerciseProgramNameMap = pmap;
      this.exerciseRoutineIdMap = idMap;
    }
    this.saveQuickDayState();
    this.showQuickDay = false;
    this.updateVisibleTodayExercises();
    this.showQuickDayToast(this.translationService.translate('quick.custom_day_applied'), 'success');
    this.saveTrainingProgress();
  }
  resetQuickDay() {
    this.quickDayActive = false;
    this.quickSelectedRoutineIds.clear();
    this.quickSelectedExerciseIds.clear();

    // Re-calculate scheduled routines to ensure accuracy
    const targetDate = (() => {
      const parts = this.selectedDateUS.split('/');
      if (parts.length === 3) {
        const mm = Number(parts[0]) - 1;
        const dd = Number(parts[1]);
        const yyyy = Number(parts[2]);
        return new Date(yyyy, mm, dd);
      }
      return this.utilService.getToday();
    })();
    const dayName = targetDate.toLocaleString('en-US', { weekday: 'long' });
    const programs = (this.store.getState().programs || []) as any[];
    const active = new Set<string>((programs || []).filter(p => (p.isActive !== false)).map(p => p.name));
    const base = Array.isArray(this.allRoutines) ? this.allRoutines : [];
    const list = base.filter(r => !r.programName || active.has(r.programName));
    this.scheduledRoutinesToday = list.filter(r => (r?.frequency === 'daily' && (!r.days || r.days.length === 0)) || (Array.isArray(r?.days) && r.days.includes(dayName)));

    this.routinesToday = this.scheduledRoutinesToday;
    this.totalExercisesToday = this.routinesToday.reduce((acc, r) => acc + ((r.exercises && r.exercises.length) || 0), 0);
    this.todayExercises = this.routinesToday.reduce((acc: RoutineExercise[], r: Routine) => acc.concat((r.exercises || []).map(ex => ({ ...ex, __routineId: r.id } as any))), [] as RoutineExercise[]);
    const map = new Map<string, string>();
    const pmap = new Map<string, string>();
    const idMap = new Map<string, string>();
    for (const r of this.routinesToday) {
      for (const ex of (r.exercises || [])) {
        if (ex.exerciseId) {
          map.set(ex.exerciseId, r.name);
          idMap.set(ex.exerciseId, r.id);
          if (r.programName) pmap.set(ex.exerciseId, r.programName);
        }
      }
    }
    this.exerciseRoutineNameMap = map;
    this.exerciseProgramNameMap = pmap;
    this.exerciseRoutineIdMap = idMap;
    this.updateVisibleTodayExercises();
    this.showQuickDayToast(this.translationService.translate('quick.custom_day_reset'), 'success');
    localStorage.removeItem(`quick_day_state_${this.selectedDateUS}`);
    this.saveTrainingProgress();
    this.cdr.detectChanges();
  }

  toggleQuickDayRoutine(id: string) {
    if (!id) return;
    const next = new Set(this.quickSelectedRoutineIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    this.quickSelectedRoutineIds = next;
  }
  isQuickRoutineSelected(id: string): boolean { return this.quickSelectedRoutineIds.has(id); }
  toggleQuickDayExercise(id: string) {
    if (!id) return;
    const next = new Set(this.quickSelectedExerciseIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    this.quickSelectedExerciseIds = next;
  }
  isQuickExerciseSelected(id: string): boolean { return this.quickSelectedExerciseIds.has(id); }
  setQuickSelectionMode(mode: 'routines'|'exercises') {
    this.quickSelectionMode = mode;
    if (mode === 'routines') {
      this.quickSelectedExerciseIds.clear();
    } else {
      this.quickSelectedRoutineIds.clear();
    }
    this.computeQuickViews();
  }
  setQuickProgramFilter(val: string) { this.quickSelectedProgramFilter = val; this.quickFiltersMode = 'none'; this.computeQuickViews(); }
  setQuickRoutineFilter(val: string) { this.quickSelectedRoutineFilter = val; this.quickFiltersMode = 'none'; this.computeQuickViews(); }
  toggleQuickFilters(mode: 'programs'|'routines') { this.quickFiltersMode = (this.quickFiltersMode === mode ? 'none' : mode); }
  getQuickPrograms(): string[] { const set = new Set<string>(); for (const r of this.allRoutines) { if (r.programName) set.add(r.programName); } return Array.from(set); }
  getQuickRoutines(): string[] { const set = new Set<string>(); const list = this.allRoutines.filter(r => this.quickSelectedProgramFilter==='all' ? true : (r.programName === this.quickSelectedProgramFilter)); for (const r of list) { if (r.name) set.add(r.name); } return Array.from(set); }
  getFilteredQuickRoutines(): Routine[] { let list = Array.isArray(this.allRoutines) ? [...this.allRoutines] : []; if (this.quickSelectedProgramFilter !== 'all') list = list.filter(r => (r.programName || '') === this.quickSelectedProgramFilter); if (this.quickSelectedRoutineFilter !== 'all') list = list.filter(r => r.name === this.quickSelectedRoutineFilter); return list; }
  getFilteredQuickExercises(): RoutineExercise[] { const routines = this.getFilteredQuickRoutines(); const out: RoutineExercise[] = []; for (const r of routines) { for (const ex of (r.exercises || [])) out.push(ex as RoutineExercise); } return out; }

  private computeQuickViews() {
    let list = Array.isArray(this.allRoutines) ? [...this.allRoutines] : [];
    if (this.quickSelectedProgramFilter !== 'all') list = list.filter(r => (r.programName || '') === this.quickSelectedProgramFilter);
    if (this.quickSelectedRoutineFilter !== 'all') list = list.filter(r => (r.name || '') === this.quickSelectedRoutineFilter);
    this.quickRoutinesView = list;
    const ex: RoutineExercise[] = [];
    for (const r of list) { for (const e of (r.exercises || [])) ex.push(e as RoutineExercise); }
    this.quickExercisesView = ex;
  }

  trackRoutineById(_index: number, r: Routine) { return r?.id; }
  trackExerciseById(index: number, _e: RoutineExercise) { return index; }

  private saveQuickDayState() {
    const payload = {
      mode: this.quickSelectionMode,
      routines: Array.from(this.quickSelectedRoutineIds),
      exercises: Array.from(this.quickSelectedExerciseIds),
      programFilter: this.quickSelectedProgramFilter,
      routineFilter: this.quickSelectedRoutineFilter,
      active: this.quickDayActive
    } as any;
    localStorage.setItem(`quick_day_state_${this.selectedDateUS}`, JSON.stringify(payload));
  }

  private restoreQuickDayState() {
    if (this.showTraining) return;
    try {
      const raw = localStorage.getItem(`quick_day_state_${this.selectedDateUS}`);
      if (!raw) {
        this.quickDayActive = false;
        return;
      }
      const s = JSON.parse(raw);
      if (!s || !s.active) {
        this.quickDayActive = false;
        return;
      }
      this.quickSelectionMode = (s.mode === 'exercises' ? 'exercises' : 'routines');
      this.quickSelectedRoutineIds = new Set<string>(Array.isArray(s.routines) ? s.routines : []);
      this.quickSelectedExerciseIds = new Set<string>(Array.isArray(s.exercises) ? s.exercises : []);
      this.quickSelectedProgramFilter = s.programFilter || 'all';
      this.quickSelectedRoutineFilter = s.routineFilter || 'all';
      if (this.quickSelectionMode === 'routines') {
        const selected = this.allRoutines.filter(r => this.quickSelectedRoutineIds.has(r.id));
        this.quickDayActive = selected.length > 0;
        if (!this.quickDayActive) return;
        this.routinesToday = selected;
        this.totalExercisesToday = this.routinesToday.reduce((acc, r) => acc + ((r.exercises && r.exercises.length) || 0), 0);
        this.todayExercises = this.routinesToday.reduce((acc: RoutineExercise[], r: Routine) => acc.concat(r.exercises || []), [] as RoutineExercise[]);
      } else {
        const selectedEx: RoutineExercise[] = [];
        for (const r of this.allRoutines) { for (const ex of (r.exercises || [])) { if (this.quickSelectedExerciseIds.has(ex.exerciseId)) selectedEx.push(ex as RoutineExercise); } }
        this.quickDayActive = selectedEx.length > 0;
        if (!this.quickDayActive) return;
        const virtual: Routine = { id: 'quick-day', name: this.translationService.translate('quick.day_title'), description: this.translationService.translate('quick.day_desc'), exercises: selectedEx, frequency: 'custom', days: [], isActive: true, createdAt: new Date(), updatedAt: new Date(), programName: this.translationService.translate('quick.custom_program') } as any;
        this.routinesToday = [virtual];
        this.totalExercisesToday = selectedEx.length;
        this.todayExercises = selectedEx;
      }
      const map = new Map<string, string>();
      const pmap = new Map<string, string>();
      for (const r of this.routinesToday) { for (const ex of (r.exercises || [])) { if (ex.exerciseId) { map.set(ex.exerciseId, r.name); if (r.programName) pmap.set(ex.exerciseId, r.programName); } } }
      this.exerciseRoutineNameMap = map;
      this.exerciseProgramNameMap = pmap;
      // Do not update view here, let updateTodayData handle it
    } catch {}
  }

  async resetRoutineForToday(routine: any) {
    if (!routine || !routine.id) return;
    const routineId = routine.id;
    if (this.resettingRoutineIds.has(routineId)) return;
    this.resettingRoutineIds.add(routineId);
    this.routinesStaggerActive = false;
    try { this.cdr.detectChanges(); } catch {}
    const dateUS = this.selectedDateUS;
    const targetDate = (() => {
      const parts = String(dateUS || '').split('/');
      if (parts.length === 3) return new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
      return this.utilService.getToday();
    })();

    try {
      await new Promise(r => setTimeout(r, 0));

      const exIds = Array.from(new Set(((routine.exercises || []) as any[]).map(e => e?.exerciseId).filter(Boolean)));
      const isSynthetic = routineId === 'quick-day' || String(routineId).startsWith('name_ref:') || routineId === 'unsorted';
      const targets: Array<{ exerciseId: string; routineId?: string | null }> = [];
      for (const exerciseId of exIds) {
        if (!isSynthetic) targets.push({ exerciseId, routineId });
        targets.push({ exerciseId, routineId: undefined });
      }

      if (targets.length) {
        await this.storageService.deleteExerciseLogsForDateAndExercises(targetDate, targets).catch(() => {});
        await new Promise(r => setTimeout(r, 0));
        try {
          const start = new Date(targetDate); start.setHours(0, 0, 0, 0);
          const end = new Date(targetDate); end.setHours(23, 59, 59, 999);
          const startMs = start.getTime();
          const endMs = end.getTime();
          const wanted = new Set<string>(targets.map((t: { exerciseId: string; routineId?: string | null }) => `${t.exerciseId}::${t.routineId ?? ''}`));
          const currentLogs = this.store.getState().exerciseLogs || [];
          const filteredLogs = currentLogs.filter((l: any) => {
            const dt = (l?.date instanceof Date) ? l.date.getTime() : new Date(l?.date).getTime();
            if (dt < startMs || dt > endMs) return true;
            const key = `${l.exerciseId}::${l.routineId ?? ''}`;
            return !wanted.has(key);
          });
          this.store.setExerciseLogs(filteredLogs);
        } catch {}
      }

      this.completedRoutineIds.delete(routineId);
      for (const exId of exIds) this.completedExerciseIds.delete(exId);

      try {
        const session = await this.storageService.getWorkoutSessionLocal(dateUS);
        if (session) {
          const nextCompleted = (session.completedRoutineIds || []).filter(id => id !== routineId);
          const nextExercises = (session.exercises || []).filter((e: any) => {
            const rid = e?.__routineId;
            if (rid && rid === routineId) return false;
            if (isSynthetic && !rid && exIds.includes(e?.exerciseId)) return false;
            return true;
          });
          if (nextExercises.length === 0 && nextCompleted.length === 0) {
            await this.storageService.clearWorkoutSessionLocal(dateUS).catch(() => {});
          } else {
            await this.storageService.saveWorkoutSessionLocal(dateUS, session.startTs, session.endTs, session.durationSec, nextExercises, nextCompleted).catch(() => {});
          }
        }
      } catch {}

      await this.storageService.clearWorkoutSegmentsForRoutineLocal(dateUS, routineId).catch(() => {});
      try { this.durationSeconds = await this.storageService.getWorkoutTotalDurationLocal(dateUS); } catch {}

      await new Promise(r => setTimeout(r, 0));
      try {
        for (const r of (this.routinesToday || [])) {
          if (r.id !== routineId) continue;
          for (const ex of (r.exercises || [])) {
            if (!exIds.includes(ex.exerciseId)) continue;
            (ex as any).completed = false;
            (ex as any).sets = [];
            (ex as any).notes = '';
          }
        }
        for (const ex of (this.todayExercises || [])) {
          const rid = (ex as any).__routineId;
          if (rid && rid !== routineId) continue;
          if (!rid && !isSynthetic) continue;
          if (!exIds.includes(ex.exerciseId)) continue;
          (ex as any).completed = false;
          (ex as any).sets = [];
          (ex as any).notes = '';
        }
      } catch {}

      this.dayCompleted = false;
      try { const routines = this.store.getState().routines || []; this.updateTodayData(routines); } catch {}
      this.markRoutineJustReset(routineId);
      try { this.cdr.detectChanges(); } catch {}
    } finally {
      this.resettingRoutineIds.delete(routineId);
      try { this.cdr.detectChanges(); } catch {}
    }
  }
  toggleRoutineSelection(id: string) {
    if (!id) return;
    if (this.selectedRoutineIds.has(id)) this.selectedRoutineIds.delete(id); else this.selectedRoutineIds.add(id);
    this.cdr.detectChanges();
  }
  isRoutineSelected(id: string): boolean { return this.selectedRoutineIds.has(id); }
  toggleSelectAll() {
    const candidates = this.filteredRoutinesToday().filter(r => !this.isRoutineCompleted(r.id)).map(r => r.id);
    const allSelected = candidates.every(id => this.selectedRoutineIds.has(id));
    if (allSelected) {
      for (const id of candidates) this.selectedRoutineIds.delete(id);
    } else {
      for (const id of candidates) this.selectedRoutineIds.add(id);
    }
    this.cdr.detectChanges();
  }
  areAllSelectableSelected(): boolean {
    const candidates = this.filteredRoutinesToday().filter(r => !this.isRoutineCompleted(r.id)).map(r => r.id);
    return candidates.length > 0 && candidates.every(id => this.selectedRoutineIds.has(id));
  }
  selectablePendingCountToday(): number {
    return this.filteredRoutinesToday().filter(r => !this.isRoutineCompleted(r.id)).length;
  }
  areAllCompleted(): boolean {
    const list = Array.isArray(this.routinesToday) ? this.routinesToday : [];
    if (list.length === 0) return false;
    return list.every(r => this.isRoutineCompleted(r.id));
  }
  hasSelection(): boolean { return this.selectedRoutineIds.size > 0; }

  getSelectedExercisesCount(): number {
    if (this.selectedRoutineIds.size === 0) return 0;
    const list = this.filteredRoutinesToday();
    return list
      .filter(r => this.selectedRoutineIds.has(r.id))
      .reduce((acc, r) => acc + ((r.exercises && r.exercises.length) || 0), 0);
  }

  private dayToKeyMap: {[key: string]: string} = {
    'Monday': 'common.mon',
    'Tuesday': 'common.tue',
    'Wednesday': 'common.wed',
    'Thursday': 'common.thu',
    'Friday': 'common.fri',
    'Saturday': 'common.sat',
    'Sunday': 'common.sun'
  };

  getRoutineDaysLabel(routine: Routine): string {
    if (!routine || !routine.days || !Array.isArray(routine.days)) return '';
    return routine.days.map((d: string) => {
      const key = this.dayToKeyMap[d];
      return key ? this.translationService.translate(key) : d;
    }).join(', ');
  }

  getDaysPerWeekLabel(routine: Routine): string {
    const days = Array.isArray(routine?.days) ? routine.days.length : 0;
    const daysWeek = this.translationService.translate('programs.days_week');
    const daily = this.translationService.translate('routines.daily');
    return days > 0 ? `${days} ${daysWeek}` : (routine?.frequency === 'daily' ? daily : `0 ${daysWeek}`);
  }

  private startTimer(reset: boolean = true) {
    if (reset) {
      this.trainingStartTime = Date.now();
      this.saveTrainingProgress();
    }

    if (this.timerInterval) clearInterval(this.timerInterval);

    this.ngZone.runOutsideAngular(() => {
      this.timerInterval = setInterval(() => {
        if (!this.trainingStartTime) return;
        const now = Date.now();
        const diff = now - this.trainingStartTime;
        this.ngZone.run(() => {
          this.updateElapsedTime(diff);
        });
      }, 1000);
    });

    if (this.trainingStartTime) {
      this.updateElapsedTime(Date.now() - this.trainingStartTime);
    }
  }

  private saveTrainingProgress() {
    if (!this.showTraining || !this.trainingStartTime) return;
    this.storageService.setTrainingState({
      inProgress: true,
      startedAt: new Date(this.trainingStartTime).toISOString(),
      routineIds: Array.from(this.activeRoutineIds),
      exercises: this.todayExercises
    });
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.storageService.clearTrainingState();
    this.trainingStartTime = null;
    this.elapsedTimeStr = '00:00';
  }

  private async loadWorkoutSessionForDate() {
    try {
      const session = await this.storageService.getWorkoutSessionLocal(this.selectedDateUS);
      let hasSessionData = false;
      if (session && Array.isArray(session.exercises) && session.exercises.length > 0) {
        this.todayExercises = session.exercises;
        hasSessionData = true;
        
        // Restore completion state from session
        this.completedExerciseIds.clear();
        this.completedRoutineIds.clear();
        
        if (session.completedRoutineIds && Array.isArray(session.completedRoutineIds) && session.completedRoutineIds.length > 0) {
           session.completedRoutineIds.forEach((id: string) => this.completedRoutineIds.add(id));
        }

        for (const ex of this.todayExercises) {
          if (ex.completed) this.completedExerciseIds.add(ex.exerciseId);
        }
        
        // Calculate routine completion if not restored
        if (this.completedRoutineIds.size === 0) {
          const routines = new Set<string>();
          for (const ex of this.todayExercises) {
            let rid = (ex as any).__routineId;
            if (!rid && (ex as any).__routineName) rid = 'name_ref:' + (ex as any).__routineName;
            if (rid) routines.add(rid);
          }
          for (const rid of routines) {
            const routineExs = this.todayExercises.filter(e => {
              let erid = (e as any).__routineId;
              if (!erid && (e as any).__routineName) erid = 'name_ref:' + (e as any).__routineName;
              return erid === rid;
            });
            // Only consider exercises that have sets OR are marked completed.
            // If an exercise has no sets and is not completed, it effectively "doesn't exist" for the log.
            const relevantExs = routineExs.filter(e => e.completed || (Array.isArray((e as any).sets) && (e as any).sets.length > 0));
            
            if (relevantExs.length > 0 && relevantExs.every(e => e.completed)) {
              this.completedRoutineIds.add(rid);
            }
          }
        }

        this.updateVisibleTodayExercises();
      }

      const totalLocal = await this.storageService.getWorkoutTotalDurationLocal(this.selectedDateUS);
      this.durationSeconds = totalLocal;
      if (totalLocal > 0 || hasSessionData) return;
      if (await this.supabase.isAuthenticated()) {
        const remote = await this.supabase.getWorkoutSessionByDate(this.selectedDateUS);
        
        // Check if session exists (even with 0 duration) OR if we can find logs for this date
        // We prioritize the session record, but if it's missing/broken, we fall back to logs
        let hasRemoteData = false;
        
        if (remote) {
           this.durationSeconds = Math.round((remote as any).duration_seconds || 0);
           hasRemoteData = true;
        }

        // Always try to fetch logs if we have a session OR if it's a past date (fallback)
        // This ensures we catch cases where workout_session might be missing/deleted but logs remain
        const parts = this.selectedDateUS.split('/');
        const targetDate = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
        const t = this.utilService.getToday();
        const isPast = targetDate.getTime() < new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();

        if (hasRemoteData || isPast) {
          const logs = await this.supabase.getExerciseLogsForDate(targetDate);
          
          if (logs && logs.length > 0) {
            this.todayExercises = logs.map((l: any) => ({
              exerciseId: l.exerciseId,
              exerciseName: l.exerciseName,
              weightUnit: l.weightUnit || 'lb',
              sets: l.sets.map((s: any) => ({
                reps: s.reps,
                weight: s.weight,
                unit: s.weightUnit,
                rir: 0 // Logs don't store RIR usually, default to 0
              })),
              __routineId: l.routineId,
              __routineName: l.routineName,
              notes: l.notes,
              // Add dummy values for required fields if missing
              targetSets: l.sets.length,
              targetReps: 0,
              order: 0,
              completed: true // Logs are completed exercises
            } as any));
            
            // Populate completion state
            this.completedExerciseIds.clear();
            this.completedRoutineIds.clear();
            for (const ex of this.todayExercises) {
               this.completedExerciseIds.add(ex.exerciseId);
               let rid = (ex as any).__routineId;
               if (!rid && (ex as any).__routineName) rid = 'name_ref:' + (ex as any).__routineName;
               if (rid) this.completedRoutineIds.add(rid);
            }
            
            this.updateVisibleTodayExercises();
            
            return;
          }
        }
        
        if (hasRemoteData) return; // Session exists but no logs? Valid state (empty workout).
      }
      this.dayCompleted = false; this.durationSeconds = 0;
    } catch { this.dayCompleted = false; this.durationSeconds = 0; }
  }
  formatDuration(seconds: number): string {
    const s = Math.max(0, Math.round(seconds || 0));
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  private updateElapsedTime(diffMs: number) {
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');

    if (hours > 0) {
      this.elapsedTimeStr = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    } else {
      this.elapsedTimeStr = `${pad(minutes)}:${pad(seconds)}`;
    }
  }

  formatTimer(): string { return this.elapsedTimeStr; }

  selectedTrainingProgramFilter: string = 'all';
  selectedTrainingRoutineFilter: string = 'all';
  showTrainingFilters = false;
  trainingFiltersMode: 'none'|'programs'|'routines' = 'none';
  visibleTodayExercises: RoutineExercise[] = [];
  hoverIndex: number | null = null;
  draggingId: string | null = null;
  setTrainingProgramFilter(val: string) {
    this.selectedTrainingProgramFilter = val;
    this.showTrainingFilters = false;
    this.trainingFiltersMode = 'none';
    this.updateVisibleTodayExercises();
  }
  setTrainingRoutineFilter(val: string) {
    this.selectedTrainingRoutineFilter = val;
    this.showTrainingFilters = false;
    this.trainingFiltersMode = 'none';
    this.updateVisibleTodayExercises();
  }
  toggleTrainingFilters(mode: 'programs'|'routines') {
    if (this.trainingFiltersMode === mode && this.showTrainingFilters) {
      this.showTrainingFilters = false;
      this.trainingFiltersMode = 'none';
    } else {
      this.trainingFiltersMode = mode;
      this.showTrainingFilters = true;
    }
  }
  getTrainingPrograms(): string[] {
    const set = new Set<string>();
    for (const ex of (this.todayExercises || [])) {
      const p = this.getProgramNameForExercise(ex.exerciseId);
      if (p) set.add(p);
    }
    return Array.from(set);
  }
  getTrainingRoutines(): string[] {
    const set = new Set<string>();
    for (const ex of (this.todayExercises || [])) {
      const r = this.getRoutineNameForExercise(ex.exerciseId);
      if (r) set.add(r);
    }
    return Array.from(set);
  }
  private updateVisibleTodayExercises() {
    let list = Array.isArray(this.todayExercises) ? [...this.todayExercises] : [];
    if (this.selectedTrainingProgramFilter !== 'all') {
      list = list.filter(ex => this.getProgramNameForExercise(ex.exerciseId) === this.selectedTrainingProgramFilter);
    }
    if (this.selectedTrainingRoutineFilter !== 'all') {
      list = list.filter(ex => this.getRoutineNameForExercise(ex.exerciseId) === this.selectedTrainingRoutineFilter);
    }
    const seen = new Set<string>();
    const unique: typeof list = [];
    for (const ex of list) { if (!seen.has(ex.exerciseId)) { seen.add(ex.exerciseId); unique.push(ex); } }
    list = unique;
    this.visibleTodayExercises = list;
    this.storageService.getTrainingOrder(this.selectedDateUS).then(order => {
      if (!Array.isArray(order) || order.length === 0) return;
      const idx = (id: string) => { const i = order.indexOf(id); return i >= 0 ? i : Number.MAX_SAFE_INTEGER; };
      const sorted = [...this.visibleTodayExercises].sort((a, b) => idx(a.exerciseId) - idx(b.exerciseId));
      this.visibleTodayExercises = sorted;
    }).catch(() => {});
  }

  dropTrainingExercises(event: CdkDragDrop<RoutineExercise[]>) {
    const from = event.previousIndex;
    const to = (this.hoverIndex ?? event.currentIndex);
    if (from === to) { this.hoverIndex = null; return; }
    const next = [...this.visibleTodayExercises];
    moveItemInArray(next, from, to);
    this.visibleTodayExercises = next;
    this.hoverIndex = null;
    const orderedIds = this.visibleTodayExercises.map(ex => ex.exerciseId);
    this.storageService.saveTrainingOrder(this.selectedDateUS, orderedIds).catch(() => {});
    try {
      const byRoutine = new Map<string, string[]>();
      for (const ex of this.visibleTodayExercises) {
        const rid = (ex as any).__routineId || this.exerciseRoutineIdMap.get(ex.exerciseId);
        if (!rid) continue;
        const list = byRoutine.get(rid) || [];
        list.push(ex.exerciseId);
        byRoutine.set(rid, list);
      }
      for (const r of this.routinesToday) {
        const rid = r.id;
        const current = (r.exercises || []).map(e => e.exerciseId);
        const vis = byRoutine.get(rid) || [];
        const ordered = [...vis, ...current.filter(id => !vis.includes(id))];
        this.storageService.updateRoutineExerciseOrder(rid, ordered).catch(() => {});
        const storeRoutines = this.store.getState().routines || [];
        const nextRoutines = storeRoutines.map(sr => {
          if (sr.id !== rid) return sr;
          const exMap = new Map<string, any>();
          for (const e of (sr.exercises || [])) exMap.set(e.exerciseId, e);
          const reordered = ordered.map((eid, idx) => ({ ...(exMap.get(eid) || {}), order: idx }));
          const rest = (sr.exercises || []).filter(e => !ordered.includes(e.exerciseId));
          return { ...sr, exercises: [...reordered, ...rest] } as any;
        });
        this.store.setRoutines(nextRoutines);
      }
    } catch {}
  }

  onTrainDragEntered(index: number) { if (this.hoverIndex !== index) this.hoverIndex = index; }
  onTrainDragExited(index: number) { if (this.hoverIndex === index) this.hoverIndex = null; }
  onTrainDragStarted(id: string) { this.draggingId = id; }
  onTrainDragEnded() { this.draggingId = null; this.hoverIndex = null; }
  trackByRoutineId(_index: number, r: any): string { return String((r && r.id) || _index); }
  trackByExerciseId(_index: number, ex: RoutineExercise): string { const rid = (ex as any).__routineId || ''; return `${ex.exerciseId}:${rid}`; }

  finishTraining() {
    if (this.showTraining && !this.finishConfirmAccepted && !this.showFinishConfirm) { this.finishTimeStr = this.formatTimer(); this.showFinishConfirm = true; return; }
    this.loader.show();
    const startCopy = this.trainingStartTime || Date.now();
    this.stopTimer();
    this.panelState = 'exiting';

    // Mark selected routines as completed
    const idsToComplete = (this.activeRoutineIds && this.activeRoutineIds.size > 0) ? this.activeRoutineIds : this.selectedRoutineIds;
    idsToComplete.forEach(id => { this.completedRoutineIds.add(id); });

    // Mark exercises as completed if they have sets
    if (this.todayExercises && this.todayExercises.length > 0) {
      this.todayExercises.forEach(ex => {
        const hasSets = Array.isArray((ex as any).sets) && (ex as any).sets.length > 0;
        if (hasSets || this.completedExerciseIds.has(ex.exerciseId)) {
          ex.completed = true;
          this.completedExerciseIds.add(ex.exerciseId);
        }
      });
    }

    // Persist exercise logs for the completed selection
    const saveLogsPromise = (async () => {
      try {
        const sessionDate = (() => {
          const parts = this.selectedDateUS.split('/');
          if (parts.length === 3) {
            const mm = Number(parts[0]) - 1;
            const dd = Number(parts[1]);
            const yyyy = Number(parts[2]);
            return new Date(yyyy, mm, dd);
        }
        return this.utilService.getToday();
      })();
      
      const exercisesToLog = (this.todayExercises || [])
          .filter(ex => Array.isArray((ex as any).sets) && ((ex as any).sets as any[]).length > 0);
        const logsPayload = exercisesToLog.map(ex => {
          const setsRaw = ((ex as any).sets as Array<{ reps: number; weight: number; rir: number; unit?: 'kg'|'lb' }>);
          const mappedSets = setsRaw.map(s => ({
            reps: Number(s.reps) || 0,
            weight: Number(s.weight) || 0,
            weightUnit: (s.unit as any) || ex.weightUnit || 'kg',
            isPersonalRecord: false,
          }));
          // Volume calculation: Weight * Reps (Standard)
          const totalVolume = mappedSets.reduce((acc, s) => acc + ((s.weight || 0) * (s.reps || 0)), 0);
          const maxWeight = mappedSets.reduce((acc, s) => Math.max(acc, s.weight || 0), 0);
          return {
            exerciseId: ex.exerciseId,
            sets: mappedSets,
            notes: '',
            date: sessionDate,
            totalVolume,
            maxWeight,
            routineId: ((ex as any).__routineId as string) || this.exerciseRoutineIdMap.get(ex.exerciseId) || undefined,
          } as any;
        });

        if (logsPayload.length) {
          try {
            await this.storageService.deleteExerciseLogsForDateAndExercises(
              sessionDate,
              logsPayload.map((l: any) => ({ exerciseId: l.exerciseId, routineId: l.routineId }))
            );
          } catch (err) { console.error('Error clearing old logs:', err); }

          await this.storageService.logExercisesBulk(logsPayload).then(list => {
            // Update store: Replace only the affected exercise+routine entries for this date
            const currentLogs = this.store.getState().exerciseLogs || [];
            const start = new Date(sessionDate); start.setHours(0,0,0,0);
            const end = new Date(sessionDate); end.setHours(23,59,59,999);
            const wanted = new Set(logsPayload.map((l: any) => `${l.exerciseId}::${l.routineId ?? ''}`));
            const filteredLogs = currentLogs.filter(l => {
              const d = new Date(l.date);
              if (d < start || d > end) return true;
              const key = `${(l as any).exerciseId}::${(l as any).routineId ?? ''}`;
              return !wanted.has(key);
            });
            const newLogs = [...filteredLogs];
            const existingIds = new Set(newLogs.map(l => l.id));
            for (const complete of list) {
              if (complete && complete.id && !existingIds.has(complete.id)) {
                newLogs.push(complete);
              }
            }
            this.store.setExerciseLogs(newLogs);
          }).catch(() => {});
        }
      } catch {}
    })();

    const ridListCopy = Array.from((this.activeRoutineIds && this.activeRoutineIds.size > 0) ? this.activeRoutineIds : this.selectedRoutineIds);
    this.selectedRoutineIds.clear();
    this.activeRoutineIds.clear();

    this.panelState = 'idle';

    (async () => {
      try {
        await saveLogsPromise; // Wait for logs to be saved

        const end = Date.now();
        const start = startCopy;
        const dur = Math.max(0, Math.round((end - start) / 1000));
        await this.storageService.appendWorkoutSegmentLocal(this.selectedDateUS, start, end, dur, ridListCopy);
        await this.storageService.saveWorkoutSessionLocal(this.selectedDateUS, start, end, dur, this.todayExercises, Array.from(this.completedRoutineIds));
        const totalLocal = await this.storageService.getWorkoutTotalDurationLocal(this.selectedDateUS);
        this.durationSeconds = totalLocal;
        const allExIds: string[] = [];
        for (const r of (this.routinesToday as Routine[])) {
          const exs = (r.exercises || []) as RoutineExercise[];
          for (const e of exs) { if (e.exerciseId) allExIds.push(e.exerciseId); }
        }
        const allExercisesDone = allExIds.length > 0 && allExIds.every((id: string) => this.completedExerciseIds.has(id));
        this.dayCompleted = allExercisesDone && totalLocal > 0;
        if (await this.supabase.isAuthenticated()) {
          try {
            const prev = await this.supabase.getWorkoutSessionByDate(this.selectedDateUS);
            const prevDur = Number((prev as any)?.duration_seconds || 0);
            await this.supabase.upsertWorkoutSession(this.selectedDateUS, start, end, prevDur + dur);
          } catch {
            await this.supabase.upsertWorkoutSession(this.selectedDateUS, start, end, dur);
          }
        }
        // Sync latest training sets/weights back to store and local storage so Home/Preview reflect changes
      try {
        const live = Array.isArray(this.todayExercises) ? this.todayExercises : [];
        for (const ex of live) {
          const rid = ((ex as any).__routineId as string) || this.exerciseRoutineIdMap.get(ex.exerciseId) || '';
          if (!rid) continue;
          const setsFull = this.getSets(ex).map(s => ({ reps: Number((s as any).reps) || 0, weight: Number((s as any).weight) || 0, rir: Number((s as any).rir) || 0, unit: ((s as any).unit || ex.weightUnit || 'kg') as any }));
          const plannedCount = this.getPlannedSetCount(ex);
          // For quick-day/custom routines, we persist ALL sets.
          const setsPersist = (rid === 'quick-day') ? setsFull : setsFull.slice(0, plannedCount);
          await this.storageService.updateRoutineExerciseSets(rid, ex.exerciseId, setsPersist, ex.targetReps);
          const baseWeight = ((setsFull[0]?.weight ?? Number(ex.weight)) || 0);
          await this.storageService.updateRoutineExerciseWeight(rid, ex.exerciseId, baseWeight);

          // Also persist directly to the exercise in todayExercises to ensure immediate availability
          const memEx = this.todayExercises.find(e => e.exerciseId === ex.exerciseId);
          if (memEx) {
             (memEx as any).sets = setsFull;
          }

          this.applyExerciseChangeToStore(rid, ex.exerciseId, (e: any) => {
            e.sets = setsPersist;
            e.weight = baseWeight;
            if (typeof ex.targetReps === 'number') e.targetReps = ex.targetReps;
            // Keep existing base weight fields; sets carry the actual per-set weight
            return e;
          });
        }
      } catch {}

        const routines = this.store.getState().routines || [];
        this.showTraining = false;
        await this.updateTodayData(routines);
        try { await this.notifications.stopTrainingInactivity(this.selectedDateUS); } catch {}
      } catch {} finally {
        this.showTraining = false;
        this.finishConfirmAccepted = false;
        this.loader.hide();
      }
    })();
  }

  openTrainingSelected() {
    this.completedExerciseIds.clear();
    const selected = this.filteredRoutinesToday().filter(r => this.selectedRoutineIds.has(r.id));
    const exercises = selected.reduce((acc: RoutineExercise[], r: Routine) => acc.concat((r.exercises || []).slice().sort((a,b)=>(a.order||0)-(b.order||0)).map(ex => ({ ...ex, __routineId: r.id } as any))), [] as RoutineExercise[]);
    const map = new Map<string, string>();
    const pmap = new Map<string, string>();
    const idMap = new Map<string, string>();
    for (const r of selected) {
      for (const ex of (r.exercises || [])) { if (ex.exerciseId) { map.set(ex.exerciseId, r.name); idMap.set(ex.exerciseId, r.id); if (r.programName) pmap.set(ex.exerciseId, r.programName); } }
    }
    this.exerciseRoutineNameMap = map;
    this.exerciseProgramNameMap = pmap;
    this.exerciseRoutineIdMap = idMap;
    this.todayExercises = exercises;
    this.expandedIds = new Set<string>((this.todayExercises || []).map(ex => ex.exerciseId).filter((id: string) => !!id));
    this.activeRoutineIds = new Set<string>(selected.map(r => r.id));
    this.panelState = 'entering';
    this.showTraining = true;
    this.startTimer(true);
    (async () => {
      try {
        const start = Date.now();
        this.trainingStartTime = start;
        const dateUS = this.selectedDateUS;
        await this.storageService.saveWorkoutSessionLocal(dateUS, start, 0, 0, this.todayExercises, Array.from(this.completedRoutineIds));
        if (await this.supabase.isAuthenticated()) {
          await this.supabase.upsertWorkoutSession(dateUS, start, undefined, undefined);
        }
        try { await this.notifications.startTrainingInactivity(dateUS); } catch {}
      } catch {}
    })();
    this.updateVisibleTodayExercises();
  }
  getTotalTargetSets(): number {
    try {
      const list = Array.isArray(this.todayExercises) ? this.todayExercises : [];
      return list.reduce((acc: number, ex: RoutineExercise) => {
        const setsArr = (ex as any).sets as any[];
        const actual = Array.isArray(setsArr) ? setsArr.length : 0;
        if (actual > 0) return acc + actual;
        const planned = Number(ex.targetSets) || 0;
        return acc + planned;
      }, 0);
    } catch {
      return 0;
    }
  }
  getUniqueExerciseCount(): number {
    try {
      const ids = new Set<string>((this.todayExercises || []).map(ex => ex.exerciseId).filter((id: string) => !!id));
      return ids.size;
    } catch { return (this.todayExercises || []).length; }
  }
  getTotalActualSets(): number {
    try {
      const list = Array.isArray(this.todayExercises) ? this.todayExercises : [];
      return list.reduce((acc: number, ex: RoutineExercise) => acc + (this.getSets(ex).length || 0), 0);
    } catch { return 0; }
  }
  getTotalActualReps(): number {
    try {
      const list = Array.isArray(this.todayExercises) ? this.todayExercises : [];
      return list.reduce((acc: number, ex: RoutineExercise) => acc + this.getSets(ex).reduce((a, s: any) => a + (Number(s.reps) || 0), 0), 0);
    } catch { return 0; }
  }
  getExtraSetsCount(): number {
    try {
      const list = Array.isArray(this.todayExercises) ? this.todayExercises : [];
      return list.reduce((acc: number, ex: RoutineExercise) => {
        const total = this.getSets(ex).length;
        const planned = this.getPlannedSetCount(ex);
        const extras = Math.max(0, total - planned);
        return acc + extras;
      }, 0);
    } catch { return 0; }
  }
  getTotalVolumeKg(): number {
    try {
      const list = Array.isArray(this.todayExercises) ? this.todayExercises : [];
      const toKg = (w: number, u: 'kg'|'lb'): number => {
        const ww = Number(w || 0);
        return u === 'lb' ? Number((ww / 2.20462).toFixed(2)) : ww;
      };
      const vol = list.reduce((acc: number, ex: RoutineExercise) => acc + this.getSets(ex).reduce((a, s: any) => a + (toKg(Number(s.weight || 0), ((s.unit as any) || ex.weightUnit || 'kg') as any) * (Number(s.reps || 0))), 0), 0);
      return Math.round(vol);
    } catch { return 0; }
  }
  getVolumeLabel(): string {
    return this.translationService.translate('common.volume');
  }
  getExtrasLabel(): string {
    return this.translationService.translate('common.extras');
  }
  getIncompleteExerciseNames(): string[] {
    try {
      const list = Array.isArray(this.todayExercises) ? this.todayExercises : [];
      return list.filter(ex => !this.isExerciseCompleted(ex.exerciseId)).map(ex => (ex.exerciseName || this.translationService.translate('common.exercise')));
    } catch { return []; }
  }
  getUnfinishedLabel(): string {
    return this.translationService.translate('common.unfinished_exercises');
  }
  getContinueTrainingText(): string {
    return this.translationService.translate('common.continue_training');
  }
  getEndTrainingText(): string {
    return this.translationService.translate('common.end_training');
  }
  getRoutineNameForExercise(exerciseId: string): string {
    if (this.exerciseRoutineNameMap.has(exerciseId)) return this.exerciseRoutineNameMap.get(exerciseId) || '';

    // Fallback: Try to find by ID if map fails
    const rid = this.exerciseRoutineIdMap.get(exerciseId);
    if (rid) {
      const routines = this.store.getState().routines || [];
      const r = routines.find(x => x.id === rid);
      if (r) {
        // Cache it for next time
        this.exerciseRoutineNameMap.set(exerciseId, r.name);
        if (r.programName) this.exerciseProgramNameMap.set(exerciseId, r.programName);
        return r.name;
      }
    }

    // Deep search fallback
    const routines = this.store.getState().routines || [];
    for (const r of routines) {
      const found = (r.exercises || []).some(e => e.exerciseId === exerciseId);
      if (found) {
        this.exerciseRoutineNameMap.set(exerciseId, r.name);
        this.exerciseRoutineIdMap.set(exerciseId, r.id);
        if (r.programName) this.exerciseProgramNameMap.set(exerciseId, r.programName);
        return r.name;
      }
    }
    return '';
  }
  getProgramNameForExercise(exerciseId: string): string {
    if (this.exerciseProgramNameMap.has(exerciseId)) return this.exerciseProgramNameMap.get(exerciseId) || '';

    // Ensure routine is looked up first, which populates program map
    this.getRoutineNameForExercise(exerciseId);

    return this.exerciseProgramNameMap.get(exerciseId) || '';
  }
  private exerciseProgramNameMap = new Map<string, string>();
  private exerciseRoutineIdMap = new Map<string, string>();
  private applyExerciseChangeToStore(routineId: string, exerciseId: string, updater: (e: any) => any) {
    try {
      const current = this.store.getState().routines || [];
      const updated = current.map(r => {
        if (r.id !== routineId) return r;
        const exs = (r.exercises || []).map(e => {
          if (e.exerciseId !== exerciseId) return e;
          const next: any = { ...e };
          const res = updater(next);
          return (res !== undefined ? res : next);
        });
        return { ...r, exercises: exs } as any;
      });
      this.store.setRoutines(updated);
    } catch {}
  }
  isExpanded(exercise: RoutineExercise): boolean { return this.expandedIds.has(exercise?.exerciseId); }
  toggleExercise(exercise: RoutineExercise) {
    const id = exercise?.exerciseId;
    if (!id) return;
    const wasOpen = this.expandedIds.has(id);
    if (wasOpen) {
      this.expandedIds.delete(id);
    } else {
      this.expandedIds.add(id);
      // Optimized: no scroll or measurements on toggle
    }
  }

  getSets(exercise: RoutineExercise): Array<{ reps: number; weight: number; rir: number; unit?: 'kg'|'lb'; unitOpen?: boolean; unitPulse?: boolean }> {
    const arr = (exercise as any).sets as Array<{ reps: number; weight: number; rir: number; unit?: 'kg'|'lb'; unitOpen?: boolean; unitPulse?: boolean }>;
    return Array.isArray(arr) ? arr : [];
  }
  addSet(exercise: RoutineExercise) {
    this.ngZone.run(() => {
      const list = this.getSets(exercise);
      const base = list.length > 0 ? (list[0] as any) : { weight: Number(exercise.weight) || 0, unit: exercise.weightUnit || 'kg' };
      const next = [...list, { reps: Number(exercise.targetReps) || 8, weight: Number(base.weight) || 0, rir: Number(exercise.reserveReps || 0) || 0, unit: (base.unit as any) || (exercise.weightUnit || 'kg') }];
      (exercise as any).sets = next;
      this.persistExercise(exercise);
      try { this.notifications.bumpTrainingActivity(this.selectedDateUS); } catch {}
      try { this.cdr.detectChanges(); } catch {}
    });
  }
  removeSet(exercise: RoutineExercise, index: number) {
    this.ngZone.run(() => {
      const list = this.getSets(exercise);
      if (index < 0 || index >= list.length) return;
      const cur = [...list];
      cur.splice(index, 1);
      (exercise as any).sets = cur;
      this.persistExercise(exercise);
      try { this.notifications.bumpTrainingActivity(this.selectedDateUS); } catch {}
      try { this.cdr.detectChanges(); } catch {}
    });
  }
  updateSetValue(exercise: RoutineExercise, index: number, field: 'reps'|'weight'|'rir', value: any) {
    const list = this.getSets(exercise);
    if (index < 0 || index >= list.length) return;
    if (value === '' || value === null || typeof value === 'undefined') return;
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
      const baseUnit: 'kg'|'lb' = (((cur[0] as any)?.unit as any) || exercise.weightUnit || 'kg') as any;
      const convert = (w: number, from: 'kg'|'lb', to: 'kg'|'lb') => {
        if (from === to) return Number(w || 0);
        return (from === 'kg' && to === 'lb') ? Number((Number(w || 0) * 2.20462).toFixed(1)) : Number((Number(w || 0) / 2.20462).toFixed(1));
      };
      for (let i = 0; i < cur.length; i++) {
        const it = { ...(cur[i] as any) };
        const targetUnit: 'kg'|'lb' = ((it.unit as any) || exercise.weightUnit || 'kg') as any;
        it.weight = convert(v, baseUnit, targetUnit);
        cur[i] = it as any;
      }
    } else {
      const item = { ...cur[index] } as any;
      item[field] = v;
      cur[index] = item;
    }
    (exercise as any).sets = cur;
    this.persistExercise(exercise);
    try { this.notifications.bumpTrainingActivity(this.selectedDateUS); } catch {}
  }
  getDisplayValue(exercise: RoutineExercise, index: number, field: 'reps'|'weight'|'rir'): any {
    const list = this.getSets(exercise);
    const item = list[index] as any;
    const k = this.key(exercise, index, field);
    if (this.focusedInputs.has(k)) return '';
    if (!item) return (exercise as any)[field] || 0;
    return item[field] ?? ((exercise as any)[field] || 0);
  }
  trackBySetIndex(index: number, _s: any): number { return index; }
  private key(exercise: RoutineExercise, index: number, field: 'reps'|'weight'|'rir'): string { return `${exercise.exerciseId}:${index}:${field}`; }
  onInputFocus(exercise: RoutineExercise, index: number, field: 'reps'|'weight'|'rir') { this.focusedInputs.add(this.key(exercise, index, field)); }
  onInputBlur(exercise: RoutineExercise, index: number, field: 'reps'|'weight'|'rir') { this.focusedInputs.delete(this.key(exercise, index, field)); }
  isUnitDropdownOpen(exercise: RoutineExercise, index: number): boolean {
    const list = this.getSets(exercise);
    const item = list[index] as any;
    return !!(item && item.unitOpen);
  }
  toggleUnitDropdown(exercise: RoutineExercise, index: number) {
    const list = this.getSets(exercise);
    if (index < 0 || index >= list.length) return;
    const cur = [...list];
    const item = { ...(cur[index] as any) };
    item.unitOpen = !item.unitOpen;
    cur[index] = item;
    (exercise as any).sets = cur;
  }
  private closeUnitDropdown(exercise: RoutineExercise, index: number) {
    const list = this.getSets(exercise);
    if (index < 0 || index >= list.length) return;
    const cur = [...list];
    const item = { ...(cur[index] as any) };
    item.unitOpen = false;
    cur[index] = item;
    (exercise as any).sets = cur;
  }
  isUnitJustSelected(exercise: RoutineExercise, index: number): boolean {
    const list = this.getSets(exercise);
    const item = list[index] as any;
    return !!(item && item.unitPulse);
  }
  setUnitForSet(exercise: RoutineExercise, index: number, unit: 'kg'|'lb') {
    const list = this.getSets(exercise);
    if (index < 0 || index >= list.length) return;
    const cur = [...list];
    const item = { ...(cur[index] as any) };
    const prev: 'kg'|'lb' = (item.unit as any) || exercise.weightUnit || 'kg';
    if (prev === unit) return;
    const convert = (w: number, from: 'kg'|'lb', to: 'kg'|'lb') => {
      if (from === to) return Number(w || 0);
      return (from === 'kg' && to === 'lb') ? Number((Number(w || 0) * 2.20462).toFixed(1)) : Number((Number(w || 0) / 2.20462).toFixed(1));
    };
    if (index === 0) {
      for (let i = 0; i < cur.length; i++) {
        const it = { ...(cur[i] as any) };
        const from: 'kg'|'lb' = (it.unit as any) || exercise.weightUnit || 'kg';
        it.weight = convert(Number(it.weight || 0), from, unit);
        it.unit = unit;
        cur[i] = it as any;
      }
      (exercise as any).sets = cur;
    } else {
      item.weight = convert(Number(item.weight || 0), prev, unit);
      item.unit = unit;
      item.unitPulse = true;
      cur[index] = item;
      (exercise as any).sets = cur;
      this.closeUnitDropdown(exercise, index);
      setTimeout(() => {
        const l = this.getSets(exercise);
        if (index < 0 || index >= l.length) return;
        const c = [...l];
        const it = { ...(c[index] as any) };
        it.unitPulse = false;
        c[index] = it;
        (exercise as any).sets = c;
      }, 260);
    }
    exercise.weightUnit = unit;
    this.persistExercise(exercise);
  }
  getRepsSummary(exercise: RoutineExercise): any {
    const sets = this.getSets(exercise);
    if (!Array.isArray(sets) || sets.length === 0) return exercise.targetReps || 0;
    const repsList = sets.map(s => Number((s as any).reps) || 0);
    const unique = Array.from(new Set(repsList));
    if (unique.length === 1) return unique[0];
    const min = Math.min(...repsList);
    const max = Math.max(...repsList);
    if (min === max) return min;
    return `${min}-${max}`;
  }

  isPreviewExpanded(id: string): boolean { return !!id && this.previewExpandedIds.has(id); }
  togglePreviewExercise(id: string) {
    if (!id) return;
    if (this.previewExpandedIds.has(id)) this.previewExpandedIds.delete(id); else this.previewExpandedIds.add(id);
  }
  onPreviewHeaderTap(id: string, ev: Event) {
    ev.preventDefault();
    ev.stopPropagation();
    this.ngZone.run(() => {
      const ex = this.previewExercises.find(e => e.exerciseId === id);
      if (ex) {
        const sets = this.getPreviewSets(ex);
        if (sets.length === 0) return;
        const allZero = sets.every(s => s.weight === 0 && s.reps === 0);
        if (allZero) return;
      }
      this.togglePreviewExercise(id);
      try { this.cdr.detectChanges(); } catch {}
    });
  }
  getPreviewSets(exercise: RoutineExercise): Array<{ reps: number; weight: number; rir: number; unit?: 'kg'|'lb' }> {
    return this.getSets(exercise).map(s => ({ reps: Number((s as any).reps) || 0, weight: Number((s as any).weight) || 0, rir: Number((s as any).rir) || 0, unit: ((s as any).unit || exercise.weightUnit || 'lb') as any }));
  }
  getPreviewGoal(exercise: RoutineExercise): { weight: number; unit: 'kg'|'lb' } | null {
    const wRaw = (exercise as any).goalWeight;
    const w = typeof wRaw === 'number' ? Number(wRaw) : NaN;
    if (!Number.isFinite(w)) return null;
    const u: 'kg'|'lb' = (((exercise as any).goalUnit as any) || exercise.weightUnit || 'kg') as any;
    return { weight: w, unit: u };
  }
  private computePreviewExercises(): RoutineExercise[] {
    const list: RoutineExercise[] = Array.isArray(this.previewRoutine?.exercises) ? (this.previewRoutine.exercises as RoutineExercise[]) : [];
    const map = new Map<string, RoutineExercise>();
    const rid = this.previewRoutine?.id || '';
    // Prefer live training sets for this routine, falling back to store-defined sets
    const liveById = new Map<string, Array<any>>();
    for (const e of (this.todayExercises || [])) {
      const eid = e?.exerciseId || '';
      const erid = ((e as any).__routineId as string) || this.exerciseRoutineIdMap.get(eid) || '';
      if (eid && erid && rid && erid === rid) {
        const cur = liveById.get(eid) || [];
        liveById.set(eid, [...cur, ...this.getSets(e)]);
      }
    }
    for (const ex of list) {
      const id = ex?.exerciseId || '';
      if (!id) {
        const copy = { ...(ex as any) } as RoutineExercise;
        map.set(`${Math.random()}`, copy);
        continue;
      }
      const existing = map.get(id);
      const liveSets = liveById.get(id) || [];
      if (!existing) {
        const base = { ...(ex as any) } as RoutineExercise;
        const defSets = this.getSets(ex);
        (base as any).sets = (liveSets.length > 0 ? liveSets : defSets);
        map.set(id, base);
      } else {
        const a = this.getSets(existing);
        const bDef = this.getSets(ex);
        const bLive = liveSets;
        const merged = [...a, ...((bLive.length > 0 ? bLive : bDef))];
        (existing as any).sets = merged;
        existing.targetSets = (Number(existing.targetSets) || 0) + (Number(ex.targetSets) || 0);
        if (typeof ex.targetReps === 'number' && !Number.isNaN(ex.targetReps)) existing.targetReps = ex.targetReps;
        const notesA = (existing.notes || '').trim();
        const notesB = (ex.notes || '').trim();
        if (notesB && notesB !== notesA) existing.notes = notesA ? `${notesA} | ${notesB}` : notesB;
      }
    }
    return Array.from(map.values());
  }
  persistExercise(_exercise: RoutineExercise) {
    const routineId = (( _exercise as any ).__routineId as string) || this.exerciseRoutineIdMap.get(_exercise.exerciseId);
    if (!routineId) return;
    const setsFull = this.getSets(_exercise).map(s => ({ reps: Number((s as any).reps) || 0, weight: Number((s as any).weight) || 0, rir: Number((s as any).rir) || 0, unit: ((s as any).unit || _exercise.weightUnit || 'kg') as any }));
    const plannedCount = this.getPlannedSetCount(_exercise);
    const currentRoutines = this.store.getState().routines || [];
    const defRoutine = currentRoutines.find(r => r.id === routineId);
    const defExercise: any = (defRoutine?.exercises || []).find(e => e.exerciseId === _exercise.exerciseId) || {};
    const existingSets = (defExercise?.sets || []).map((s: any) => ({ reps: Number(s?.reps) || 0, weight: Number(s?.weight) || 0, rir: Number(s?.rir) || 0, unit: ((s?.unit as any) || _exercise.weightUnit || 'kg') as any }));

    // For quick-day/custom routines, we persist ALL sets as the "plan" is dynamic.
    // For standard routines, we slice to plannedCount to keep the definition clean.
    const setsPersist = (routineId === 'quick-day') ? setsFull : setsFull.slice(0, plannedCount);

    // We need to pass order or index to be precise if duplicates exist
    // But updateRoutineExerciseSets only takes routineId and exerciseId.
    // If we have duplicates, they share ID. Updating one updates all in storage?
    // In Home memory (todayExercises), they are distinct objects.
    // But when saving to storage/Supabase, we rely on exerciseId.

    // Pass the order index to storage service to disambiguate
    this.storageService.updateRoutineExerciseSets(routineId, _exercise.exerciseId, setsPersist, _exercise.targetReps, _exercise.order).catch(() => {});
    const baseWeight = ((setsFull[0]?.weight ?? Number(_exercise.weight)) || 0);
    this.storageService.updateRoutineExerciseWeight(routineId, _exercise.exerciseId, baseWeight, _exercise.order).catch(() => {});
    const gw = (typeof ( (_exercise as any).goalWeight ) === 'number') ? Number(((_exercise as any).goalWeight) as number) : null;
    const gu = ( (_exercise as any).goalUnit as any ) || null;
    this.storageService.updateRoutineExerciseGoal(routineId, _exercise.exerciseId, gw, gu as any).catch(() => {});
    if (!this.showTraining) {
      this.applyExerciseChangeToStore(routineId, _exercise.exerciseId, (e: any) => {
        e.sets = setsPersist;
        e.weight = baseWeight;
        if (typeof _exercise.targetReps === 'number') e.targetReps = _exercise.targetReps;
        if (gw !== null) { e.goalWeight = gw; e.goalUnit = (gu || e.weightUnit || 'kg'); } else { delete e.goalWeight; delete e.goalUnit; }
        return e;
      });
    }

    this.saveTrainingProgress();

    if (!this.showTraining) {
      this.saveDailySession();
    }

    // If preview modal is open, refresh its data to reflect latest changes/extras
    try {
      if (this.showPreview && this.previewRoutine) {
        const list = this.computePreviewExercises();
        this.previewExercises = list;
        this.updatePreviewView();
        this.updatePreviewRoutineDuration(this.previewRoutine.id);
        this.cdr.detectChanges();
      }
    } catch {}
  }

  private async saveDailySession() {
    try {
      const current = await this.storageService.getWorkoutSessionLocal(this.selectedDateUS);
      const start = current?.startTs || 0;
      const end = current?.endTs || 0;
      const dur = current?.durationSec || this.durationSeconds || 0;
      const safeExercises: any[] = [];
      for (const r of (this.routinesToday || [])) {
        for (const ex of (r.exercises || [])) {
          safeExercises.push({ ...(ex as any), __routineId: r.id, __routineName: r.name });
        }
      }
      await this.storageService.saveWorkoutSessionLocal(this.selectedDateUS, start, end, dur, safeExercises, Array.from(this.completedRoutineIds));
    } catch {}
  }

  getPlannedSetCount(exercise: RoutineExercise): number {
    const routineId = ((exercise as any).__routineId as string) || this.exerciseRoutineIdMap.get(exercise.exerciseId);
    const currentRoutines = this.store.getState().routines || [];
    const defRoutine = routineId ? currentRoutines.find(r => r.id === routineId) : undefined;
    const defExercise: any = defRoutine ? (defRoutine.exercises || []).find(e => e.exerciseId === exercise.exerciseId) : undefined;
    const planned = Number(defExercise?.targetSets) || Number(exercise.targetSets) || 0;
    return Math.max(0, planned);
  }
  isExtraSet(exercise: RoutineExercise, index: number): boolean { return index >= this.getPlannedSetCount(exercise); }
  isPreviewExtraSet(exercise: RoutineExercise, index: number): boolean { return index >= (Number(exercise.targetSets) || 0); }

  hasGoal(exercise: RoutineExercise): boolean { return typeof (exercise as any).goalWeight === 'number'; }
  createGoal(exercise: RoutineExercise) {
    (exercise as any).goalWeight = Number((exercise.weight || 0).toFixed(1));
    (exercise as any).goalUnit = exercise.weightUnit || 'kg';
    this.persistExercise(exercise);
  }
  setGoalWeight(exercise: RoutineExercise, value: any) {
    let v = Number(value);
    if (Number.isNaN(v)) v = 0;
    v = Math.max(0, Math.min(1000, Number(v.toFixed(2))));
    (exercise as any).goalWeight = v;
    this.persistExercise(exercise);
  }
  getGoalWeight(exercise: RoutineExercise): number { return Number(((exercise as any).goalWeight || 0)); }
  getGoalUnit(exercise: RoutineExercise): string { return ((exercise as any).goalUnit || exercise.weightUnit || 'kg').toUpperCase(); }
  removeGoal(exercise: RoutineExercise) { delete (exercise as any).goalWeight; delete (exercise as any).goalUnit; this.persistExercise(exercise); }

  onGoalFocus(exercise: RoutineExercise) { this.focusedInputs.add('goal:'+exercise.exerciseId); }
  onGoalBlur(exercise: RoutineExercise) { this.focusedInputs.delete('goal:'+exercise.exerciseId); }
  private isGoalFocused(exercise: RoutineExercise): boolean { return this.focusedInputs.has('goal:'+exercise.exerciseId); }
  getGoalDisplayValue(exercise: RoutineExercise): any {
    const v = this.getGoalWeight(exercise);
    if (this.isGoalFocused(exercise)) return '';
    return v;
  }

  isGoalUnitDropdownOpen(exercise: RoutineExercise): boolean { return !!((exercise as any).goalUnitOpen); }
  toggleGoalUnitDropdown(exercise: RoutineExercise) { (exercise as any).goalUnitOpen = !((exercise as any).goalUnitOpen); }
  private closeGoalUnitDropdown(exercise: RoutineExercise) { (exercise as any).goalUnitOpen = false; }
  isGoalUnitJustSelected(exercise: RoutineExercise): boolean { return !!((exercise as any).goalUnitPulse); }
  isGoalUnitSelected(exercise: RoutineExercise, unit: 'kg'|'lb'): boolean {
    const u: 'kg'|'lb' = (((exercise as any).goalUnit as any) || exercise.weightUnit || 'kg') as any;
    return u === unit;
  }
  setGoalUnit(exercise: RoutineExercise, unit: 'kg'|'lb') {
    const prev: 'kg'|'lb' = ((exercise as any).goalUnit as any) || exercise.weightUnit || 'kg';
    if (prev === unit) { this.closeGoalUnitDropdown(exercise); return; }
    const factor = unit === 'lb' ? 2.20462 : 1 / 2.20462;
    const w = Number(((exercise as any).goalWeight || 0));
    (exercise as any).goalWeight = Number((w * factor).toFixed(1));
    (exercise as any).goalUnit = unit;
    (exercise as any).goalUnitPulse = true;
    this.closeGoalUnitDropdown(exercise);
    setTimeout(() => { (exercise as any).goalUnitPulse = false; }, 260);
    this.persistExercise(exercise);
  }

  getStartButtonText(): string { return this.translationService.translate('home.start_workout'); }

  private async updateTodayData(routines: Routine[]) {
    if (this.showTraining) return;

    this.todayExercises = [];
    this.dayCompleted = false;

    // Restore Quick Day State first (sets quickDayActive if found)
    this.restoreQuickDayState();

    const targetDate = (() => {
      const parts = this.selectedDateUS.split('/');
      if (parts.length === 3) {
        const mm = Number(parts[0]) - 1;
        const dd = Number(parts[1]);
        const yyyy = Number(parts[2]);
        return new Date(yyyy, mm, dd);
      }
      return new Date();
    })();
    const dayName = targetDate.toLocaleString('en-US', { weekday: 'long' });
    const list = (() => {
      const programs = (this.store.getState().programs || []) as any[];
      const active = new Set<string>((programs || []).filter(p => (p.isActive !== false)).map(p => p.name));
      const base = Array.isArray(routines) ? routines : [];
      return base.filter(r => !r.programName || active.has(r.programName));
    })();
    this.scheduledRoutinesToday = list.filter(r => (r?.frequency === 'daily' && (!r.days || r.days.length === 0)) || (Array.isArray(r?.days) && r.days.includes(dayName)));

    const t = this.utilService.getToday();
    const td = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const dd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const isPast = dd.getTime() < td.getTime();

    // Always try to load session to check completion/progress
    await this.loadWorkoutSessionForDate();

    if (!isPast) {
      const scheduledIds = (this.scheduledRoutinesToday || []).map(r => r.id).filter(Boolean);
      const allScheduledDone = scheduledIds.length > 0 && scheduledIds.every(id => this.completedRoutineIds.has(id));
      const quickDone = this.completedRoutineIds.has('quick-day');
      this.dayCompleted = scheduledIds.length ? allScheduledDone : quickDone;
    } else {
      this.dayCompleted = (this.todayExercises && this.todayExercises.length > 0) ? true : this.dayCompleted;
    }

    // If session/logs found, use them to reconstruct the view (Priority 1)
    if (this.dayCompleted || (this.todayExercises.length > 0)) {
        // Reconstruct routinesToday from the actual exercises performed (session)
        const routinesMap = new Map<string, Routine>();
        const allRoutines = this.store.getState().routines || [];

        for (const ex of this.todayExercises) {
          let rid = (ex as any).__routineId;
          const rNameFromLog = (ex as any).__routineName;
          
          // Fallback: Group by name if ID is missing (e.g. from logs)
          if (!rid && rNameFromLog) {
            rid = 'name_ref:' + rNameFromLog;
          }

          if (!rid) continue;

          if (!routinesMap.has(rid)) {
            if (rid === 'quick-day') {
              routinesMap.set(rid, {
                id: 'quick-day',
                name: this.translationService.translate('quick.day_title'),
                description: this.translationService.translate('quick.day_desc'),
                exercises: [],
                frequency: 'custom',
                days: [],
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                programName: this.translationService.translate('quick.custom_program')
              } as any);
            } else if (rid.startsWith('name_ref:')) {
              // Synthetic routine from log name
              const name = rid.split('name_ref:')[1];
              routinesMap.set(rid, {
                id: rid,
                name: name,
                exercises: [],
                frequency: 'custom',
                days: [],
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
              } as any);
            } else {
              const original = allRoutines.find(r => r.id === rid);
              // Try to recover name if original not found
              let rName = original?.name;
              if (!rName) {
                 const sampleEx = this.todayExercises.find(e => (e as any).__routineId === rid);
                 if (sampleEx) {
                    // Try map first
                    rName = this.exerciseRoutineNameMap.get(sampleEx.exerciseId);
                    // Try the fetched name
                    if (!rName) rName = (sampleEx as any).__routineName;
                 }
              }

              routinesMap.set(rid, {
                ...(original || {
                  id: rid,
                  name: rName || this.translationService.translate('common.routine'),
                  frequency: 'custom',
                  days: [],
                  isActive: true,
                  createdAt: new Date(),
                  updatedAt: new Date()
                } as any),
                exercises: []
              });
            }
          }
          const r = routinesMap.get(rid);
          if (r && r.exercises) (r.exercises as RoutineExercise[]).push(ex);
        }

        if (routinesMap.size > 0) {
          if (!isPast) {
            const merged: Routine[] = [];
            for (const sr of (this.scheduledRoutinesToday || [])) {
              const fromSession = routinesMap.get(sr.id);
              if (fromSession) {
                merged.push({ ...sr, exercises: fromSession.exercises || [] } as any);
                routinesMap.delete(sr.id);
              } else {
                merged.push(sr);
              }
            }
            merged.push(...Array.from(routinesMap.values()));
            this.routinesToday = merged;
          } else {
            this.routinesToday = Array.from(routinesMap.values());
          }
        } else if (this.todayExercises.length > 0) {
          if (!isPast) {
            this.routinesToday = this.scheduledRoutinesToday;
          } else {
            // Fallback if no routine IDs found but exercises exist (past/legacy logs)
            this.routinesToday = [{
              id: 'unsorted',
              name: this.translationService.translate('common.completed'),
              exercises: this.todayExercises,
              frequency: 'custom',
              days: [],
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date()
            } as any];
          }
        } else {
          // Fallback to Scheduled or Quick Day if reconstruction completely failed?
          // If session exists but empty, maybe we should fall back?
          if (this.quickDayActive) {
             // restoreQuickDayState already set routinesToday correctly for Quick Day structure
             // So if session is empty/weird, we keep Quick Day structure?
             // But loadWorkoutSessionForDate overwrote todayExercises...
             // So we must trust restoreQuickDayState logic to have set it up initially.
             // If we are here, dayCompleted is true or exercises > 0.
          } else {
             this.routinesToday = this.scheduledRoutinesToday;
          }
        }

        this.totalExercisesToday = this.routinesToday.reduce((acc, r) => acc + ((r.exercises && r.exercises.length) || 0), 0);

        const map = new Map<string, string>();
        const pmap = new Map<string, string>();
        const idMap = new Map<string, string>();
        for (const r of this.routinesToday) {
          for (const ex of (r.exercises || [])) {
            if (ex.exerciseId) {
              map.set(ex.exerciseId, r.name);
              idMap.set(ex.exerciseId, r.id);
              if (r.programName) pmap.set(ex.exerciseId, r.programName);
            }
          }
        }
        this.exerciseRoutineNameMap = map;
        this.exerciseProgramNameMap = pmap;
        this.exerciseRoutineIdMap = idMap;
        this.updateVisibleTodayExercises();

        // Ensure consistency
        this.todayExercises = this.routinesToday.reduce((acc: RoutineExercise[], r: Routine) => acc.concat(r.exercises || []), [] as RoutineExercise[]);
        return;
    }

    // Fallback: Check logs if session missing (for past days)
    if (isPast && !this.dayCompleted) {
      const logs = this.store.getState().exerciseLogs || [];
      const todaysLogs = logs.filter(l => new Date(l.date).toDateString() === targetDate.toDateString());
      if (todaysLogs.length > 0) {
         // Reconstruct from logs... (Same logic as before, maybe extract?)
         // For brevity, assume session load handles most cases.
         // If logs exist but no session, dayCompleted is false.
         // We can set dayCompleted = true here and recurse?
         // Or just copy the logic.
      }
    }

    // If Quick Day Active (Priority 2 - Plan/Structure)
    if (this.quickDayActive) {
       // routinesToday and todayExercises are already set by restoreQuickDayState.
       // dayCompleted is false (otherwise we'd be in block above).
       // So we show the Quick Day plan (Legs) as uncompleted.
       this.updateVisibleTodayExercises();
       return;
    }

    // If Scheduled (Priority 3 - Default Plan)
    this.routinesToday = this.scheduledRoutinesToday;
    this.totalExercisesToday = this.routinesToday.reduce((acc, r) => acc + ((r.exercises && r.exercises.length) || 0), 0);
    this.todayExercises = this.routinesToday.reduce((acc: RoutineExercise[], r: Routine) => acc.concat(r.exercises || []), [] as RoutineExercise[]);
    const map = new Map<string, string>();
    const pmap = new Map<string, string>();
    const idMap = new Map<string, string>();
    for (const r of this.routinesToday) { for (const ex of (r.exercises || [])) { if (ex.exerciseId) { map.set(ex.exerciseId, r.name); idMap.set(ex.exerciseId, r.id); if (r.programName) pmap.set(ex.exerciseId, r.programName); } } }
    this.exerciseRoutineNameMap = map;
    this.exerciseProgramNameMap = pmap;
    this.exerciseRoutineIdMap = idMap;

    if (isPast || this.dayCompleted) {
         this.dayCompleted = false;
         this.durationSeconds = 0;
    }

    this.updateVisibleTodayExercises();
  }

  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  swipeTransform = '';
  swipeTransition = '';
  swipeOpacity = 1;
  swipeHintVisible = false;
  swipeHintDirection: 'left'|'right'|null = null;
  onTouchStart(ev: TouchEvent) {
    const t = ev.changedTouches && ev.changedTouches[0];
    if (!t) return;
    this.touchStartX = t.clientX;
    this.touchStartY = t.clientY;
    this.touchStartTime = Date.now();
    this.swipeTransition = '';
    this.swipeTransform = '';
    this.swipeOpacity = 1;
    this.swipeHintVisible = false;
    this.swipeHintDirection = null;
  }
  onTouchMove(ev: TouchEvent) {
    const t = ev.changedTouches && ev.changedTouches[0];
    if (!t) return;
    let dx = t.clientX - this.touchStartX;
    const dy = t.clientY - this.touchStartY;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        this.swipeTransform = '';
        this.swipeOpacity = 1;
        this.swipeHintVisible = false;
        this.swipeHintDirection = null;
        return;
      }
      dx = Math.max(-60, Math.min(60, dx));
      this.swipeTransform = `translateX(${dx}px)`;
      const fade = Math.min(0.12, Math.abs(dx) / 500);
      this.swipeOpacity = 1 - fade;
      this.swipeHintVisible = true;
      this.swipeHintDirection = 'right';
    } else {
      this.swipeTransform = '';
      this.swipeOpacity = 1;
      this.swipeHintVisible = false;
      this.swipeHintDirection = null;
    }
  }
  onTouchEnd(ev: TouchEvent) {
    const t = ev.changedTouches && ev.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - this.touchStartX;
    const dy = t.clientY - this.touchStartY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx >= 60 && adx > ady) {
      this.swipeTransition = 'transform 220ms ease, opacity 220ms ease';
      this.swipeTransform = 'translateX(0)';
      this.swipeOpacity = 1;
      this.swipeHintVisible = false;
      this.swipeHintDirection = null;
      if (dx < 0) { this.nextMonth(); } else { this.prevMonth(); }
      setTimeout(() => { this.swipeTransition = ''; this.swipeTransform = ''; }, 240);
    } else {
      this.swipeTransition = 'transform 220ms ease, opacity 220ms ease';
      this.swipeTransform = 'translateX(0)';
      this.swipeOpacity = 1;
      this.swipeHintVisible = false;
      this.swipeHintDirection = null;
      setTimeout(() => { this.swipeTransition = ''; this.swipeTransform = ''; }, 240);
    }
  }

  mockPrevDay() {
    this.utilService.simulateDayOffset(-1);
  }

  mockNextDay() {
    this.utilService.simulateDayOffset(1);
  }
}

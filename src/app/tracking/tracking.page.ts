import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ViewChildren, QueryList, ElementRef, ChangeDetectorRef, inject } from '@angular/core';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonSegment, IonSegmentButton, IonLabel, IonIcon, IonButton } from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular';
import { RoutineStatsModalComponent } from './routine-stats-modal/routine-stats-modal.component';
import { NotchHeaderComponent } from '../shared/notch-header/notch-header.component';
import { Observable, Subject, combineLatest, of } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import { StoreService } from '../services/store.service';
import { Router, NavigationEnd } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { ExerciseLog, Exercise } from '../models/exercise.model';
import { Routine } from '../models/routine.model';
import { UserWeightLog } from '../models/weight.model';
import { UtilService } from '../services/util.service';
import { Chart, registerables } from 'chart.js';
import { addIcons } from 'ionicons';
import { barbell, calendar, barChart, list, search, trendingUp, trendingDown, flash, close, chevronDown, informationCircle, layers, analyticsOutline } from 'ionicons/icons';
import { TranslatePipe } from '../pipes/translate.pipe';
import { SupabaseService } from '../services/supabase.service';
import { TranslationService } from '../services/translation.service';
import { detectMuscleGroup } from '../services/muscle-keywords';

Chart.register(...registerables);

@Component({
  selector: 'app-tracking',
  templateUrl: './tracking.page.html',
  styleUrls: ['../statistics/statistics.page.scss'],
  animations: [
    trigger('dropdownReveal', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translate3d(0, -10px, 0)' }),
        animate('300ms cubic-bezier(0.2, 0.8, 0.2, 1)', style({ opacity: 1, transform: 'translate3d(0, 0, 0)' }))
      ]),
      transition(':leave', [
        animate('220ms cubic-bezier(0.55, 0.085, 0.68, 0.53)', style({ opacity: 0, transform: 'translate3d(0, -10px, 0)' }))
      ])
    ]),
    trigger('overlayFade', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('240ms ease-out', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('220ms ease-in', style({ opacity: 0 }))
      ])
    ]),
    trigger('sectionEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px)' }),
        animate('400ms cubic-bezier(0.2, 0.8, 0.2, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0, transform: 'translateY(10px)' }))
      ])
    ]),
    trigger('gridEnter', [
      transition(':enter', [
        query('.metric-card, .chart-card, .glass-card', [
          style({ opacity: 0, transform: 'translateY(12px)' }),
          stagger(60, [
            animate('450ms cubic-bezier(0.2, 0.8, 0.2, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ])
    ,
    trigger('cardEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(12px) scale(0.96)' }),
        animate('420ms cubic-bezier(0.22, 1, 0.36, 1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
      ])
    ]),
    trigger('chartFade', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.96)' }),
        animate('420ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ])
  ],
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonSegment, IonSegmentButton, IonLabel, IonIcon, IonButton,
    NotchHeaderComponent,
    TranslatePipe
  ],
  providers: [ModalController],
})
export class TrackingPage implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();

  @ViewChild('progressChartCanvas') progressChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('volumeChartCanvas') volumeChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('frequencyChartCanvas') frequencyChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('muscleChartCanvas') muscleChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChildren('sparkCanvas') sparkCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChild('programSelect') programSelect!: any;

  private store = inject(StoreService);
  private utilService = inject(UtilService);
  private storage = inject(StorageService);
  private router = inject(Router);
  private translationService = inject(TranslationService);
  private modalController = inject(ModalController);
  private cdr = inject(ChangeDetectorRef);
  private supabase = inject(SupabaseService);
  private iconsInit = addIcons({ analyticsOutline,barbell, calendar, 'bar-chart': barChart, list, search, 'trending-up': trendingUp, 'trending-down': trendingDown, flash, close, chevronDown, 'information-circle': informationCircle, layers });
  private sparkCharts = new Map<string, Chart>();

  exercises$: Observable<Exercise[]> = this.store.select(state => state.exercises);
  routines$: Observable<Routine[]> = this.store.select(state => state.routines);
  programs$: Observable<any[]> = this.store.select(state => state.programs); // Added programs observable
  exerciseLogs$: Observable<ExerciseLog[]> = this.store.select(state => state.exerciseLogs);
  userWeightLogs$: Observable<UserWeightLog[]> = this.store.select(state => state.userWeightLogs);

  selectedTimeRange: 'week' | 'month' | '3months' | '6months' | 'year' | 'all' = 'month';

  // Program & Routine selection
  programs: string[] = [];
  selectedProgram: string = '';
  routinesForProgram: Routine[] = [];
  totalExercisesCount: number = 0;
  selectedRoutineId: string = '';
  programDropdownOpen = false;

  metricsModalOpen = false;

  // UI state
  selectChevronActive = false;

  // Metrics
  routineQuickStats: Record<string, { totalVolumeKg: number; totalReps: number; totalSets?: number; lastWorkout?: string }> = {};
  exerciseMetrics: Array<{ exerciseId: string; name: string; lastMaxKg: number; totalReps: number; avgVolumePerSetKg: number; totalVolumeKg: number; workoutsCount: number; avgVolumePerWorkoutKg: number; best1rmKg: number; allTimeBest1rmKg: number; allTimeWorkoutsCount: number; totalSets?: number; plannedSets?: number; plannedTotalReps?: number; plannedTotalVolumeKg?: number; allTimeTotalSets?: number; allTimeTotalReps?: number; allTimeTotalVolumeKg?: number; sparklineData?: number[] }> = [];
  muscleStats: Array<{ name: string; count: number; percent: number; color: string; displayName?: string }> = [];
  private muscleChart: Chart | null = null;
  private muscleChartRenderTimer: any = null;
  private muscleChartRenderSeq = 0;
  private muscleChartAnimatingUntil = 0;

  // Charts data (optional for future)
  progressData: { date: string; weight: number | null }[] = [];
  volumeData: { date: string; volume: number }[] = [];
  frequencyData: { day: string; count: number }[] = [];

  animateEnter = true; // Controls page entrance animation
  chartVisible = true; // Controls chart canvas existence

  ngOnInit() {
    this.translationService.lang$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.retranslateMuscleStats();
      });

    combineLatest([this.exercises$, this.exerciseLogs$, this.routines$, this.programs$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([exercises, logs, routines, programs]) => {
        // ... logs ...

        const activeSet = new Set<string>((programs || []).filter((p: any) => (p.isActive !== false)).map((p: any) => p.name));
        const visibleRoutines = (routines || []).filter(r => !r.programName || activeSet.has(r.programName));
        this.programs = Array.from(new Set(visibleRoutines.map(r => r.programName || 'Program'))).sort();

        // 1. If no programs exist at all, clear everything
        if (this.programs.length === 0) {
          this.selectedProgram = '';
          this.routinesForProgram = [];
          this.exerciseMetrics = [];
          this.selectedRoutineId = '';
          this.muscleStats = []; // Clear chart data
          this.scheduleMuscleChartRender('data', 0);
          this.cdr.detectChanges();
          return;
        }

        // 2. Reset selection if the current program is no longer valid
        if (this.selectedProgram && !this.programs.includes(this.selectedProgram)) {
           // If deleted, switch to the first available one, OR clear if user prefers empty state until selection
           // Usually switching to first available is better UX
           this.selectedProgram = this.programs[0];
           this.selectedRoutineId = ''; // Clear routine selection as it belonged to deleted program
        }

        // 3. Default selection if none
        if (!this.selectedProgram && this.programs.length > 0) {
           this.selectedProgram = this.programs[0];
        }

        this.updateRoutinesForProgram(visibleRoutines, programs);
        this.computeRoutineQuickStats(logs, visibleRoutines);

        // Re-compute metrics based on new selection
        if (this.selectedRoutineId) {
          // Verify routine still exists in the visible list
          const routineExists = visibleRoutines.some(r => r.id === this.selectedRoutineId);
          if (routineExists) {
             this.computeExerciseMetrics(exercises, logs, visibleRoutines);
          } else {
             this.selectedRoutineId = '';
             this.exerciseMetrics = [];
          }
        } else {
          this.exerciseMetrics = [];
        }

        this.computeMuscleDistribution();
        this.cdr.detectChanges();
        setTimeout(() => {
          this.renderExerciseSparklines();
        }, 0);
      });

    this.router.events
      .pipe(takeUntil(this.destroy$), filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((ev) => { if (ev.urlAfterRedirects.includes('tracking')) { this.cdr.detectChanges(); } });
  }

  ngAfterViewInit() {
    this.cdr.detectChanges();
  }

  async ionViewWillEnter() {
    this.animateEnter = false;
    this.chartVisible = false; // Destroy canvas
    if (this.muscleChartRenderTimer) { try { clearTimeout(this.muscleChartRenderTimer); } catch {} this.muscleChartRenderTimer = null; }
    if (this.muscleChart) {
      this.muscleChart.destroy();
      this.muscleChart = null;
    }
    this.cdr.detectChanges();

    setTimeout(() => {
      this.animateEnter = true;
      this.cdr.detectChanges();
      this.renderExerciseSparklines();

      // Re-create canvas and render chart
      // Small delay (50ms) to allow page fade-in to start, then create canvas
      setTimeout(() => {
        this.chartVisible = true;
        this.cdr.detectChanges();

        // Wait minimal time for DOM update (20ms is usually enough for *ngIf)
        setTimeout(() => {
           this.scheduleMuscleChartRender('enter', 0);
        }, 50);
      }, 50);
    }, 0);

    // Force refresh data...
    // This fixes issues where deleting a program/routine in another tab wasn't immediately reflected here
    try {
      await this.storage.refreshProgramsCache();
      const [progs, routines, logs, exercises] = await Promise.all([
          this.storage.getPrograms(),
          this.storage.getRoutines(),
          this.storage.getExerciseLogs(),
          this.storage.getExercises()
      ]);

      this.store.setState({
          programs: progs,
          routines: routines,
          exerciseLogs: logs,
          exercises: exercises
      });
    } catch (e) {
      console.error('[TrackingPage] Error refreshing data on enter:', e);
    }
  }
  async ionViewWillLeave() {
    this.chartVisible = false;
    if (this.muscleChartRenderTimer) { try { clearTimeout(this.muscleChartRenderTimer); } catch {} this.muscleChartRenderTimer = null; }
    if (this.muscleChart) {
      this.muscleChart.destroy();
      this.muscleChart = null;
    }
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    this.destroy$.next(); this.destroy$.complete();
    if (this.muscleChartRenderTimer) { try { clearTimeout(this.muscleChartRenderTimer); } catch {} this.muscleChartRenderTimer = null; }
    if (this.muscleChart) {
      this.muscleChart.destroy();
      this.muscleChart = null;
    }
    try { this.sparkCharts.forEach((c) => c.destroy()); this.sparkCharts.clear(); } catch {}
  }

  onTimeRangeChange(event: any) {
    this.selectedTimeRange = (event && event.detail) ? event.detail.value : event;
    const logs = this.store.getState().exerciseLogs;
    const routines = this.store.getState().routines;
    const exercises = this.store.getState().exercises;
    this.computeRoutineQuickStats(logs, routines);
    if (this.selectedRoutineId) {
      this.computeExerciseMetrics(exercises, logs, routines);
    }
    // No need to recompute muscle distribution as it is based on planned routines, not logs
    this.cdr.detectChanges();
    setTimeout(() => {
      this.renderExerciseSparklines();
      // Chart doesn't need re-render unless data changed
    }, 0);
  }

  onProgramChange(name: string) {
    this.selectedProgram = name;
    this.selectedRoutineId = '';
    this.exerciseMetrics = [];
    const routines = this.store.getState().routines;
    this.updateRoutinesForProgram(routines);
    if (!name) { this.routinesForProgram = []; }
    this.cdr.detectChanges();
  }

  toggleProgramDropdown() {
    this.programDropdownOpen = !this.programDropdownOpen;
    this.selectChevronActive = this.programDropdownOpen;
  }
  selectProgram(name: string) {
    this.selectedProgram = name;
    this.programDropdownOpen = false;
    this.onProgramChange(name);
  }

  onRoutineSelect(id: string) {
    this.selectedRoutineId = id;
    const exercises = this.store.getState().exercises;
    const logs = this.store.getState().exerciseLogs;
    const routines = this.store.getState().routines;
    this.computeExerciseMetrics(exercises, logs, routines);
    this.cdr.detectChanges();
    setTimeout(async () => {
      this.renderExerciseSparklines();
      const routine = (routines || []).find(r => r.id === id) || null;
      const modalMetrics = (this.exerciseMetrics || []).filter(m => (m.totalSets || 0) > 0 || (m.workoutsCount || 0) > 0 || (m.totalVolumeKg || 0) > 0);
      const modal = await this.modalController.create({
        component: RoutineStatsModalComponent,
        cssClass: 'routine-stats-modal-full',
        componentProps: {
          routine,
          programName: routine?.programName || this.selectedProgram,
          metrics: modalMetrics,
          timeRange: this.selectedTimeRange
        },
        showBackdrop: true,
        backdropDismiss: true
      });
      await modal.present();
    }, 0);
  }

  trackRoutineById(index: number, item: any): string {
    return item.id;
  }

  private updateRoutinesForProgram(routines: Routine[], programs?: any[]) {
    const progs = programs || this.store.getState().programs || [];
    const activeSet = new Set<string>(progs.filter((p: any) => (p.isActive !== false)).map((p: any) => p.name));
    const list = (routines || []).filter(r => (r.programName || 'Program') === this.selectedProgram && (!r.programName || activeSet.has(r.programName)));
    this.routinesForProgram = list;
    // Calculate total exercises across all visible routines
    const uniqueExercises = new Set<string>();
    list.forEach(r => (r.exercises || []).forEach(e => uniqueExercises.add(e.exerciseId)));
    this.totalExercisesCount = uniqueExercises.size;
  }

  private getDateRange() {
    return this.utilService.getDateRange(this.selectedTimeRange);
  }

  private computeLogVolumeKg(log: ExerciseLog): number {
    const setsArr = Array.isArray((log as any).sets) ? (log as any).sets : [];
    if (setsArr.length > 0) {
      return setsArr.reduce((acc: number, s: any) => {
        const w = this.utilService.convertWeight(s.weight || 0, (s.weightUnit as any) || 'kg', 'kg');
        return acc + (w * (s.reps || 0));
      }, 0);
    }
    return (log as any).totalVolume || 0;
  }

  private computeRoutineQuickStats(logs: ExerciseLog[], routines: Routine[]) {
    const range = this.getDateRange();
    const start = range.startDate;
    const end = range.endDate;
    const locale = this.translationService.getCurrentLang() === 'es' ? 'es-ES' : (this.translationService.getCurrentLang() === 'de' ? 'de-DE' : (this.translationService.getCurrentLang() === 'ko' ? 'ko-KR' : 'en-US'));
    const byRoutine: Record<string, ExerciseLog[]> = {};
    (routines || []).forEach(r => {
      const exerciseIds = new Set((r.exercises || []).map(e => e.exerciseId));
      const rlogs = (logs || []).filter(l => {
        // Enforce routineId match if available
        if (l.routineId && l.routineId !== r.id) return false;
        const d = new Date(l.date);
        return d >= start && d <= end && exerciseIds.has(l.exerciseId);
      });
      byRoutine[r.id] = rlogs;
    });
    const stats: Record<string, { totalVolumeKg: number; totalReps: number; totalSets: number; lastWorkout?: string }> = {};
    Object.entries(byRoutine).forEach(([rid, rlogs]) => {
      const totalVol = rlogs.reduce((acc, l) => acc + this.computeLogVolumeKg(l), 0);
      const totalReps = rlogs.reduce((acc, l) => acc + (Array.isArray((l as any).sets) ? (l as any).sets.reduce((a:number,s:any)=> a + (s.reps||0),0) : 0), 0);
      const totalSets = rlogs.reduce((acc, l) => acc + (Array.isArray((l as any).sets) ? (l as any).sets.length : 0), 0);
      const last = rlogs.length ? rlogs.slice().sort((a,b)=> new Date(a.date).getTime() - new Date(b.date).getTime()).pop()! : null;
      stats[rid] = {
        totalVolumeKg: Math.round(totalVol),
        totalReps,
        totalSets,
        lastWorkout: last ? new Date(last.date).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : undefined
      };
    });
    this.routineQuickStats = stats;
  }

  private computeExerciseMetrics(exercises: Exercise[], logs: ExerciseLog[], routines: Routine[]) {
    const range = this.getDateRange();
    const start = range.startDate;
    const end = range.endDate;
    const routine = (routines || []).find(r => r.id === this.selectedRoutineId);
    const metrics: Array<{ exerciseId: string; name: string; lastMaxKg: number; totalReps: number; avgVolumePerSetKg: number; totalVolumeKg: number; workoutsCount: number; avgVolumePerWorkoutKg: number; best1rmKg: number; allTimeBest1rmKg: number; allTimeWorkoutsCount: number; totalSets: number; plannedSets: number; plannedTotalReps: number; plannedTotalVolumeKg: number; allTimeTotalSets: number; allTimeTotalReps: number; allTimeTotalVolumeKg: number; sparklineData?: number[]; plannedWeightKg?: number }> = [];
    const routineExercises = (routine?.exercises || []).slice().sort((a,b) => (a.order || 0) - (b.order || 0));

    routineExercises.forEach((routineExercise, idx) => {
      const eid = routineExercise.exerciseId;

      // Fix: Prioritize routine exercise name to match the routine view context (e.g. showing "90 rows" instead of "Tricep pushdown" if IDs overlap)
      const realExercise = exercises.find(e => e.id === eid);
      const exName = routineExercise?.exerciseName || realExercise?.name || 'Unknown Exercise';

      const plannedSets = routineExercise?.targetSets || 0;
      const plannedReps = routineExercise?.targetReps || 0;

      // Attempt to get weight from the first set if available (as RoutineModal stores it there)
      const setsRaw = (routineExercise as any).sets;
      let plannedWeightKg = 0;

      if (Array.isArray(setsRaw) && setsRaw.length > 0) {
        const firstSet = setsRaw[0];
        const w = Number(firstSet.weight) || 0;
        const u = firstSet.unit || routineExercise?.weightUnit || 'kg';
        plannedWeightKg = this.utilService.convertWeight(w, u, 'kg');
      } else {
        const plannedWeight = routineExercise?.weight || 0;
        plannedWeightKg = this.utilService.convertWeight(plannedWeight, routineExercise?.weightUnit || 'kg', 'kg');
      }

      // Force correct assignment if logs are empty/mismatched but we have a planned weight
      // The issue is likely that 'lastMaxKg' comes from 'elogs' which might be empty or wrong,
      // creating a fallback chain that might be confusing.
      // But the user logs show:
      // Ex 1 (sdjfax1): Planned 300kg.
      // Ex 2 (asdasd2): Planned 75kg.
      // But UI shows: Ex 1 -> 75kg, Ex 2 -> 300kg.
      // This implies the metrics array is pushed in reverse order OR the template is rendering wrong.
      // We already fixed the sort order.
      // Wait, if I look at the screenshot provided previously (User Input),
      // Ex 1 (sdjfax1) shows 75kg (incorrect, should be 300).
      // Ex 2 (asdasd2) shows 300kg (incorrect, should be 75).
      // It is a SWAP.

      // LOG REQUESTED BY USER
      // console.log(`[DEBUG] Exercise: ${exName}, Planned Weight: ${plannedWeightKg}kg`);

      const plannedTotalReps = plannedSets * plannedReps;

      // Standard Volume: Sets * Reps * Weight
      const plannedTotalVolumeKg = Math.round(plannedSets * plannedReps * plannedWeightKg);

      const elogs = (logs || []).filter(l => {
        if (l.exerciseId !== eid) return false;
        // Filter by routineId if available to avoid pollution from other routines sharing the same exerciseId
        if (l.routineId && this.selectedRoutineId && l.routineId !== this.selectedRoutineId) return false;

        const d = new Date(l.date);
        return d >= start && d <= end;
      });

      const setsAll = elogs.reduce<any[]>((arr, l) => {
        const s = Array.isArray((l as any).sets) ? (l as any).sets : [];
        return arr.concat(s);
      }, []);
      const totalSets = setsAll.length;
      const maxSetWeightKg = setsAll.length ? Math.max(...setsAll.map((s: any) => {
        const w = this.utilService.convertWeight(s.weight || 0, (s.weightUnit as any) || 'kg', 'kg');
        return w || 0;
      }), 0) : 0;
      const lastMaxKg = maxSetWeightKg;
      const totalReps = setsAll.reduce((acc: number, s: any) => acc + (s.reps || 0), 0);
      const vols = setsAll.map((s: any) => {
        const wkg = this.utilService.convertWeight(s.weight || 0, (s.weightUnit as any) || 'kg', 'kg');
        return wkg * (s.reps || 0);
      });
      const avgVol = vols.length ? Math.round((vols.reduce((a: number, b: number)=> a + b, 0) / vols.length) * 10) / 10 : 0;
      const totalVol = Math.round(vols.reduce((a: number, b: number)=> a + b, 0));
      const workoutsCount = elogs.length;
      const avgVolPerWorkout = workoutsCount ? Math.round((totalVol / workoutsCount) * 10) / 10 : 0;
      const best1rm = setsAll.length ? Math.max(...setsAll.map((s: any) => {
        const wkg = this.utilService.convertWeight(s.weight || 0, (s.weightUnit as any) || 'kg', 'kg');
        const reps = s.reps || 0;
        return Math.round((wkg * (1 + reps / 30)) * 10) / 10;
      }), 0) : 0;
      const allLogs = (logs || []).filter(l => l.exerciseId === eid);
      const allSets = allLogs.reduce<any[]>((arr, l: ExerciseLog) => {
        const s = Array.isArray((l as any).sets) ? (l as any).sets : [];
        return arr.concat(s);
      }, []);
      const allBest1rm = allSets.length ? Math.max(...allSets.map((s: any) => {
        const wkg = this.utilService.convertWeight(s.weight || 0, (s.weightUnit as any) || 'kg', 'kg');
        const reps = s.reps || 0;
        return Math.round((wkg * (1 + reps / 30)) * 10) / 10;
      }), 0) : 0;
      const allWorkoutsCount = allLogs.length;
      const allTimeTotalSets = allSets.length;

      const allTimeTotalReps = allSets.reduce((acc: number, s: any) => acc + (s.reps || 0), 0);
      const allVols = allSets.map((s: any) => {
        const wkg = this.utilService.convertWeight(s.weight || 0, (s.weightUnit as any) || 'kg', 'kg');
        return wkg * (s.reps || 0);
      });
      const allTimeTotalVolumeKg = Math.round(allVols.reduce((a: number, b: number)=> a + b, 0));

      // Compute sparkline data (1RM Trend) for the modal
      const sparkLogs = allLogs.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-24);
      const sparklineData = sparkLogs.map(l => {
         const sets = Array.isArray((l as any).sets) ? (l as any).sets : [];
         if (!sets.length) return 0;
         return Math.max(...sets.map((s: any) => {
           const w = this.utilService.convertWeight(s.weight || 0, (s.weightUnit as any) || 'kg', 'kg');
           const reps = s.reps || 0;
           return Math.round((w * (1 + reps / 30)) * 10) / 10;
         }));
      });

      metrics.push({
        exerciseId: eid,
        name: exName,
        lastMaxKg,
        totalReps,
        avgVolumePerSetKg: avgVol,
        totalVolumeKg: totalVol,
        workoutsCount,
        avgVolumePerWorkoutKg: avgVolPerWorkout,
        best1rmKg: best1rm,
        allTimeBest1rmKg: allBest1rm,
        allTimeWorkoutsCount: allWorkoutsCount,
        totalSets,
        plannedSets,
        plannedTotalReps,
        plannedTotalVolumeKg,
        allTimeTotalSets,
        allTimeTotalReps,
        allTimeTotalVolumeKg,
        sparklineData,
        plannedWeightKg
      });
    });
    this.exerciseMetrics = metrics;
    setTimeout(() => this.renderExerciseSparklines(), 0);
  }

  private computeMuscleDistribution() {
    // We calculate distribution based on ALL ACTIVE ROUTINES/PROGRAMS visible to the user (Global Scope).
    // This ensures the chart shows a holistic view of the user's training, regardless of the selected program filter.

    const routines = this.store.getState().routines || [];
    const programs = this.store.getState().programs || [];
    const activeSet = new Set<string>(programs.filter((p: any) => (p.isActive !== false)).map((p: any) => p.name));

    const relevantRoutines = routines.filter(r => !r.programName || activeSet.has(r.programName));

    const distribution: Record<string, number> = {};
    const exercises = this.store.getState().exercises;

    const inferFromRoutineName = (routineName: string): string | null => {
        const s = String(routineName || '').toLowerCase();
        if (!s) return null;
        if (s.includes('leg') || s.includes('legs') || s.includes('pierna') || s.includes('piernas') || s.includes('lower') || s.includes('tren inferior') || s.includes('beine') || s.includes('하체')) return 'legs';
        if (s.includes('back') || s.includes('pull') || s.includes('espalda') || s.includes('dorsal') || s.includes('rücken') || s.includes('ruecken') || s.includes('등')) return 'back';
        if (s.includes('chest') || s.includes('push') || s.includes('pecho') || s.includes('brust') || s.includes('가슴')) return 'chest';
        if (s.includes('shoulder') || s.includes('hombro') || s.includes('schulter') || s.includes('어깨')) return 'shoulders';
        if (s.includes('arm') || s.includes('arms') || s.includes('brazo') || s.includes('brazos') || s.includes('arme') || s.includes('팔')) return 'arms';
        return null;
    };

    // Helper to find muscle group from ID or Name
    const normalize = (raw: any): string => {
        const s0 = String(raw || '').toLowerCase().trim();
        if (!s0) return 'unknown';
        const s = s0.replace(/[_-]+/g, ' ');

        if (
          s === 'unknown' || s === 'unkown' || s === 'n/a' ||
          s === 'full_body' || s === 'full body' || s === 'fullbody' ||
          s === 'cardio' || s === 'conditioning' || s === 'other'
        ) return 'unknown';

        if (s === 'chest' || s === 'pec' || s === 'pecs' || s.includes('pectoral') || s.includes('pecho') || s.includes('brust')) return 'chest';
        if (s === 'back' || s.includes('lat') || s.includes('lats') || s.includes('dorsal') || s.includes('espalda') || s.includes('rücken') || s.includes('ruecken') || s.includes('trap') || s.includes('trapezi')) return 'back';
        if (s === 'legs' || s === 'leg' || s.includes('quad') || s.includes('ham') || s.includes('glute') || s.includes('calf') || s.includes('pierna') || s.includes('piern') || s.includes('lower body') || s.includes('unterkörper') || s.includes('unterkoerper')) return 'legs';
        if (s === 'shoulders' || s === 'shoulder' || s.includes('delt') || s.includes('hombro') || s.includes('schulter') || s.includes('어깨')) return 'shoulders';
        if (s === 'arms' || s === 'arm' || s.includes('bicep') || s.includes('biceps') || s.includes('tricep') || s.includes('triceps') || s.includes('brazo') || s.includes('brazos') || s.includes('forearm') || s.includes('antebrazo')) return 'arms';
        if (s === 'core' || s.includes('abs') || s.includes('abdominal') || s.includes('abdomen') || s.includes('core') || s.includes('복근') || s.includes('bauch')) return 'core';

        return 'unknown';
    };

    const getMuscle = (exId: string, exName: string, routineName: string): string => {
        // 1. Try DB lookup
        const dbEx = exercises.find(e => e.id === exId);
        const raw = dbEx?.muscleGroup || (dbEx as any)?.muscle_group || '';
        const base = normalize(raw);
        if (base !== 'unknown') return base;

        const detected = detectMuscleGroup(exName || dbEx?.name || '');
        if (detected !== 'unknown') return detected;

        const byRoutine = inferFromRoutineName(routineName);
        if (byRoutine) return byRoutine;

        // Final fallback: never return unknown (user request). Prefer back as generic default.
        return 'back';
    };

    const allowed = new Set<string>(['chest', 'back', 'legs', 'shoulders', 'arms']);

    relevantRoutines.forEach(routine => {
        (routine.exercises || []).forEach(ex => {
            const muscle = getMuscle(ex.exerciseId, ex.exerciseName, (routine as any)?.name || '');

            // Skip Core as requested
            if (muscle === 'core') return;

            // Count sets (default to 1 if 0)
            const sets = Number(ex.targetSets) || 1;

            // Multiply by routine frequency if we are looking at Program level?
            // For now, simple set count accumulation is cleaner for "Distribution"
            const key = allowed.has(muscle) ? muscle : 'back';
            distribution[key] = (distribution[key] || 0) + sets;
        });
    });


    // Convert to array for UI
    try { delete (distribution as any).unknown; delete (distribution as any).unkown; } catch {}
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    this.muscleStats = Object.entries(distribution)
      .map(([name, count]) => {
        const translated = this.translationService.translate(`muscles.${name}`);
        const displayName = (translated && translated !== `muscles.${name}`)
          ? translated
          : name.charAt(0).toUpperCase() + name.slice(1).replace('_', ' ');

        return {
          name,
          count,
          percent: total > 0 ? Math.round((count / total) * 100) : 0,
          color: this.getMuscleColor(name),
          displayName
        };
      })
      .sort((a, b) => {
        // Otherwise sort by count descending
        return b.count - a.count;
      });

    // Ensure view is updated before rendering chart
    this.cdr.detectChanges();
    this.scheduleMuscleChartRender('data', 0);
  }

  private retranslateMuscleStats() {
    if (!this.muscleStats || this.muscleStats.length === 0) return;

    this.muscleStats = this.muscleStats.map(s => {
      const translated = this.translationService.translate(`muscles.${s.name}`);
      const displayName = (translated && translated !== `muscles.${s.name}`)
        ? translated
        : s.name.charAt(0).toUpperCase() + s.name.slice(1).replace('_', ' ');
      return { ...s, displayName };
    });

    this.cdr.detectChanges();
    this.scheduleMuscleChartRender('data', 0);
  }

  private scheduleMuscleChartRender(reason: 'enter'|'data', delayMs: number) {
    if (reason === 'data' && !this.chartVisible) return;
    const now = Date.now();
    let delay = Math.max(0, Math.round(delayMs || 0));
    if (reason !== 'enter' && this.muscleChartAnimatingUntil && now < this.muscleChartAnimatingUntil) {
      delay = Math.max(delay, (this.muscleChartAnimatingUntil - now) + 40);
    }
    this.muscleChartRenderSeq += 1;
    const seq = this.muscleChartRenderSeq;
    if (this.muscleChartRenderTimer) { try { clearTimeout(this.muscleChartRenderTimer); } catch {} }
    this.muscleChartRenderTimer = setTimeout(() => {
      if (seq !== this.muscleChartRenderSeq) return;
      this.muscleChartRenderTimer = null;
      this.renderMuscleChart(reason === 'enter');
    }, delay);
  }

  private renderMuscleChart(forceRecreate: boolean = false) {
    try {
      if (!this.muscleChartCanvas) {
        // console.warn('Muscle chart canvas not found');
        return;
      }

      const ctx = this.muscleChartCanvas.nativeElement.getContext('2d');
      if (!ctx) {
        return;
      }

      // Convert hex color to RGBA for transparency
      const hexToRgba = (hex: string, alpha: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      };

      const labels = this.muscleStats.map(s => s.displayName || s.name);
      const data = this.muscleStats.map(s => s.count);
      const bgColors = this.muscleStats.map(s => hexToRgba(s.color, 0.65));
      const borderColors = this.muscleStats.map(s => s.color);

      if (this.muscleChart && !forceRecreate) {
        if (data.length === 0) {
          this.muscleChart.data.labels = [this.translationService.translate('tracking.no_data')];
          this.muscleChart.data.datasets[0].data = [1];
          this.muscleChart.data.datasets[0].backgroundColor = ['rgba(75, 85, 99, 0.2)'];
          this.muscleChart.data.datasets[0].borderColor = ['#4b5563'];
        } else {
          this.muscleChart.data.labels = labels;
          this.muscleChart.data.datasets[0].data = data;
          this.muscleChart.data.datasets[0].backgroundColor = bgColors as any;
          this.muscleChart.data.datasets[0].borderColor = borderColors as any;
        }
        this.muscleChart.update();
        return;
      }

      if (this.muscleChart) {
        this.muscleChart.destroy();
        this.muscleChart = null;
      }

      if (data.length === 0) {
        const isLight = document.documentElement.classList.contains('theme-light');
        this.muscleChart = new Chart(ctx, {
          type: 'polarArea',
          data: {
            labels: [this.translationService.translate('tracking.no_data')],
            datasets: [{
              data: [1],
              backgroundColor: [isLight ? 'rgba(17, 24, 39, 0.08)' : 'rgba(75, 85, 99, 0.2)'],
              borderColor: [isLight ? 'rgba(17, 24, 39, 0.18)' : '#4b5563'],
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              r: { display: false }
            },
            plugins: { legend: { display: false } }
          }
        });
        return;
      }

      const isLight = document.documentElement.classList.contains('theme-light');
      this.muscleChart = new Chart(ctx, {
        type: 'polarArea',
        data: {
          labels: labels,
          datasets: [{
            data: data.map(() => 0),
            backgroundColor: bgColors.map((_c, i) => hexToRgba(this.muscleStats[i]?.color || '#4b5563', 0)),
            borderColor: borderColors.map((c) => hexToRgba(c, 0)),
            borderWidth: 1.5,
          }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              animateRotate: false,
              animateScale: true,
              duration: 950,
              easing: 'easeOutQuart',
              delay: (ctx: any) => (ctx?.type === 'data' ? (Number(ctx.dataIndex || 0) * 120) : 0)
            },
            animations: {
              colors: {
                type: 'color',
                duration: 950,
                easing: 'easeOutQuart',
                delay: (ctx: any) => (ctx?.type === 'data' ? (Number(ctx.dataIndex || 0) * 120) : 0)
              }
            },
            scales: {
              r: {
                ticks: { display: false, backdropColor: 'transparent' },
              grid: {
                color: isLight ? 'rgba(17, 24, 39, 0.08)' : 'rgba(255, 255, 255, 0.05)',
                lineWidth: 1
              },
              angleLines: {
                color: isLight ? 'rgba(17, 24, 39, 0.08)' : 'rgba(255, 255, 255, 0.05)'
              },
              pointLabels: {
                display: false
              }
            }
          },
          plugins: {
            legend: {
              display: false // We use custom HTML legend now
            },
            tooltip: {
              enabled: true,
              backgroundColor: isLight ? '#ffffff' : '#000000',
              titleColor: isLight ? '#0b0b0c' : '#ffffff',
              bodyColor: isLight ? '#374151' : '#e5e7eb',
              padding: 12,
              cornerRadius: 8,
              borderColor: isLight ? 'rgba(17,24,39,0.12)' : 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              titleFont: { size: 13, weight: 'bold', family: 'Inter' },
              displayColors: true,
              callbacks: {
                label: (item) => {
                  const val = item.raw as number;
                  const total = data.reduce((a, b) => a + b, 0);
                  const pct = Math.round((val / total) * 100);
                  return ` ${item.label}: ${pct}% (${val} sets)`;
                }
              }
            }
          },
          layout: {
            padding: 10
          }
        }
      });

      setTimeout(() => {
        try {
          const chart = this.muscleChart;
          if (!chart) return;
          chart.data.labels = labels;
          chart.data.datasets[0].data = data;
          chart.data.datasets[0].backgroundColor = bgColors as any;
          chart.data.datasets[0].borderColor = borderColors as any;
          chart.update();
        } catch {}
      }, 40);

      const totalAnimMs = (Math.max(0, data.length - 1) * 120) + 950 + 200;
      this.muscleChartAnimatingUntil = Date.now() + totalAnimMs;
    } catch (e) {
      console.error('Error rendering muscle chart:', e);
    }
  }

  private getMuscleColor(muscle: string): string {
    switch (muscle) {
      case 'chest': return '#ef4444'; // Red-500
      case 'back': return '#3b82f6'; // Blue-500
      case 'legs': return '#10b981'; // Emerald-500
      case 'shoulders': return '#f59e0b'; // Amber-500
      case 'arms': return '#8b5cf6'; // Violet-500
      case 'core': return '#ec4899'; // Pink-500
      case 'unknown': return '#6b7280'; // Gray-500
      default: return '#4b5563'; // Gray-600
    }
  }

  private renderExerciseSparklines() {
    try {
      if (!this.sparkCanvases || this.sparkCanvases.length === 0) return;
      const logs = this.store.getState().exerciseLogs;
      const range = this.getDateRange();
      const start = range.startDate;
      const end = range.endDate;
      const lang = this.translationService.getCurrentLang() === 'es' ? 'es-ES' : 'en-US';
      const byId = new Map<string, HTMLCanvasElement>();
      this.sparkCanvases.forEach(ref => {
        const el = ref.nativeElement;
        const id = el.getAttribute('data-exercise-id') || '';
        if (id) byId.set(id, el);
      });
      this.exerciseMetrics.forEach(m => {
        const canvas = byId.get(m.exerciseId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let elogs = (logs || []).filter(l => l.exerciseId === m.exerciseId && new Date(l.date) >= start && new Date(l.date) <= end)
          .sort((a,b)=> new Date(a.date).getTime() - new Date(b.date).getTime());
        const maxPoints = 24;
        if (elogs.length > maxPoints) elogs = elogs.slice(-maxPoints);
        const labels = elogs.map(l => new Date(l.date).toLocaleDateString(lang, { month: 'short', day: 'numeric' }));
        const data = elogs.map(l => {
          const sets = Array.isArray((l as any).sets) ? (l as any).sets : [];
          const best = sets.length ? Math.max(...sets.map((s: any) => {
            const wkg = this.utilService.convertWeight(s.weight || 0, (s.weightUnit as any) || 'kg', 'kg');
            const reps = s.reps || 0;
            return Math.round((wkg * (1 + reps / 30)) * 10) / 10;
          }), 0) : 0;
          return best;
        });
        const prev = this.sparkCharts.get(m.exerciseId);
        if (prev) { try { prev.destroy(); } catch {} }
        const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
        grad.addColorStop(0, '#DC2626');
        grad.addColorStop(1, 'rgba(220,38,38,0.45)');
        const chart = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              data,
              borderColor: grad,
              backgroundColor: 'transparent',
              borderWidth: 1.2,
              pointRadius: 0,
              tension: 0.2,
              fill: false
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 160 },
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            layout: { padding: 0 },
            scales: {
              x: { display: false, grid: { display: false }, ticks: { display: false } },
              y: { display: false, grid: { display: false }, ticks: { display: false } }
            },
            elements: { line: { capBezierPoints: true } }
          }
        });
        this.sparkCharts.set(m.exerciseId, chart);
      });
    } catch {}
  }

  async generateDebugData() {
    const exercises = this.store.getState().exercises;
    if (exercises.length === 0) {
      alert('No exercises found to generate data from!');
      return;
    }

    const logs: ExerciseLog[] = exercises.map((ex, i) => ({
      id: `debug_${Date.now()}_${i}`,
      exerciseId: ex.id,
      date: new Date(),
      sets: [
        { reps: 10, weight: 100, weightUnit: 'lb', isPersonalRecord: false },
        { reps: 10, weight: 100, weightUnit: 'lb', isPersonalRecord: false }
      ],
      totalVolume: 2000,
      maxWeight: 100,
      notes: 'Debug log',
      createdAt: new Date()
    }));

    await this.storage.logExercisesBulk(logs);

    // Update store immediately
    logs.forEach(l => this.store.addExerciseLog(l));

    alert(`Generated ${logs.length} test logs! The chart should update.`);
    this.cdr.detectChanges();
  }
}

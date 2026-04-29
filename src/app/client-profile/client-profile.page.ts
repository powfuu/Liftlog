import { Clipboard } from '@capacitor/clipboard';
import { Component, OnInit, inject, AfterViewInit, ViewChild, ElementRef, OnDestroy, NgZone, ChangeDetectorRef, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ModalController, GestureController, ToastController } from '@ionic/angular';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { TranslationService } from '../services/translation.service';
import { detectMuscleGroup } from '../services/muscle-keywords';
import { ActivatedRoute, Router } from '@angular/router';
import { CoachService, CoachClient } from '../services/coach.service';
import { SupabaseService } from '../services/supabase.service';
import { LoaderService } from '../services/loader.service';
import { UtilService } from '../services/util.service';
import { SwipeHintService } from '../services/swipe-hint.service';
import { RoutineStatsModalComponent } from '../tracking/routine-stats-modal/routine-stats-modal.component';
import { addIcons } from 'ionicons';
import { arrowBack, person, barbell, scale, trendingUp, create, trash, save, close, calendar, add, trophy, timeOutline, addCircleOutline, calendarOutline, createOutline, trashOutline, informationCircleOutline, saveOutline, closeOutline, trendingUpOutline, scaleOutline, barbellOutline, chevronBack, chevronDown, list, checkmarkCircle, trendingDown, removeOutline, time, chevronForward, calendarNumberOutline, copyOutline, accessibilityOutline, walkOutline, body, statsChart, analytics, footsteps, addCircle, barChart, layers, search, flash, refresh, analyticsOutline } from 'ionicons/icons';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Chart, registerables } from 'chart.js';
import { RoutineModalComponent } from '../routines/routine-modal/routine-modal.component';
import { NotchHeaderComponent } from '../shared/notch-header/notch-header.component';
import { TranslatePipe } from '../pipes/translate.pipe';
import { LocaleDatePipe } from '../pipes/locale-date.pipe';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Subscription } from 'rxjs';

interface ClientProgram {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: Date;
  duration?: string;
  code?: string;
}

interface ClientWeight {
  id: string;
  weight: number;
  unit: 'kg' | 'lb';
  date: Date;
}

interface ClientProgress {
  totalWorkouts: number;
  currentWeight: number;
  weightUnit: 'kg' | 'lb';
  lastWorkout: Date;
}

@Component({
  selector: 'app-client-profile',
  templateUrl: './client-profile.page.html',
  styleUrls: ['./client-profile.page.scss', '../statistics/statistics.page.scss'],
  standalone: true,
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
    ]),
    trigger('cardEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(12px) scale(0.96)' }),
        animate('420ms cubic-bezier(0.22, 1, 0.36, 1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
      ])
    ])
  ],
  imports: [CommonModule, FormsModule, IonicModule, TranslatePipe, LocaleDatePipe, NotchHeaderComponent, RoutineModalComponent, RoutineStatsModalComponent, DragDropModule]
})
export class ClientProfilePage implements OnInit, AfterViewInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private coachService = inject(CoachService);
  private supabaseService = inject(SupabaseService);
  private alertController = inject(AlertController);
  private modalController = inject(ModalController);
  private toastController = inject(ToastController);
  private translationService = inject(TranslationService);
  private loaderService = inject(LoaderService);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private utilService = inject(UtilService);
  private swipeHintService = inject(SwipeHintService);
  private gestureCtrl = inject(GestureController);
  private el = inject(ElementRef);
  private gesture: any;

  client: CoachClient | null = null;
  activeTab: 'home' | 'programs' | 'weight' | 'tracking' = 'home';
  loading = true;

  programs: ClientProgram[] = [];
  routines: Array<{ id: string; name: string; description: string; days: string[]; exercises: any[]; programId?: string; programName?: string; code?: string; order_index?: number; createdAt?: Date }> = [];
  programRoutinesMap = new Map<string, any[]>();
  weightHistory: ClientWeight[] = [];
  currentWeight: ClientWeight | null = null;
  progress: ClientProgress | null = null;
  today: Date = new Date();
  @ViewChild('clientWeightChart') clientWeightChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('datePopover') datePopover: any;
  private chart: Chart | null = null;
  routinesToday: Array<{ id: string; name: string; exercises: any[]; finished: boolean; description?: string; days?: string[]; programName?: string }> = [];
  trainedToday = false;
  trainedDates: Set<string> = new Set();

  // Calendar Props
  calendarBase = new Date();
  calendarMonthLabel = '';
  calendarYear = new Date().getFullYear();
  weekdayLabels: string[] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  calendarDays: Date[] = [];
  shouldAnimateDays = false;
  selectedDateUS = '';
  isSelectedToday = true;
  swipeTransform = '';
  swipeTransition = '';
  swipeOpacity = 1;
  swipeHintVisible = false;
  swipeHintDirection: 'left'|'right'|null = null;
  private touchStartX = 0;
  private touchStartY = 0;

  editingMode = false;
  editingProgram: ClientProgram | null = null;
  newWeightValue: number = 0;
  newWeightUnit: 'kg' | 'lb' = 'kg';
  selectedUnit: 'kg' | 'lb' = 'kg';
  weightChange: number = 0;

  // Preview Modal Props
  showPreview = false;
  previewRoutine: any | null = null;
  previewExpandedIds = new Set<string>();
  previewExercises: any[] = [];
  expandedProgramDescs = new Set<string>();

  // Tracking Props
  clientExercises: any[] = [];
  trackingLogs: any[] = [];
  trackingPrograms: string[] = [];
  trackingSelectedProgram = '';
  trackingRoutinesForProgram: any[] = [];
  trackingTotalExercisesCount = 0;
  trackingTimeRange: any = 'month';
  trackingRoutineQuickStats: Record<string, any> = {};
  trackingSelectedRoutineId = '';
  trackingExerciseMetrics: any[] = [];
  trackingSparkCharts = new Map<string, any>();
  trackingProgramDropdownOpen = false;
  @ViewChildren('sparkCanvas') sparkCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;
  private muscleChartCanvasRef: ElementRef<HTMLCanvasElement> | null = null;
  @ViewChild('muscleChartCanvas')
  set muscleChartCanvas(v: ElementRef<HTMLCanvasElement> | null) {
    this.muscleChartCanvasRef = v;
    if (v && this.activeTab === 'tracking') {
      this.muscleChartEnterRetries = 0;
      this.scheduleMuscleChartRender('enter', 40);
    }
  }
  muscleStats: Array<{ name: string; count: number; percent: number; color: string; displayName?: string }> = [];
  private muscleChart: Chart | null = null;
  private muscleChartRenderTimer: any = null;
  private muscleChartRenderSeq = 0;
  private muscleChartAnimatingUntil = 0;
  private muscleChartEnterRetries = 0;
  private langSub: Subscription | null = null;

  private channel: RealtimeChannel | null = null;
  private updateTimeout: any;

  constructor() {
    addIcons({
      arrowBack, person, barbell, scale, trendingUp, create, trash, save, close, calendar, add, trophy,
      timeOutline, addCircleOutline, calendarOutline, createOutline, trashOutline, informationCircleOutline,
      saveOutline, closeOutline, trendingUpOutline, scaleOutline, barbellOutline, chevronBack, chevronDown,
      list, checkmarkCircle, trendingDown, removeOutline, time, chevronForward, calendarNumberOutline, copyOutline,
      accessibilityOutline, walkOutline, body, statsChart, analytics, footsteps, addCircle,
      'bar-chart': barChart, layers, search, flash, refresh, 'analytics-outline': analyticsOutline
    });
    Chart.register(...registerables);
  }

  expandedPrograms = new Set<string>();
  toggleProgram(id: string) {
    if (this.expandedPrograms.has(id)) this.expandedPrograms.delete(id); else this.expandedPrograms.add(id);
  }
  isProgramExpanded(id: string) { return this.expandedPrograms.has(id); }

  private invalidateClientCache(clientId: string) {
    this.supabaseService.invalidateMemo(`coach:programs:${clientId}`);
    this.supabaseService.invalidateMemo(`coach:routines:${clientId}`);
    this.supabaseService.invalidateMemo(`coach:weight:${clientId}`);
    this.supabaseService.invalidateMemo(`coach:logs:${clientId}`);
    this.supabaseService.invalidateMemo(`coach:logs_all:${clientId}`);
    this.supabaseService.invalidateMemo(`coach:exercises:${clientId}`);
  }

  ionViewWillEnter() {
    const clientId = this.route.snapshot.paramMap.get('id');
    if (clientId) {
      this.invalidateClientCache(clientId);
      this.loadClientData(clientId);
    }
  }

  ionViewDidEnter() {
    if (this.activeTab !== 'tracking') return;

    if (this.client && (!this.clientExercises?.length || !this.trackingLogs?.length)) {
      this.loadClientTrackingData(this.client.client_id);
      return;
    }

    this.muscleChartEnterRetries = 0;
    this.scheduleMuscleChartRender('enter', 40);
  }

  ionViewWillLeave() {
    if (this.muscleChartRenderTimer) { try { clearTimeout(this.muscleChartRenderTimer); } catch {} this.muscleChartRenderTimer = null; }
    if (this.muscleChart) { try { this.muscleChart.destroy(); } catch {} this.muscleChart = null; }
  }

  ngOnInit() {
    const clientId = this.route.snapshot.paramMap.get('id');
    if (!clientId) {
      this.router.navigate(['/tabs/coaching']);
      return;
    }

    this.langSub = this.translationService.lang$.subscribe(() => {
      this.retranslateMuscleStats();
    });

    // Calendar Init
    this.generateMonthDays();
    this.today = new Date();
    this.selectDate(this.today);

    this.setupRealtimeSubscription(clientId);
  }

  // --- Calendar Logic ---
  generateMonthDays() {
    const year = this.calendarBase.getFullYear();
    const month = this.calendarBase.getMonth();
    this.calendarYear = year;

    const monthName = this.calendarBase.toLocaleString('default', { month: 'long' });
    this.calendarMonthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startDay = firstDay.getDay();
    if (startDay === 0) startDay = 7;

    const days: Date[] = [];
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    for (let i = 1; i < startDay; i++) {
      days.push(new Date(year, month - 1, prevMonthLastDay - (startDay - 1 - i)));
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    const totalSlots = days.length > 35 ? 42 : 35;
    const remaining = totalSlots - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }

    this.calendarDays = days;
  }

  async fetchMonthLogs(clientId: string, date: Date) {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const dates = await this.coachService.getClientLogDates(clientId, startOfMonth, endOfMonth);
    dates.forEach(d => this.trainedDates.add(d));
  }

  prevMonth() {
    this.calendarBase.setMonth(this.calendarBase.getMonth() - 1);
    this.calendarBase = new Date(this.calendarBase);
    this.generateMonthDays();
    if (this.client) this.fetchMonthLogs(this.client.client_id, this.calendarBase);
    this.shouldAnimateDays = true;
    setTimeout(() => { this.shouldAnimateDays = false; }, 400);
  }

  nextMonth() {
    this.calendarBase.setMonth(this.calendarBase.getMonth() + 1);
    this.calendarBase = new Date(this.calendarBase);
    this.generateMonthDays();
    if (this.client) this.fetchMonthLogs(this.client.client_id, this.calendarBase);
    this.shouldAnimateDays = true;
    setTimeout(() => { this.shouldAnimateDays = false; }, 400);
  }

  selectDate(d: Date) {
    this.today = new Date(d);

    const now = new Date();
    this.isSelectedToday = (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );

    if (this.client) {
      this.filterRoutinesForDate();
    }

    if (this.datePopover) {
      this.datePopover.dismiss();
    }
  }

  async filterRoutinesForDate() {
    if (!this.client) return;
    // Removed loaderService to prevent UI flickering
    await this.updateTodayView();
  }

  trackRoutineById(index: number, item: any): string {
    return item.id;
  }

  isToday(d: Date): boolean {
    const now = new Date();
    return d.getDate() === now.getDate() &&
           d.getMonth() === now.getMonth() &&
           d.getFullYear() === now.getFullYear();
  }

  isSelected(d: Date): boolean {
    return d.getDate() === this.today.getDate() &&
           d.getMonth() === this.today.getMonth() &&
           d.getFullYear() === this.today.getFullYear();
  }

  isTrainedDay(d: Date): boolean {
    const dateStr = d.toISOString().split('T')[0];
    return this.trainedDates.has(dateStr);
  }

  isPastDay(d: Date): boolean {
    const now = new Date();
    now.setHours(0,0,0,0);
    return d < now;
  }

  isRestDay(d: Date): boolean {
    if (this.isPastDay(d)) return false;
    const dayName = d.toLocaleString('en-US', { weekday: 'long' });
    // In Client Profile, we check if any routine is assigned to this day name
    const hasPlan = (this.routines || []).some((r: any) => Array.isArray(r.days) && r.days.includes(dayName));
    return !hasPlan;
  }

  closeDatePicker() {
    if (this.datePopover) this.datePopover.dismiss();
  }

  onTouchStart(ev: TouchEvent) {
    const t = ev.changedTouches && ev.changedTouches[0];
    if (!t) return;
    this.touchStartX = t.clientX;
    this.touchStartY = t.clientY;
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

  ngAfterViewInit() {
    this.updateChart();

    this.gesture = this.gestureCtrl.create({
      el: this.el.nativeElement,
      gestureName: 'swipe-right-client',
      threshold: 5,
      direction: 'x',
      onMove: (ev) => {
        // Show hint when swiping right (deltaX > 0)
        if (ev.deltaX > 10) {
          this.swipeHintService.show('right');
        } else {
          this.swipeHintService.hide();
        }
      },
      onEnd: (ev) => {
        this.swipeHintService.hide();
        // Swipe Right -> Navigate back to Coaching list
        if (ev.deltaX > 60 && Math.abs(ev.deltaY) < 50) {
          this.zone.run(() => {
            this.router.navigate(['/tabs/coaching']);
          });
        }
      }
    });
    this.gesture.enable();
  }

  updateProgramRoutinesMap() {
    this.programRoutinesMap.clear();
    this.routines.forEach(r => {
      if (r.programId) {
        let list = this.programRoutinesMap.get(r.programId);
        if (!list) {
          list = [];
          this.programRoutinesMap.set(r.programId, list);
        }
        list.push(r);
      }
    });
    this.programRoutinesMap.forEach(list => {
      list.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    });
  }

  dropRoutine(event: CdkDragDrop<any[]>, programId: string) {
    const list = this.programRoutinesMap.get(programId);
    if (!list) return;
    moveItemInArray(list, event.previousIndex, event.currentIndex);

    const updates: { id: string; name: string; order_index: number }[] = [];
    list.forEach((r, i) => {
      r.order_index = i;
      updates.push({ id: r.id, name: r.name, order_index: i });
    });
    this.coachService.updateClientRoutineOrder(this.client!.client_id, updates);
    this.updateProgramRoutinesMap();
    this.updateTodayView();
  }

  getRoutinesByProgram(programId: string): any[] {
    return this.programRoutinesMap.get(programId) || [];
  }

  async loadClientData(clientId: string, silent = false) {
    if (!silent) this.loading = true;
    try {
      // Load client basic info from the coach service
      const clients = await this.coachService.getAssignedClients();
      this.client = clients.find(c => c.client_id === clientId) || null;

      if (!this.client) {
        this.router.navigate(['/tabs/coaching']);
        return;
      }

      // Load client programs
      this.programs = await this.coachService.getClientPrograms(clientId);

      // Load weight history
      const weightData = await this.coachService.getClientWeightHistory(clientId);
      this.weightHistory = weightData.map((w: any) => ({
        id: w.id,
        weight: w.weight,
        unit: w.unit,
        date: new Date(w.log_date)
      }));

      // Force recalculate and update
      if (this.weightHistory.length > 0) {
        this.currentWeight = this.weightHistory[0];
      } else {
        this.currentWeight = null;
      }
      this.computeWeightChange();
      this.updateChart();

      // Load progress data
      const exerciseLogs = await this.coachService.getClientExerciseLogs(clientId, 100);
      this.progress = {
        totalWorkouts: exerciseLogs.length,
        currentWeight: this.currentWeight?.weight || 0,
        weightUnit: this.currentWeight?.unit || 'kg',
        lastWorkout: exerciseLogs.length > 0 ? new Date(exerciseLogs[0].log_date) : new Date()
      };

      const routines = await this.coachService.getClientRoutines(clientId);
      this.routines = routines as any;
      this.updateProgramRoutinesMap();
      this.fetchMonthLogs(clientId, this.calendarBase);
      await this.updateTodayView();

    } catch (error) {
      console.error('Error loading client data:', error);
    } finally {
      this.loading = false;
      this.updateChart();
    }
  }

  async updateTodayView() {
    if (!this.client) return;
    const dayName = this.today.toLocaleDateString('en-US', { weekday: 'long' });

    // Map for Spanish days support
    const spanishDays: {[key: string]: string} = {
      'Monday': 'Lunes',
      'Tuesday': 'Martes',
      'Wednesday': 'Miércoles',
      'Thursday': 'Jueves',
      'Friday': 'Viernes',
      'Saturday': 'Sábado',
      'Sunday': 'Domingo'
    };
    const dayNameEs = spanishDays[dayName];

    // Fetch logs for the specific date to check completion status
    const routineIds = await this.coachService.getClientDailyLogs(this.client.client_id, this.today);
    const finishedRoutineIds = new Set(routineIds);

    this.routinesToday = this.routines
      .filter((r: any) => Array.isArray(r.days) && (r.days.includes(dayName) || (dayNameEs && r.days.includes(dayNameEs))))
      .map((r: any) => ({
        id: r.id,
        name: r.name,
        exercises: r.exercises || [],
        finished: finishedRoutineIds.has(r.id),
        description: r.description,
        programName: this.programs.find(p => p.id === r.programId)?.name
      }));

    this.trainedToday = this.routinesToday.some(r => r.finished);
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    if (this.channel) this.channel.unsubscribe();
    if (this.updateTimeout) clearTimeout(this.updateTimeout);
    if (this.langSub) { try { this.langSub.unsubscribe(); } catch {} this.langSub = null; }
    if (this.muscleChartRenderTimer) { try { clearTimeout(this.muscleChartRenderTimer); } catch {} this.muscleChartRenderTimer = null; }
    if (this.muscleChart) { try { this.muscleChart.destroy(); } catch {} this.muscleChart = null; }
  }

  private setupRealtimeSubscription(clientId: string) {
    if (this.channel) return;
    const supabase = this.supabaseService.getClient();
    this.channel = supabase.channel(`coach-view-${clientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'programs', filter: `user_id=eq.${clientId}` }, () => this.handleRealtimeUpdate(clientId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routines', filter: `user_id=eq.${clientId}` }, () => this.handleRealtimeUpdate(clientId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routine_exercises', filter: `user_id=eq.${clientId}` }, () => this.handleRealtimeUpdate(clientId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routine_days', filter: `user_id=eq.${clientId}` }, () => this.handleRealtimeUpdate(clientId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exercises', filter: `user_id=eq.${clientId}` }, () => this.handleRealtimeUpdate(clientId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exercise_logs', filter: `user_id=eq.${clientId}` }, () => this.handleRealtimeUpdate(clientId))
      // Removed global exercise_sets subscription to prevent unnecessary reloads
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_weight_logs', filter: `user_id=eq.${clientId}` }, () => this.handleRealtimeUpdate(clientId))
      .subscribe();
  }

  private handleRealtimeUpdate(clientId: string) {
    if (this.updateTimeout) clearTimeout(this.updateTimeout);
    this.updateTimeout = setTimeout(() => {
      this.zone.run(() => {
        this.invalidateClientCache(clientId);
        this.loadClientData(clientId, true);
      });
    }, 1000);
  }

  goBack() {
    this.router.navigate(['/tabs/coaching']);
  }

  setActiveTab(tab: 'home' | 'programs' | 'weight' | 'tracking') {
    const prev = this.activeTab;
    this.activeTab = tab;
    this.editingMode = false;
    this.editingProgram = null;
    if (tab === 'weight') {
      setTimeout(() => {
        this.updateChart();
      }, 150);
    } else if (tab === 'tracking') {
      if (this.client) {
        // Force reload tracking data when entering tab to ensure chart is fresh
        this.loadClientTrackingData(this.client.client_id);
      }
      this.muscleChartEnterRetries = 0;
      this.scheduleMuscleChartRender('enter', 60);
    } else if (prev === 'tracking') {
      if (this.muscleChartRenderTimer) { try { clearTimeout(this.muscleChartRenderTimer); } catch {} this.muscleChartRenderTimer = null; }
      if (this.muscleChart) { try { this.muscleChart.destroy(); } catch {} this.muscleChart = null; }
    }
  }

  async editProgram(program: ClientProgram) {
    this.editingMode = true;
    this.editingProgram = { ...program };
  }

  async saveProgram() {
    if (!this.editingProgram || !this.client) return;

    try {
      await this.coachService.upsertClientProgram(this.client.client_id, {
        name: this.editingProgram.name,
        description: this.editingProgram.description
      });
      this.programs = await this.coachService.getClientPrograms(this.client.client_id);
      this.editingMode = false;
      this.editingProgram = null;

      // Show success message
      const alert = await this.alertController.create({
        header: this.translationService.translate('common.success'),
        message: this.translationService.translate('programs.updated_msg'),
        buttons: [this.translationService.translate('common.ok')]
      });
      await alert.present();
    } catch (error) {
      console.error('Error saving program:', error);
    }
  }

  cancelEdit() {
    this.editingMode = false;
    this.editingProgram = null;
  }

  // Weight functionality is now read-only
  // async addWeight() { ... }

  async deleteWeightLog(log: ClientWeight) {
    if (!this.client) return;

    const alert = await this.alertController.create({
      header: this.translationService.translate('common.confirm'),
      message: this.translationService.translate('weight.delete_confirm'),
      buttons: [
        { text: this.translationService.translate('common.cancel'), role: 'cancel' },
        {
          text: this.translationService.translate('common.delete'),
          role: 'destructive',
          handler: async () => {
            this.loaderService.show();
            try {
              await this.coachService.deleteClientWeightLog(log.id, this.client!.client_id);

              // Refresh weight history
              const weightData = await this.coachService.getClientWeightHistory(this.client!.client_id);
              this.weightHistory = weightData.map((w: any) => ({
                id: w.id,
                weight: w.weight,
                unit: w.unit,
                date: new Date(w.log_date)
              }));

              if (this.weightHistory.length > 0) {
                this.currentWeight = this.weightHistory[0];
              } else {
                this.currentWeight = null;
              }
              this.computeWeightChange();
              this.updateChart();
            } catch (error) {
              console.error('Error deleting weight log:', error);
            } finally {
              this.loaderService.hide();
            }
          }
        }
      ]
    });
    await alert.present();
  }

  formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat(this.getLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(d);
  }

  formatShortDate(date: Date | string | null | undefined): string {
    if (!date) return '—';
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat(this.getLocale(), {
      day: 'numeric',
      month: 'short'
    }).format(d);
  }

  private getLocale(): string {
    const lang = this.translationService.getCurrentLang();
    switch (lang) {
      case 'es': return 'es-ES';
      case 'de': return 'de-DE';
      case 'ko': return 'ko-KR';
      default: return 'en-US';
    }
  }

  updateChart() {
    try { if (!this.clientWeightChart) return; } catch { return; }
    const labels = (this.weightHistory || []).slice().reverse().map(w => new Intl.DateTimeFormat(this.getLocale(), { month: 'short', day: 'numeric' }).format(w.date));
    const data = (this.weightHistory || []).slice().reverse().map(w => this.convert(w.weight, w.unit, this.selectedUnit));
    if (this.chart) { this.chart.destroy(); this.chart = null; }
    this.chart = new Chart(this.clientWeightChart.nativeElement, {
      type: 'line',
      data: { labels, datasets: [{ data, borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 3, tension: 0.4, fill: true }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { ticks: { display: false } } } }
    });
  }

  hasRoutinesForProgram(programId: string) {
    return (this.routines || []).some(r => r.programId === programId);
  }

  async openCreateProgram() {
    if (!this.client) return;
    try {
      const { ProgramModalComponent } = await import('../programs/program-modal/program-modal.component');
      const modal = await this.modalController.create({
        component: ProgramModalComponent,
        cssClass: 'program-modal-floating',
        componentProps: { mode: 'choice', externalSave: true }
      });
      modal.onDidDismiss().then(async (result) => {
        const data = result.data || {};
        if (data.importCode || data.name) {
          this.loaderService.show();
          try {
            if (data.importCode) {
              await this.coachService.importProgramByCodeForClient(this.client!.client_id, data.importCode);
            } else if (data.name) {
              await this.coachService.upsertClientProgram(this.client!.client_id, { name: data.name, description: data.description });
            }
            this.programs = await this.coachService.getClientPrograms(this.client!.client_id);
            this.cdr.detectChanges();
          } catch (e) {
            console.error('Program operation failed:', e);
          } finally {
            this.loaderService.hide();
          }
        }
      });
      await modal.present();
    } catch (error) {
      console.error('Error creating program:', error);
    }
  }

  async createRoutine(program: ClientProgram) {
    if (!this.client) return;
    try {
      const modal = await this.modalController.create({
        component: RoutineModalComponent,
        cssClass: 'routine-modal-fullscreen',
        componentProps: { programName: program.name, externalSave: true }
      });
      modal.onDidDismiss().then(async (result) => {
        const r = result?.data;
        if (!r) return;
        this.loaderService.show();
        try {
          if (r.importCode) {
            try {
              await this.coachService.importRoutineByCodeForClient(this.client!.client_id, program.name, r.importCode);
            } catch (e) { console.error('Import routine failed:', e); }
          } else if (r.name) {
            const rid = await this.coachService.createClientRoutine(this.client!.client_id, program.name, r.name, r.code, r.description);
            if (rid) {
              await this.coachService.setClientRoutineDays(this.client!.client_id, rid, r.days || []);
              for (const ex of (r.exercises || [])) {
                await this.coachService.addClientRoutineExercise(this.client!.client_id, rid, {
                  exerciseName: ex.exerciseName,
                  targetSets: ex.targetSets,
                  targetReps: ex.targetReps,
                  weight: ex.weight,
                  weightUnit: ex.weightUnit,
                  reserveReps: ex.reserveReps,
                  notes: ex.notes,
                  order: ex.order,
                  sets: ex.sets || []
                });
              }
            }
          }
          const refreshed = await this.coachService.getClientRoutines(this.client!.client_id);
          this.routines = refreshed as any;
          this.updateProgramRoutinesMap();
          await this.updateTodayView();
        } finally {
          this.loaderService.hide();
        }
      });
      await modal.present();
    } catch (error) {
      console.error('Error creating routine:', error);
    }
  }

  async deleteProgram(program: ClientProgram) {
    if (!this.client) return;
    try {
      const alert = await this.alertController.create({
        header: this.translationService.translate('common.confirm'),
        message: this.translationService.translate('client.delete_program_confirm', { name: program.name }),
        buttons: [
          { text: this.translationService.translate('common.cancel'), role: 'cancel' },
          { text: this.translationService.translate('common.delete'), role: 'destructive', handler: async () => {
              this.loaderService.show();
              try {
                await this.coachService.deleteClientProgram(this.client!.client_id, program.id);
                this.programs = await this.coachService.getClientPrograms(this.client!.client_id);
                const refreshed = await this.coachService.getClientRoutines(this.client!.client_id);
                this.routines = refreshed as any;
                this.updateProgramRoutinesMap();
                await this.updateTodayView();
              } catch (e) { console.error('Error deleting program:', e); }
              finally { this.loaderService.hide(); }
            }
          }
        ]
      });
      await alert.present();
    } catch (error) {
      console.error('Error deleting program:', error);
    }
  }

  async editRoutineName(routine: { id: string; name: string }) {
    if (!this.client) return;
    const newName = prompt(this.translationService.translate('routines.edit_name_prompt'), routine.name);
    if (!newName) return;
    try {
      await this.coachService.updateClientRoutine(this.client.client_id, routine.id, { name: newName });
      const refreshed = await this.coachService.getClientRoutines(this.client.client_id);
      this.routines = refreshed as any;
      this.updateProgramRoutinesMap();
      await this.updateTodayView();
    } catch (error) {
      console.error('Error updating routine name:', error);
    }
  }

  async editRoutine(routine: { id: string; name: string; description?: string; days?: string[]; exercises?: any[]; programId?: string }) {
    if (!this.client) return;
    try {
      const rdata: any = {
        id: routine.id,
        name: routine.name,
        description: routine.description || '',
        days: Array.isArray(routine.days) ? routine.days : [],
        exercises: (routine.exercises || []).map((e: any, idx: number) => ({
          exerciseId: e.exerciseId,
          exerciseName: e.exerciseName,
          weight: typeof e.weight === 'number' ? e.weight : 0,
          weightUnit: e.weightUnit || 'kg',
          targetSets: Number(e.targetSets || 0),
          targetReps: Number(e.targetReps || 0),
          reserveReps: Number(e.reserveReps || 0),
          notes: e.notes || '',
          order: typeof e.order === 'number' ? e.order : idx,
          sets: Array.isArray((e as any).sets) ? (e as any).sets : [],
          goalWeight: e.goalWeight,
          goalUnit: e.goalUnit
        })),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        programName: (this.programs.find(p => p.id === routine.programId)?.name) || undefined,
        code: (routine as any).code || undefined,
      };
      const modal = await this.modalController.create({
        component: RoutineModalComponent,
        cssClass: 'routine-modal-fullscreen',
        componentProps: { routine: rdata, programName: rdata.programName, externalSave: true }
      });
      modal.onDidDismiss().then(async (result) => {
        const updated = result?.data;
        if (!updated || !updated.id) return;
        this.loaderService.show();
        try {
          // Update name and description
          if ((updated.name && updated.name !== routine.name) || (updated.description !== routine.description)) {
             await this.coachService.updateClientRoutine(this.client!.client_id, routine.id, {
               name: updated.name,
               description: updated.description
             });
          }
          // Update days
          await this.coachService.setClientRoutineDays(this.client!.client_id, routine.id, Array.isArray(updated.days) ? updated.days : []);
          // Compute exercise diffs
          const before: any[] = Array.isArray(routine.exercises) ? routine.exercises : [];
          const after: any[] = Array.isArray(updated.exercises) ? updated.exercises : [];
          const beforeIds = new Set(before.map(e => e.exerciseId).filter(Boolean));
          const afterIds = new Set(after.map(e => e.exerciseId).filter(Boolean));
          // Deletes: in before but not in after
          for (const b of before) {
            if (!afterIds.has(b.exerciseId)) {
              try { await this.coachService.deleteClientRoutineExercise(routine.id, b.exerciseId, this.client!.client_id); } catch {}
            }
          }
          // Upserts: for each after exercise
          let orderIndex = 0;
          for (const a of after) {
            orderIndex = typeof a.order === 'number' ? a.order : orderIndex;
            const payload = {
              exerciseName: a.exerciseName,
              targetSets: Number(a.targetSets || 0),
              targetReps: Number(a.targetReps || 0),
              weight: Number(a.weight || 0),
              weightUnit: (a.weightUnit || 'kg') as any,
              reserveReps: Number(a.reserveReps || 0),
              notes: a.notes || '',
              order: orderIndex,
              sets: a.sets || [],
              goalWeight: a.goalWeight,
              goalUnit: a.goalUnit
            };
            if (beforeIds.has(a.exerciseId)) {
              await this.coachService.updateClientRoutineExercise(this.client!.client_id, routine.id, a.exerciseId, payload);
            } else {
              await this.coachService.addClientRoutineExercise(this.client!.client_id, routine.id, payload);
            }
            orderIndex++;
          }
          const refreshed = await this.coachService.getClientRoutines(this.client!.client_id);
          this.routines = refreshed as any;
          this.updateProgramRoutinesMap();
          await this.updateTodayView();
        } finally {
          this.loaderService.hide();
        }
      });
      await modal.present();
    } catch (error) {
      console.error('Error editing routine:', error);
    }
  }

  async deleteRoutine(routine: { id: string; name: string }) {
    if (!this.client) return;
    try {
      const alert = await this.alertController.create({
        header: this.translationService.translate('common.confirm'),
        message: this.translationService.translate('routines.delete_confirm_name', { name: routine.name }),
        buttons: [
          {
            text: this.translationService.translate('common.cancel'),
            role: 'cancel'
          },
          {
            text: this.translationService.translate('common.delete'),
            role: 'destructive',
            handler: async () => {
              this.loaderService.show();
              try {
                await this.coachService.deleteClientRoutine(this.client!.client_id, routine.id);
                const refreshed = await this.coachService.getClientRoutines(this.client!.client_id);
                this.routines = refreshed as any;
                this.updateProgramRoutinesMap();
                await this.updateTodayView();
              } catch (e) {
                console.error('Error deleting routine:', e);
              } finally {
                this.loaderService.hide();
              }
            }
          }
        ]
      });
      await alert.present();
    } catch (error) {
      console.error('Error deleting routine:', error);
    }
  }

  async addExerciseToRoutine(routine: { id: string }) {
    if (!this.client) return;
    const name = prompt(this.translationService.translate('exercise.edit_name_prompt'));
    if (!name) return;
    const targetSets = Number(prompt(this.translationService.translate('routines.target_sets_prompt'), '3') || '0');
    const targetReps = Number(prompt(this.translationService.translate('routines.target_reps_prompt'), '10') || '0');
    const weight = Number(prompt(this.translationService.translate('exercise.weight_prompt'), '0') || '0');
    const unit = (prompt(this.translationService.translate('exercise.unit_prompt'), 'kg') || 'kg').toLowerCase() === 'lb' ? 'lb' : 'kg';
    try {
      await this.coachService.addClientRoutineExercise(this.client.client_id, routine.id, { exerciseName: name, targetSets, targetReps, weight, weightUnit: unit as any });
      const refreshed = await this.coachService.getClientRoutines(this.client.client_id);
      this.routines = refreshed as any;
      this.updateProgramRoutinesMap();
      await this.updateTodayView();
    } catch (error) {
      console.error('Error adding exercise:', error);
    }
  }

  async editRoutineExercise(routine: { id: string }, ex: any) {
    if (!this.client) return;
    const name = prompt(this.translationService.translate('exercise.edit_name_prompt'), ex.exerciseName || '') || ex.exerciseName;
    const targetSets = Number(prompt(this.translationService.translate('routines.target_sets_prompt'), String(ex.targetSets ?? 3)) || ex.targetSets || 0);
    const targetReps = Number(prompt(this.translationService.translate('routines.target_reps_prompt'), String(ex.targetReps ?? 10)) || ex.targetReps || 0);
    const weight = Number(prompt(this.translationService.translate('exercise.weight_prompt'), String(ex.weight ?? 0)) || ex.weight || 0);
    const unit = (prompt(this.translationService.translate('exercise.unit_prompt'), String(ex.weightUnit || 'kg')) || ex.weightUnit || 'kg').toLowerCase() === 'lb' ? 'lb' : 'kg';
    try {
      await this.coachService.updateClientRoutineExercise(this.client.client_id, routine.id, ex.exerciseId, { exerciseName: name, targetSets, targetReps, weight, weightUnit: unit as any });
      const refreshed = await this.coachService.getClientRoutines(this.client.client_id);
      this.routines = refreshed as any;
      this.updateProgramRoutinesMap();
      await this.updateTodayView();
    } catch (error) { console.error('Error editing exercise:', error); }
  }

  async deleteRoutineExercise(routine: { id: string }, ex: any) {
    try {
      const alert = await this.alertController.create({
        header: this.translationService.translate('common.confirm'),
        message: this.translationService.translate('exercise.delete_confirm_name', { name: ex.exerciseName || '' }),
        buttons: [
          { text: this.translationService.translate('common.cancel'), role: 'cancel' },
          { text: this.translationService.translate('common.delete'), role: 'destructive', handler: async () => {
            try {
              await this.coachService.deleteClientRoutineExercise(routine.id, ex.exerciseId, this.client!.client_id);
              const refreshed = await this.coachService.getClientRoutines(this.client!.client_id);
              this.routines = refreshed as any;
              this.updateProgramRoutinesMap();
              await this.updateTodayView();
            } catch (e) { console.error('Error deleting exercise:', e); }
          } }
        ]
      });
      await alert.present();
    } catch (error) {
      console.error('Error deleting exercise:', error);
    }
  }

  convert(value: number, from: 'kg'|'lb', to: 'kg'|'lb') {
    if (from === to) return value;
    return from === 'kg' ? (value * 2.20462) : (value / 2.20462);
  }

  computeWeightChange() {
    const history = (this.weightHistory || []).slice().sort((a,b)=> b.date.getTime() - a.date.getTime());
    const recent = history.filter(w => (Date.now() - w.date.getTime()) <= (30*24*60*60*1000));
    if (recent.length >= 2) {
      const first = recent[recent.length - 1];
      const last = recent[0];
      const firstKg = this.convert(first.weight, first.unit, 'kg');
      const lastKg = this.convert(last.weight, last.unit, 'kg');
      const diffKg = lastKg - firstKg;
      this.weightChange = this.convert(diffKg, 'kg', this.selectedUnit);
    } else {
      this.weightChange = 0;
    }
  }

  getRoutineCount(programId: string): number {
    return (this.routines || []).filter(r => r.programId === programId).length;
  }

  getExerciseCount(programId: string): number {
    return (this.routines || [])
      .filter(r => r.programId === programId)
      .reduce((total, r) => total + (r.exercises?.length || 0), 0);
  }

  getTotalExercises(routine: any): number {
    return routine.exercises?.length || 0;
  }

  getScheduleLabel(routine: any): string {
    const days = routine.days || [];
    const daysWeek = this.translationService.translate('programs.days_week');
    if (days.length > 0) {
      return `${days.length} ${daysWeek}`;
    }
    switch (routine.frequency) {
      case 'daily':
        return this.translationService.translate('routines.daily');
      case 'weekly':
        return `1 ${daysWeek}`;
      default:
        return this.translationService.translate('routines.custom');
    }
  }

  toggleProgramDesc(programId: string) {
    if (this.expandedProgramDescs.has(programId)) {
      this.expandedProgramDescs.delete(programId);
    } else {
      this.expandedProgramDescs.add(programId);
    }
  }

  isProgramDescExpanded(programId: string): boolean {
    return this.expandedProgramDescs.has(programId);
  }

  async copyRoutineCode(code?: string | null) {
    const t = (code || '').toString();
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
      const msg = this.translationService.translate('routines.copied_msg', { code: t }) || `Rutina ${t} copiada`;
      const toast = await this.toastController.create({
        message: msg,
        duration: 1500,
        position: 'bottom',
        color: 'medium',
        cssClass: 'liftlog-toast',
        mode: 'ios'
      });
      await toast.present();
    }
  }

  async copyProgramCode(code?: string | null) {
    const t = (code || '').toString();
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
      const msg = this.translationService.translate('programs.copied_msg', { code: t }) || `Programa ${t} copiado`;
      const toast = await this.toastController.create({
        message: msg,
        duration: 1500,
        position: 'bottom',
        color: 'medium',
        cssClass: 'liftlog-toast',
        mode: 'ios'
      });
      await toast.present();
    }
  }

  isUniform(ex: any): boolean {
    if (!ex.sets || ex.sets.length === 0) return true;
    const first = ex.sets[0];
    return ex.sets.every((s: any) =>
      Number(s.reps) === Number(first.reps) &&
      Number(s.weight) === Number(first.weight)
    );
  }

  previewLogs: any = null;

  // Preview Modal Logic
  async openRoutineDetail(routine: any) {
    this.previewRoutine = routine;
    this.previewExpandedIds.clear();
    this.previewExercises = routine.exercises || [];
    this.showPreview = true;
    this.previewLogs = null;

    if (routine.finished && this.client) {
      const logs = await this.coachService.getClientRoutineLog(this.client.client_id, routine.id, this.today);
      if (logs) {
        this.previewLogs = logs;
      }
    }
  }

  closePreview() {
    this.showPreview = false;
    this.previewRoutine = null;
    this.previewLogs = null;
  }

  togglePreviewExercise(id: string) {
    if (this.previewExpandedIds.has(id)) {
      this.previewExpandedIds.delete(id);
    } else {
      this.previewExpandedIds.add(id);
    }
  }

  isPreviewExpanded(id: string) {
    return this.previewExpandedIds.has(id);
  }

  getPreviewSets(exercise: any) {
    // If we have logs (finished routine), use them
    if (this.previewLogs && this.previewLogs.exercise_sets) {
      const loggedSets = this.previewLogs.exercise_sets.filter((s: any) => s.exercise_id === exercise.exerciseId);
      if (loggedSets.length > 0) {
        return loggedSets.sort((a: any, b: any) => (a.set_order || 0) - (b.set_order || 0));
      }
    }

    // Fallback to target sets
    if (exercise.sets && exercise.sets.length > 0) return exercise.sets;
    const count = Number(exercise.targetSets || 0);
    if (count <= 0) return [];
    return Array(count).fill(0).map(() => ({
      weight: exercise.weight || 0,
      weightUnit: exercise.weightUnit || 'kg',
      reps: exercise.targetReps || 0,
      rir: exercise.reserveReps || 0
    }));
  }

  getTotalSets(routine: any): number {
    if (!routine.exercises) return 0;
    return routine.exercises.reduce((acc: number, ex: any) => acc + (Number(ex.targetSets) || 0), 0);
  }

  getTotalExercisesToday(): number {
    return this.routinesToday.reduce((total, routine) => total + (routine.exercises?.length || 0), 0);
  }

  getRepsSummary(exercise: any) {
    const sets = this.getPreviewSets(exercise);
    if (!sets || sets.length === 0) return exercise.targetReps || 0;
    const reps = sets.map((s: any) => s.reps);
    const min = Math.min(...reps);
    const max = Math.max(...reps);
    return min === max ? min : `${min}-${max}`;
  }

  async loadClientTrackingData(clientId: string) {
    if (!this.client) return;
    this.loading = false;
    this.loaderService.show();
    try {
      this.clientExercises = await this.coachService.getClientExercises(clientId);
      this.trackingLogs = await this.coachService.getAllClientExerciseLogs(clientId);
      this.updateTrackingView(true);
    } catch (error) {
      console.error('Error loading tracking data:', error);
    } finally {
      this.loaderService.hide();
    }
  }

  updateTrackingView(initialLoad = false) {
    const activeSet = new Set<string>((this.programs || []).filter(p => p.isActive).map(p => p.name));
    const visibleRoutines = (this.routines || []).filter((r: any) => !r.programName || activeSet.has(r.programName));
    this.trackingPrograms = Array.from(new Set(visibleRoutines.map((r: any) => r.programName || 'Program'))).sort();

    if (initialLoad && !this.trackingSelectedProgram && this.trackingPrograms.length) {
      this.trackingSelectedProgram = this.trackingPrograms[0];
    }

    this.updateRoutinesForTracking(visibleRoutines);
    this.computeRoutineQuickStats(this.trackingLogs, visibleRoutines);

    if (this.trackingSelectedRoutineId) {
      this.computeExerciseMetrics(this.clientExercises, this.trackingLogs, visibleRoutines);
    } else {
      this.trackingExerciseMetrics = [];
    }

    if (initialLoad) {
      this.computeMuscleDistribution();
    }
    this.cdr.detectChanges();
    setTimeout(() => this.renderExerciseSparklines(), 0);
    if (initialLoad) {
      this.scheduleMuscleChartRender('enter', 0);
    }
  }

  updateRoutinesForTracking(routines: any[]) {
    const activeSet = new Set<string>((this.programs || []).filter(p => p.isActive).map(p => p.name));
    const list = routines.filter((r: any) => (r.programName || 'Program') === this.trackingSelectedProgram && (!r.programName || activeSet.has(r.programName)));
    this.trackingRoutinesForProgram = list;

    const uniqueExercises = new Set<string>();
    list.forEach((r: any) => (r.exercises || []).forEach((e: any) => uniqueExercises.add(e.exerciseId)));
    this.trackingTotalExercisesCount = uniqueExercises.size;
  }

  private getTrackingDateRange() {
    return this.utilService.getDateRange(this.trackingTimeRange);
  }

  private computeLogVolumeKg(log: any): number {
    const setsArr = Array.isArray(log.sets) ? log.sets : [];
    if (setsArr.length > 0) {
      return setsArr.reduce((acc: number, s: any) => {
        const w = this.utilService.convertWeight(s.weight || 0, s.weightUnit || 'kg', 'kg');
        return acc + (w * (s.reps || 0));
      }, 0);
    }
    return log.totalVolume || 0;
  }

  private computeRoutineQuickStats(logs: any[], routines: any[]) {
    const range = this.getTrackingDateRange();
    const start = range.startDate;
    const end = range.endDate;
    const locale = this.getLocale();

    const byRoutine: Record<string, any[]> = {};
    routines.forEach(r => {
      const exerciseIds = new Set((r.exercises || []).map((e: any) => e.exerciseId));
      const rlogs = logs.filter(l => {
        const d = new Date(l.log_date);
        return d >= start && d <= end && exerciseIds.has(l.exercise_id);
      });
      byRoutine[r.id] = rlogs;
    });

    const stats: Record<string, any> = {};
    Object.entries(byRoutine).forEach(([rid, rlogs]) => {
      const totalVol = rlogs.reduce((acc, l) => acc + this.computeLogVolumeKg(l), 0);
      const totalReps = rlogs.reduce((acc, l) => acc + (Array.isArray(l.sets) ? l.sets.reduce((a:number,s:any)=> a + (s.reps||0),0) : 0), 0);
      const totalSets = rlogs.reduce((acc, l) => acc + (Array.isArray(l.sets) ? l.sets.length : 0), 0);
      const last = rlogs.length ? rlogs.slice().sort((a,b)=> new Date(a.log_date).getTime() - new Date(b.log_date).getTime()).pop() : null;
      stats[rid] = {
        totalVolumeKg: Math.round(totalVol),
        totalReps,
        totalSets,
        lastWorkout: last ? new Date(last.log_date).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : undefined
      };
    });
    this.trackingRoutineQuickStats = stats;
  }

  private computeExerciseMetrics(exercises: any[], logs: any[], routines: any[]) {
    const range = this.getTrackingDateRange();
    const start = range.startDate;
    const end = range.endDate;
    const routine = routines.find(r => r.id === this.trackingSelectedRoutineId);
    const ids = new Set((routine?.exercises || []).map((e: any) => e.exerciseId));

    const metrics: any[] = [];
    ids.forEach((eid) => {
      const routineExercise = (routine?.exercises || []).find((e: any) => e.exerciseId === eid);
      const exName = routineExercise?.exerciseName || (exercises.find(e => e.id === eid)?.name) || '';
      const plannedSets = routineExercise?.targetSets || 0;
      const plannedReps = routineExercise?.targetReps || 0;

      let plannedWeightKg = 0;
      const setsRaw = (routineExercise as any).sets;
       if (Array.isArray(setsRaw) && setsRaw.length > 0) {
        const firstSet = setsRaw[0];
        const w = Number(firstSet.weight) || 0;
        const u = firstSet.unit || routineExercise?.weightUnit || 'kg';
        plannedWeightKg = this.utilService.convertWeight(w, u, 'kg');
      } else {
        const plannedWeight = routineExercise?.weight || 0;
        plannedWeightKg = this.utilService.convertWeight(plannedWeight, routineExercise?.weightUnit || 'kg', 'kg');
      }

      const plannedTotalReps = plannedSets * plannedReps;
      const plannedTotalVolumeKg = Math.round(plannedSets * plannedReps * plannedWeightKg);

      const elogs = logs.filter(l => {
        if (l.exercise_id !== eid) return false;
        const d = new Date(l.log_date);
        return d >= start && d <= end;
      });

      const setsAll = elogs.reduce<any[]>((arr, l) => {
        const s = Array.isArray(l.sets) ? l.sets : [];
        return arr.concat(s);
      }, []);

      const totalSets = setsAll.length;
      const maxSetWeightKg = setsAll.length ? Math.max(...setsAll.map((s: any) => {
        const w = this.utilService.convertWeight(s.weight || 0, s.weightUnit || 'kg', 'kg');
        return w || 0;
      }), 0) : 0;
      const lastMaxKg = maxSetWeightKg;
      const totalReps = setsAll.reduce((acc: number, s: any) => acc + (s.reps || 0), 0);

      const vols = setsAll.map((s: any) => {
        const wkg = this.utilService.convertWeight(s.weight || 0, s.weightUnit || 'kg', 'kg');
        return wkg * (s.reps || 0);
      });
      const avgVol = vols.length ? Math.round((vols.reduce((a: number, b: number)=> a + b, 0) / vols.length) * 10) / 10 : 0;
      const totalVol = Math.round(vols.reduce((a: number, b: number)=> a + b, 0));
      const workoutsCount = elogs.length;
      const avgVolPerWorkout = workoutsCount ? Math.round((totalVol / workoutsCount) * 10) / 10 : 0;

      const best1rm = setsAll.length ? Math.max(...setsAll.map((s: any) => {
        const wkg = this.utilService.convertWeight(s.weight || 0, s.weightUnit || 'kg', 'kg');
        const reps = s.reps || 0;
        return Math.round((wkg * (1 + reps / 30)) * 10) / 10;
      }), 0) : 0;

      const allLogs = logs.filter(l => l.exercise_id === eid);
      const allSets = allLogs.reduce<any[]>((arr, l) => {
        const s = Array.isArray(l.sets) ? l.sets : [];
        return arr.concat(s);
      }, []);
      const allBest1rm = allSets.length ? Math.max(...allSets.map((s: any) => {
        const wkg = this.utilService.convertWeight(s.weight || 0, s.weightUnit || 'kg', 'kg');
        const reps = s.reps || 0;
        return Math.round((wkg * (1 + reps / 30)) * 10) / 10;
      }), 0) : 0;
      const allWorkoutsCount = allLogs.length;
      const allTimeTotalSets = allSets.length;
      const allTimeTotalReps = allSets.reduce((acc: number, s: any) => acc + (s.reps || 0), 0);
      const allVols = allSets.map((s: any) => {
        const wkg = this.utilService.convertWeight(s.weight || 0, s.weightUnit || 'kg', 'kg');
        return wkg * (s.reps || 0);
      });
      const allTimeTotalVolumeKg = Math.round(allVols.reduce((a: number, b: number)=> a + b, 0));

      const sparklineData = elogs
        .sort((a,b) => new Date(a.log_date).getTime() - new Date(b.log_date).getTime())
        .map(l => {
          const s = Array.isArray(l.sets) ? l.sets : [];
          if (!s.length) return 0;
          return Math.max(...s.map((set: any) => {
             const w = this.utilService.convertWeight(set.weight || 0, set.weightUnit || 'kg', 'kg');
             const r = set.reps || 0;
             return w * (1 + r / 30);
          }), 0);
        });

      metrics.push({ exerciseId: eid, name: exName, lastMaxKg, totalReps, avgVolumePerSetKg: avgVol, totalVolumeKg: totalVol, workoutsCount, avgVolumePerWorkoutKg: avgVolPerWorkout, best1rmKg: best1rm, allTimeBest1rmKg: allBest1rm, allTimeWorkoutsCount: allWorkoutsCount, totalSets, plannedSets, plannedTotalReps, plannedTotalVolumeKg, allTimeTotalSets, allTimeTotalReps, allTimeTotalVolumeKg, sparklineData });
    });
    this.trackingExerciseMetrics = metrics.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
    setTimeout(() => this.renderExerciseSparklines(), 0);
  }

  private computeMuscleDistribution() {
    // Global distribution across all ACTIVE programs
    const activeSet = new Set<string>((this.programs || []).filter(p => p.isActive).map(p => p.name));
    const relevantRoutines = (this.routines || []).filter((r: any) => !r.programName || activeSet.has(r.programName));

    const distribution: Record<string, number> = {};
    const exercises = this.clientExercises;

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
        (routine.exercises || []).forEach((ex: any) => {
            const muscle = getMuscle(ex.exerciseId, ex.exerciseName, (routine as any)?.name || '');

            // Skip Core
            if (muscle === 'core') return;

            const sets = Number(ex.targetSets) || 1;
            const key = allowed.has(muscle) ? muscle : 'back';
            distribution[key] = (distribution[key] || 0) + sets;
        });
    });

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
        return b.count - a.count;
      });

    this.cdr.detectChanges();
    this.scheduleMuscleChartRender('data', 0);
  }

  private scheduleMuscleChartRender(reason: 'enter'|'data', delayMs: number) {
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
    if (this.activeTab === 'tracking') {
      this.scheduleMuscleChartRender('data', 0);
    }
  }

  private renderMuscleChart(forceRecreate: boolean = false) {
    try {
      if (!this.muscleChartCanvasRef) {
        if (forceRecreate && this.muscleChartEnterRetries < 8) {
          this.muscleChartEnterRetries += 1;
          this.scheduleMuscleChartRender('enter', 90);
        }
        return;
      }

      const ctx = this.muscleChartCanvasRef.nativeElement.getContext('2d');
      if (!ctx) {
        if (forceRecreate && this.muscleChartEnterRetries < 8) {
          this.muscleChartEnterRetries += 1;
          this.scheduleMuscleChartRender('enter', 90);
        }
        return;
      }

      const canvasEl = this.muscleChartCanvasRef.nativeElement;
      if (forceRecreate && (canvasEl.clientWidth <= 0 || canvasEl.clientHeight <= 0)) {
        if (this.muscleChartEnterRetries < 8) {
          this.muscleChartEnterRetries += 1;
          this.scheduleMuscleChartRender('enter', 90);
        }
        return;
      }

      this.muscleChartEnterRetries = 0;

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
        this.muscleChart = new Chart(ctx, {
          type: 'polarArea',
          data: {
            labels: [this.translationService.translate('tracking.no_data')],
            datasets: [{
              data: [1],
              backgroundColor: ['rgba(75, 85, 99, 0.2)'],
              borderColor: ['#4b5563'],
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
                color: 'rgba(255, 255, 255, 0.05)',
                lineWidth: 1
              },
              angleLines: {
                color: 'rgba(255, 255, 255, 0.05)'
              },
              pointLabels: {
                display: false
              }
            }
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              enabled: true,
              backgroundColor: '#000000',
              titleColor: '#fff',
              bodyColor: '#e5e7eb',
              padding: 12,
              cornerRadius: 8,
              borderColor: 'rgba(255,255,255,0.1)',
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
      const logs = this.trackingLogs;
      const range = this.getTrackingDateRange();
      const start = range.startDate;
      const end = range.endDate;
      const lang = this.getLocale();
      const byId = new Map<string, HTMLCanvasElement>();
      this.sparkCanvases.forEach(ref => {
        const el = ref.nativeElement;
        const id = el.getAttribute('data-exercise-id') || '';
        if (id) byId.set(id, el);
      });
      this.trackingExerciseMetrics.forEach(m => {
        const canvas = byId.get(m.exerciseId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let elogs = logs.filter(l => l.exercise_id === m.exerciseId && new Date(l.log_date) >= start && new Date(l.log_date) <= end)
          .sort((a,b)=> new Date(a.log_date).getTime() - new Date(b.log_date).getTime());
        const maxPoints = 24;
        if (elogs.length > maxPoints) elogs = elogs.slice(-maxPoints);
        const labels = elogs.map(l => new Date(l.log_date).toLocaleDateString(lang, { month: 'short', day: 'numeric' }));
        const data = elogs.map(l => {
          const sets = Array.isArray(l.sets) ? l.sets : [];
          const best = sets.length ? Math.max(...sets.map((s: any) => {
            const wkg = this.utilService.convertWeight(s.weight || 0, s.weightUnit || 'kg', 'kg');
            const reps = s.reps || 0;
            return Math.round((wkg * (1 + reps / 30)) * 10) / 10;
          }), 0) : 0;
          return best;
        });
        const prev = this.trackingSparkCharts.get(m.exerciseId);
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
        this.trackingSparkCharts.set(m.exerciseId, chart);
      });
    } catch {}
  }

  onTimeRangeChange(event: any) {
    this.trackingTimeRange = (event && event.detail) ? event.detail.value : event;
    this.updateTrackingView();
  }

  toggleProgramDropdown() {
    this.trackingProgramDropdownOpen = !this.trackingProgramDropdownOpen;
  }

  selectProgram(name: string) {
    this.trackingSelectedProgram = name;
    this.trackingProgramDropdownOpen = false;
    this.trackingSelectedRoutineId = '';
    this.updateTrackingView();
  }

  async onRoutineSelect(id: string) {
    this.trackingSelectedRoutineId = id;
    this.updateTrackingView();

    setTimeout(async () => {
      const routine = (this.routines || []).find((r: any) => r.id === id) || null;
      const modal = await this.modalController.create({
        component: RoutineStatsModalComponent,
        cssClass: 'routine-stats-modal-full',
        componentProps: {
          routine,
          programName: routine?.programName || this.trackingSelectedProgram,
          metrics: this.trackingExerciseMetrics,
          timeRange: this.trackingTimeRange
        },
        showBackdrop: true,
        backdropDismiss: true
      });
      await modal.present();
    }, 50);
  }
}

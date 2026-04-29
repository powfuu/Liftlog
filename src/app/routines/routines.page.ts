import { Component, OnInit, NgZone, inject } from '@angular/core';
import { Clipboard } from '@capacitor/clipboard';
import { CommonModule } from '@angular/common';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonBackButton, IonButtons, IonButton, IonIcon, IonCard, IonCardContent, IonCardHeader, IonLabel, IonChip, ModalController } from '@ionic/angular/standalone';
import { ToastController } from '@ionic/angular/standalone';
import { NotchHeaderComponent } from '../shared/notch-header/notch-header.component';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { add, barbell, list, trash, create, chevronForward, chevronBack, refresh, calendar, copyOutline } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { RoutineModalComponent } from './routine-modal/routine-modal.component';
import { Routine } from '../models/routine.model';
import { StorageService } from '../services/storage.service';
import { StoreService } from '../services/store.service';
import { AlertService } from '../services/alert.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { TranslationService } from '../services/translation.service';
import { LoaderService } from '../services/loader.service';
import { distinctUntilChanged } from 'rxjs';
import { SwipeHintService } from '../services/swipe-hint.service';

@Component({
  selector: 'app-routines',
  templateUrl: './routines.page.html',
  styleUrls: ['./routines.page.scss'],
  imports: [
    CommonModule,
    IonContent, IonIcon, IonButton, NotchHeaderComponent, DragDropModule, TranslatePipe
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
  currentProgramCode: string | null = null;
  hoverIndex: number | null = null;
  draggingId: string | null = null;
  dragEnabled = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  swipeTransform = '';
  swipeTransition = '';
  swipeOpacity = 1;
  swipeHintVisible = false;
  swipeHintDirection: 'left'|'right'|null = null;

  private modalController = inject(ModalController);
  private storageService = inject(StorageService);
  private alerts = inject(AlertService);
  private store = inject(StoreService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  private translationService = inject(TranslationService);
  private toastCtrl = inject(ToastController);
  private iconsInit = addIcons({ add, barbell, list, trash, create, chevronForward, chevronBack, refresh, calendar, copyOutline });
  descExpanded = false;
  private loader = inject(LoaderService);
  private swipeHints = inject(SwipeHintService);

  async ngOnInit() {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    this.todayDateShort = `${dd}-${mm}`;
    const st = this.store.getState();
    if (st.hydrated && st.routines && st.routines.length) {
      this.routines = st.routines;
      this.applyProgramFilter(this.route.snapshot.queryParamMap.get('program'));
      this.isLoading = false;
    } else {
      await this.loadRoutines();
    }
    this.store.select(s => s.routines).pipe(distinctUntilChanged()).subscribe(list => {
      this.routines = list;
      this.applyProgramFilter(this.route.snapshot.queryParamMap.get('program'));
    });
    this.route.queryParamMap.subscribe(params => {
      const program = params.get('program');
      this.currentProgram = program;
      this.loadProgramCode(program);
      this.applyProgramFilter(program);
    });
  }

  programRoutinesMap = new Map<string, Routine[]>();
  looseRoutines: Routine[] = [];

  async loadRoutines() {
    try {
      const st = this.store.getState();
      if (st.hydrated && st.routines && st.routines.length) {
        this.routines = st.routines;
      } else {
        this.routines = await this.storageService.getRoutines();
      }
      this.routines.sort((a, b) => (a.order || 0) - (b.order || 0));
      this.store.setRoutines(this.routines);
      const program = this.route.snapshot.queryParamMap.get('program');
      this.currentProgram = program;
      this.applyProgramFilter(program);
    } catch (error) {
      console.error('Error loading routines:', error);
    } finally {
      this.isLoading = false;
      this.initialAnimation = false;
    }
  }

  private applyProgramFilter(program: string | null) {
    const norm = (program || '').trim().toLowerCase();
    let list: Routine[] = [];
    if (norm) {
      list = this.routines.filter(r => ((r.programName || 'General').trim().toLowerCase()) === norm);
    } else {
      list = [...this.routines];
    }
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    this.filteredRoutines = list;
  }

  private async loadProgramCode(program: string | null) {
    const name = (program || '').trim();
    if (!name) { this.currentProgramCode = null; return; }
    try {
      const progs = await this.storageService.getPrograms();
      const found = (progs || []).find(p => p.name === name);
      this.currentProgramCode = (found as any)?.code || null;
    } catch { this.currentProgramCode = null; }
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
          this.zone.run(() => {
            const exists = this.routines.find(r => r.id === result.data.id);
            const next = exists ? this.routines.map(r => r.id === result.data.id ? result.data : r) : [result.data, ...this.routines];
            this.enteringId = result.data.id;
            this.store.setRoutines(next);
          });
          await this.toastCtrl.create({ message: this.translationService.translate('routines.created_msg', { name: result.data.name }), duration: 1200, color: 'success', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
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
          this.zone.run(() => {
            const next = this.routines.map(r => r.id === result.data.id ? result.data : r);
            this.enteringId = result.data.id;
            this.store.setRoutines(next);
          });
          await this.toastCtrl.create({ message: this.translationService.translate('routines.updated_msg', { name: result.data.name }), duration: 1200, color: 'success', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
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
      await this.toastCtrl.create({ message: this.translationService.translate('routines.saved_msg', { name: routine.name }), duration: 1000, color: 'success', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
      await this.loadRoutines();
    } catch (error) {
      console.error('Error saving routine:', error);
    }
  }

  async deleteRoutine(routine: Routine) {
    try {
      this.removingId = routine.id;
      this.loader.show(this.translationService.translate('loader.deleting_routine'));
      await this.storageService.deleteRoutine(routine.id);
      await this.toastCtrl.create({ message: this.translationService.translate('routines.deleted_msg', { name: routine.name }), duration: 1000, color: 'success', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
      const latest = await this.storageService.getRoutines();
      this.store.setRoutines(latest);
      this.loader.hide();
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
    let confirmed = false;
    try {
      confirmed = await this.alerts.confirm({
        header: this.translationService.translate('common.delete'),
        message: this.translationService.translate('routines.delete_confirm'),
        confirmText: this.translationService.translate('common.delete'),
        cancelText: this.translationService.translate('common.cancel')
      });
    } catch {
      confirmed = window.confirm(this.translationService.translate('routines.delete_confirm'));
    }
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
      'Monday': this.translationService.translate('common.mon'),
      'Tuesday': this.translationService.translate('common.tue'),
      'Wednesday': this.translationService.translate('common.wed'),
      'Thursday': this.translationService.translate('common.thu'),
      'Friday': this.translationService.translate('common.fri'),
      'Saturday': this.translationService.translate('common.sat'),
      'Sunday': this.translationService.translate('common.sun')
    };
    return days.map(d => map[d] || d).join(', ');
  }

  getScheduleLabel(routine: Routine): string {
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

  async copyProgramCode() {
    const text = (this.currentProgramCode || '').toString();
    if (!text) return;

    let success = false;
    try {
      await Clipboard.write({ string: text });
      success = true;
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch {
        try {
          const textArea = document.createElement("textarea");
          textArea.value = text;
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
      const msg = lang === 'es' ? `Programa ${text} copiado` : `Program ${text} copied`;
      await this.toastCtrl.create({ message: msg, duration: 1200, color: 'medium', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
    }
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
      const lang = this.translationService.getCurrentLang?.() || 'es';
      const msg = lang === 'es' ? `Rutina ${t} copiada` : `Routine ${t} copied`;
      await this.toastCtrl.create({ message: msg, duration: 1200, color: 'medium', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(tt => tt.present());
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

  enableDragTemporarily(ms: number = 3000) {
    this.dragEnabled = true;
    setTimeout(() => { this.dragEnabled = false; }, ms);
  }

  onTouchStart(ev: TouchEvent) {
    if (this.draggingId) return;
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
    if (this.draggingId) return;
    const t = ev.changedTouches && ev.changedTouches[0];
    if (!t) return;
    let dx = t.clientX - this.touchStartX;
    const dy = t.clientY - this.touchStartY;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      this.swipeHintVisible = true;
      this.swipeHintDirection = dx < 0 ? 'left' : 'right';
      this.swipeHints.show(this.swipeHintDirection);
    } else {
      this.swipeHintVisible = false;
      this.swipeHintDirection = null;
      this.swipeHints.hide();
    }
  }
  onTouchEnd(ev: TouchEvent) {
    if (this.draggingId) return;
    const t = ev.changedTouches && ev.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - this.touchStartX;
    const dy = t.clientY - this.touchStartY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx >= 60 && adx > ady) {
      this.swipeHintVisible = false;
      this.swipeHintDirection = null;
      this.swipeHints.hide(true);
      if (dx < 0) {
        this.router.navigate(['/tabs/weight']);
      } else {
        this.router.navigate(['/tabs/programs']);
      }
      return;
    } else {
      this.swipeHintVisible = false;
      this.swipeHintDirection = null;
      this.swipeHints.hide();
    }
  }

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
  getProgramDescription(name: string | null | undefined): string {
    if (!name) return '';
    const st = this.store.getState();
    const p = (st.programs || []).find(x => x.name === name);
    return p?.description || '';
  }

  toggleDesc() {
    this.descExpanded = !this.descExpanded;
  }
}

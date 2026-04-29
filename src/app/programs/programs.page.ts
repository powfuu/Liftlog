import { Component, OnInit, NgZone, inject } from '@angular/core';
import { Clipboard } from '@capacitor/clipboard';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, IonButton, IonModal, IonToggle, ModalController } from '@ionic/angular/standalone';
import { ToastController } from '@ionic/angular/standalone';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { ProgramModalComponent } from './program-modal/program-modal.component';
import { NotchHeaderComponent } from '../shared/notch-header/notch-header.component';
import { Router, ActivatedRoute } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { LoaderService } from '../services/loader.service';
import { Routine } from '../models/routine.model';
import { addIcons } from 'ionicons';
import { list, add, chevronForward, trash, close, save, albums, calendar, copyOutline, create, power } from 'ionicons/icons';
import { barbell } from 'ionicons/icons';
import { AlertService } from '../services/alert.service';
import { StoreService } from '../services/store.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { TranslationService } from '../services/translation.service';
import { distinctUntilChanged, combineLatest } from 'rxjs';

@Component({
  selector: 'app-programs',
  templateUrl: './programs.page.html',
  styleUrls: ['./programs.page.scss'],
  imports: [CommonModule, FormsModule, IonContent, IonIcon, IonButton, IonModal, IonToggle, NotchHeaderComponent, DragDropModule, TranslatePipe],
})
export class ProgramsPage implements OnInit {
  isLoading = true;
  programs: { name: string; description?: string; routineCount: number; exerciseCount: number; daysPerWeek: number; code?: string; isActive?: boolean }[] = [];
  view: 'programs' | 'routines' = 'programs';
  selectedProgram: string | null = null;
  selectedProgramCode: string | null = null;
  routines: Routine[] = [];
  filteredRoutines: Routine[] = [];
  initialAnimation = false;
  lastAddedProgram: string | null = null;
  deletingPrograms = new Set<string>();
  hoverIndex: number | null = null;
  draggingId: string | null = null;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  swipeTransform = '';
  swipeTransition = '';
  swipeOpacity = 1;
  swipeHintVisible = false;
  swipeHintDirection: 'left'|'right'|null = null;
  staggerState = true;

  private storage = inject(StorageService);
  public router = inject(Router);
  private route = inject(ActivatedRoute);
  private alerts = inject(AlertService);
  private modalController = inject(ModalController);
  private store = inject(StoreService);
  private zone = inject(NgZone);
  private translationService = inject(TranslationService);
  private toastCtrl = inject(ToastController);
  private loader = inject(LoaderService);
  private iconsInit = addIcons({ list, add, chevronForward, trash, close, save, albums, barbell, calendar, copyOutline, create, power });
  private ignoreToggleNames = new Set<string>();
  async onProgramToggle(ev: CustomEvent, name: string, current: boolean) {
    try {
      if (this.ignoreToggleNames.has(name)) return;
      const checked = !!(ev && (ev as any).detail && (ev as any).detail.checked);
      const toggleEl = (ev?.target as any);
      // Revert UI immediately until user confirms
      try {
        this.ignoreToggleNames.add(name);
        if (toggleEl) toggleEl.checked = current;
        setTimeout(() => this.ignoreToggleNames.delete(name), 0);
      } catch {}
      if (current && !checked) {
        const confirmed = await this.alerts.confirm({
          header: this.translationService.translate('programs.disable_confirm_header'),
          message: this.translationService.translate('programs.disable_confirm_msg'),
          confirmText: this.translationService.translate('common.confirm'),
          cancelText: this.translationService.translate('common.cancel'),
          cssClass: 'orange-alert'
        });
        if (!confirmed) {
          const latestPrograms = await this.storage.getPrograms();
          const latestRoutines = await this.storage.getRoutines();
          this.store.setState({ programs: latestPrograms, routines: latestRoutines });
          return;
        }
      }
      const lang = this.translationService.getCurrentLang?.() || 'es';
      const loadingMsg = checked ? (lang === 'es' ? 'Activando programa' : 'Enabling program') : (lang === 'es' ? 'Desactivando programa' : 'Disabling program');
      this.loader.show(loadingMsg);
      await this.storage.setProgramActive(name, checked);
      const latestPrograms = await this.storage.getPrograms();
      const latestRoutines = await this.storage.getRoutines();
      this.store.setState({ programs: latestPrograms, routines: latestRoutines });
      const msg = checked ? this.translationService.translate('common.program_enabled_label') : this.translationService.translate('common.program_disabled_label');
      await this.toastCtrl.create({ message: msg, duration: 1000, position: 'bottom', color: (checked ? 'success' : 'success'), cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
      this.loader.hide();
    } catch {}
  }

  async ngOnInit() {
    this.isLoading = true;
    this.staggerState = true;
    await this.storage.refreshProgramsCache();
    const st = this.store.getState();
    if (st.hydrated && ((st.programs && st.programs.length) || (st.routines && st.routines.length))) {
      try {
        const order = await this.storage.getProgramsOrder();
        const ordered = (Array.isArray(order) && order.length > 0)
          ? [...(st.programs ?? [])].sort((a, b) => {
              const ai = order.indexOf(a.name);
              const bi = order.indexOf(b.name);
              const av = ai >= 0 ? ai : Number.MAX_SAFE_INTEGER;
              const bv = bi >= 0 ? bi : Number.MAX_SAFE_INTEGER;
              return av - bv;
            })
          : (st.programs ?? []);
        this.programs = this.computeProgramsView(ordered, st.routines ?? []);
        this.routines = st.routines ?? [];
        this.finishLoading();
      } catch {
        this.programs = this.computeProgramsView(st.programs ?? [], st.routines ?? []);
        this.routines = st.routines ?? [];
        this.finishLoading();
      }
    } else {
      await this.loadPrograms();
    }
    combineLatest([
      this.store.select(s => s.programs).pipe(distinctUntilChanged()),
      this.store.select(s => s.routines).pipe(distinctUntilChanged())
    ]).pipe(
      distinctUntilChanged(([p1, r1], [p2, r2]) => p1 === p2 && r1 === r2)
    ).subscribe(([programs, routines]) => {
      const prog = programs ?? [];
      const rts = routines ?? [];
      this.storage.getProgramsOrder().then(order => {
        const ordered = (Array.isArray(order) && order.length > 0)
          ? [...prog].sort((a, b) => {
              const ai = order.indexOf(a.name);
              const bi = order.indexOf(b.name);
              const av = ai >= 0 ? ai : Number.MAX_SAFE_INTEGER;
              const bv = bi >= 0 ? bi : Number.MAX_SAFE_INTEGER;
              return av - bv;
            })
          : prog;
        this.programs = this.computeProgramsView(ordered, rts);
        this.routines = rts;
      }).catch(() => {
        this.programs = this.computeProgramsView(prog, rts);
        this.routines = rts;
      });
    });
    this.route.queryParamMap.subscribe(async params => {
      const v = (params.get('view') as 'programs'|'routines') || 'programs';
      const p = params.get('program');
      this.view = v;
      this.selectedProgram = p;
      try { const prog = this.programs.find(x => x.name === p); this.selectedProgramCode = prog?.code || null; } catch { this.selectedProgramCode = null; }
      if (v === 'routines') {
        await this.loadRoutinesForProgram(p);
        this.initialAnimation = false;
      }
    });
  }

  async ionViewWillEnter() {
    await this.storage.refreshProgramsCache();
    const st = this.store.getState();
    if (st.hydrated && ((st.programs && st.programs.length) || (st.routines && st.routines.length))) {
      try {
        const order = await this.storage.getProgramsOrder();
        const ordered = (Array.isArray(order) && order.length > 0)
          ? [...(st.programs ?? [])].sort((a, b) => {
              const ai = order.indexOf(a.name);
              const bi = order.indexOf(b.name);
              const av = ai >= 0 ? ai : Number.MAX_SAFE_INTEGER;
              const bv = bi >= 0 ? bi : Number.MAX_SAFE_INTEGER;
              return av - bv;
            })
          : (st.programs ?? []);
        this.programs = this.computeProgramsView(ordered, st.routines ?? []);
        this.routines = st.routines ?? [];
        this.finishLoading();
        return;
      } catch {
        this.programs = this.computeProgramsView(st.programs ?? [], st.routines ?? []);
        this.routines = st.routines ?? [];
        this.finishLoading();
        return;
      }
    }
    this.isLoading = true;
    await this.loadPrograms();
  }

  finishLoading() {
    this.isLoading = false;
    setTimeout(() => {
      this.staggerState = false;
    }, 1200);
  }

  async loadPrograms() {
    try {
      const [savedPrograms, routines] = await Promise.all([
        this.storage.getPrograms(),
        this.storage.getRoutines()
      ]);
      const order = await this.storage.getProgramsOrder();
      const orderedSaved = (Array.isArray(order) && order.length > 0)
        ? [...savedPrograms].sort((a, b) => {
            const ai = order.indexOf(a.name);
            const bi = order.indexOf(b.name);
            const av = ai >= 0 ? ai : Number.MAX_SAFE_INTEGER;
            const bv = bi >= 0 ? bi : Number.MAX_SAFE_INTEGER;
            return av - bv;
          })
        : savedPrograms;
      this.programs = this.computeProgramsView(orderedSaved, routines);
      this.routines = routines;
      this.store.setRoutines(routines);
      (this.store as any).setPrograms && (this.store as any).setPrograms(savedPrograms);
    } finally {
      this.finishLoading();
      this.initialAnimation = false;
    }
  }

  openProgram(name: string) {
    this.view = 'routines';
    this.selectedProgram = name;
    try { const prog = this.programs.find(p => p.name === name); this.selectedProgramCode = prog?.code || null; } catch { this.selectedProgramCode = null; }
    const fast = this.routines ?? [];
    this.filteredRoutines = fast.filter(r => r.programName === name);
    this.isLoading = false;
    this.router.navigate(['/tabs/programs/routines'], { queryParams: { program: name, view: 'routines' }, replaceUrl: true });
  }

  async copyProgramCode(code?: string | null) {
    const text = (code ?? '').toString();
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
      this.toastCtrl.create({ message: msg, duration: 1200, color: 'medium', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
    }
  }
  copySelectedProgramCode() { this.copyProgramCode(this.selectedProgramCode); }

  async openEditProgram(name: string) {
    try {
      const prog = this.programs.find(p => p.name === name);
      const modal = await this.modalController.create({
        component: ProgramModalComponent,
        cssClass: 'program-modal-floating',
        componentProps: { mode: 'manual', initialName: name, initialDescription: prog?.description || '', editing: true }
      });
      modal.onDidDismiss().then(async (result) => {
        if (result.data && result.data.name) {
          const newName: string = (result.data.name || '').trim();
          const newDesc: string = (result.data.description || '').trim();
          if (!newName) return;
          this.loader.show(this.translationService.translate('loader.updating_program'));
          await this.storage.updateProgramNameAndDescription(name, newName, newDesc || undefined);
          await this.loadPrograms();
          const lang = this.translationService.getCurrentLang?.() || 'es';
          const msg = lang === 'es' ? `Programa actualizado` : `Program updated`;
          await this.toastCtrl.create({ message: msg, duration: 1200, color: 'success', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
          this.loader.hide();
        }
      });
      await modal.present();
    } catch {}
  }

  async openCreateProgram() {
    try {
      const modal = await this.modalController.create({
        component: ProgramModalComponent,
        cssClass: 'program-modal-floating'
      });
      modal.onDidDismiss().then(async (result) => {
        if (result.data && result.data.importCode) {
          this.loader.show(this.translationService.translate('loader.importing_program'));
          try {
            const importedName = await this.storage.importProgramByCode(result.data.importCode);
            if (!importedName) {
              this.loader.hide();
              await this.toastCtrl.create({ message: this.translationService.translate('programs.invalid_code') || 'Código de programa inválido', duration: 1600, color: 'danger', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
              return;
            }
            await this.loadPrograms();
            this.view = 'programs';
            const lang = this.translationService.getCurrentLang?.() || 'es';
            const msg = lang === 'es' ? `Programa ${importedName} importado` : `Program ${importedName} imported`;
            await this.toastCtrl.create({ message: msg, duration: 1200, color: 'success', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
            this.loader.hide();
          } catch {
            this.loader.hide();
            await this.toastCtrl.create({ message: this.translationService.translate('common.error') || 'Error al importar programa', duration: 1600, color: 'danger', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
          }
        } else if (result.data && result.data.name) {
          this.loader.show(this.translationService.translate('loader.creating_program'));
          await this.storage.saveProgram({ name: result.data.name, description: result.data.description });
          const latestPrograms = await this.storage.getPrograms();
          const latestRoutines = await this.storage.getRoutines();
          this.store.setState({ programs: latestPrograms, routines: latestRoutines });
          this.lastAddedProgram = result.data.name;
          await this.storage.saveProgramsOrder(latestPrograms.map(p => p.name));
          await this.toastCtrl.create({ message: this.translationService.translate('programs.created_msg', { name: result.data.name }), duration: 1200, color: 'success', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
          setTimeout(() => { this.lastAddedProgram = null; }, 700);
          this.loader.hide();
        }
      });
      await modal.present();
    } catch (error) {
      console.error('Error opening create program modal:', error);
    }
  }

  async toggleProgramActive(name: string, current: boolean) {
    try {
      if (current) {
        const confirmed = await this.alerts.confirm({
          header: this.translationService.translate('programs.disable_confirm_header'),
          message: this.translationService.translate('programs.disable_confirm_msg'),
          confirmText: this.translationService.translate('common.confirm'),
          cancelText: this.translationService.translate('common.cancel'),
          cssClass: 'orange-alert'
        });
        if (!confirmed) return;
      }
      const lang = this.translationService.getCurrentLang?.() || 'es';
      const loadingMsg = !current ? (lang === 'es' ? 'Activando programa' : 'Enabling program') : (lang === 'es' ? 'Desactivando programa' : 'Disabling program');
      this.loader.show(loadingMsg);
      await this.storage.setProgramActive(name, !current);
      const latestPrograms = await this.storage.getPrograms();
      const latestRoutines = await this.storage.getRoutines();
      this.store.setState({ programs: latestPrograms, routines: latestRoutines });
      const msg = !current ? this.translationService.translate('common.program_enabled_label') : this.translationService.translate('common.program_disabled_label');
      await this.toastCtrl.create({ message: msg, duration: 1000, position: 'bottom', color: (!current ? 'success' : 'success'), cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
      this.loader.hide();
    } catch {}
  }

  async onDeleteProgram(name: string, ev?: Event) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    let confirmed = false;
    try {
      confirmed = await this.alerts.confirm({
        header: this.translationService.translate('common.delete'),
        message: this.translationService.translate('programs.delete_confirm'),
        confirmText: this.translationService.translate('common.delete'),
        cancelText: this.translationService.translate('common.cancel')
      });
    } catch {
      confirmed = window.confirm(this.translationService.translate('programs.delete_confirm'));
    }
    if (!confirmed) return;
    this.loader.show(this.translationService.translate('loader.deleting_program'));
    await this.storage.deleteProgram(name);
    this.zone.run(async () => {
      await this.toastCtrl.create({ message: this.translationService.translate('programs.deleted_msg', { name }), duration: 1200, color: 'success', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
      this.deletingPrograms.add(name);
      if (this.view === 'routines' && this.selectedProgram === name) {
        this.selectedProgram = null;
        this.view = 'programs';
        this.router.navigate(['/tabs/programs']);
      }
      setTimeout(async () => {
        this.programs = this.programs.filter(p => p.name !== name);
        const latestPrograms = await this.storage.getPrograms();
        const latestRoutinesAfterDelete = await this.storage.getRoutines();
        this.store.setState({ programs: latestPrograms, routines: latestRoutinesAfterDelete });
        await this.storage.saveProgramsOrder(latestPrograms.map(p => p.name));
        this.deletingPrograms.delete(name);
        this.loader.hide();
      }, 280);
    });
  }

  private async loadRoutinesForProgram(program: string | null) {
    if ((this.routines && this.routines.length)) {
      this.isLoading = false;
      this.filteredRoutines = program ? this.routines.filter(r => r.programName === program) : this.routines;
      return;
    }
    this.isLoading = true;
    try {
      this.routines = await this.storage.getRoutines();
      this.filteredRoutines = program ? this.routines.filter(r => r.programName === program) : this.routines;
    } finally {
      this.isLoading = false;
    }
  }

  trackByRoutineId(index: number, r: Routine): string { return r.id; }
  trackByProgramName(index: number, p: { name: string; description?: string; routineCount: number; exerciseCount: number; daysPerWeek: number; code?: string; isActive?: boolean }): string { return p.name; }

  dropPrograms(event: CdkDragDrop<{ name: string; description?: string; routineCount: number; exerciseCount: number; daysPerWeek: number }[]>) {
    const from = event.previousIndex;
    const to = (this.hoverIndex ?? event.currentIndex);
    if (from === to) { this.hoverIndex = null; return; }
    const next = [...this.programs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.programs = next;
    this.hoverIndex = null;
    const plain = this.programs.map(p => ({ name: p.name, description: p.description }));
    this.storage.saveProgramsList(plain).catch(() => {});
    this.storage.saveProgramsOrder(this.programs.map(p => p.name)).catch(() => {});
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
      dx = Math.max(-60, Math.min(60, dx));
      this.swipeTransform = `translateX(${dx}px)`;
      const fade = Math.min(0.12, Math.abs(dx) / 500);
      this.swipeOpacity = 1 - fade;
      this.swipeHintVisible = true;
      this.swipeHintDirection = dx < 0 ? 'left' : 'right';
    } else {
      this.swipeTransform = '';
      this.swipeOpacity = 1;
      this.swipeHintVisible = false;
      this.swipeHintDirection = null;
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
      this.swipeTransition = 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1), opacity 240ms cubic-bezier(0.16, 1, 0.3, 1)';
      this.swipeTransform = dx < 0 ? 'translateX(-80px)' : 'translateX(80px)';
      this.swipeOpacity = 0;
      this.swipeHintVisible = false;
      this.swipeHintDirection = null;
      setTimeout(() => {
        if (this.view === 'programs') {
          if (dx < 0) {
            this.router.navigate(['/tabs/tracking']);
          } else {
            this.router.navigate(['/tabs/home']);
          }
        } else {
          if (dx < 0) {
            this.router.navigate(['/tabs/tracking']);
          } else {
            this.router.navigate(['/tabs/programs']);
          }
        }
      }, 140);
      return;
    } else {
      this.swipeTransition = 'transform 220ms ease, opacity 220ms ease';
      this.swipeTransform = 'translateX(0)';
      this.swipeOpacity = 1;
      this.swipeHintVisible = false;
      this.swipeHintDirection = null;
      setTimeout(() => { this.swipeTransition = ''; this.swipeTransform = ''; }, 240);
    }
  }

  private computeProgramsView(savedPrograms: { name: string; description?: string; code?: string }[], routines: Routine[]): { name: string; description?: string; routineCount: number; exerciseCount: number; daysPerWeek: number; code?: string; isActive?: boolean }[] {
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
    return savedPrograms.map((p: any) => ({
      name: p.name,
      description: p.description,
      routineCount: routineCounts.get(p.name) || 0,
      exerciseCount: exerciseCounts.get(p.name) || 0,
      daysPerWeek: (daysSets.get(p.name)?.size) || 0,
      code: (p as any).code,
      isActive: (p.isActive !== false)
    }));
  }

  private updateProgramStats(routines: Routine[]) {}
}

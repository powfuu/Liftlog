import { Component, OnInit, ElementRef, ViewChild, AfterViewInit, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { createGesture } from '@ionic/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, chevronForward, chevronBack, informationCircle, globe, checkmark, barbell, statsChart, flame, calendar, body, logoGoogle, helpCircle, peopleCircle, person } from 'ionicons/icons';
import { StoreService } from '../../services/store.service';
import { StorageService } from '../../services/storage.service';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { TranslationService } from '../../services/translation.service';
import { UserWeightLog } from '../../models/weight.model';
import { SupabaseService } from '../../services/supabase.service';
import { LoaderService } from '../../services/loader.service';
import { CoachModeService } from '../../services/coach-mode.service';

@Component({
  selector: 'app-onboarding-modal',
  templateUrl: './onboarding-modal.component.html',
  styleUrls: ['./onboarding-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, TranslatePipe]
})
export class OnboardingModalComponent implements OnInit, AfterViewInit {
  step: number = -1;
  animationState: 'entering' | 'entered' | 'exiting' = 'entering';
  language: 'en' | 'es' | 'de' | 'ko' = 'en';
  stepTransition: '' | 'left' | 'right' = '';
  metricsAnimated = false;
  totalRoutines = 0;
  totalExercises = 0;
  streakDays = 0;
  metricsTimer: any;
  initialWeight: number | null = null;
  weightUnit: 'kg' | 'lb' = 'kg';
  accountMode: 'personal' | 'coach' = 'personal';
  private hasSavedInitialWeight = false;
  private isCompleting = false;
  @ViewChild('viewport') viewportRef?: ElementRef<HTMLDivElement>;
  imgLeft = 'https://images.pexels.com/photos/18060023/pexels-photo-18060023.jpeg?_gl=1*jtx3bt*_ga*MTUwNTY4MTM1LjE3NjQ1MjEzNjA.*_ga_8JE65Q40S6*czE3NjQ1MjEzNTkkbzEkZzEkdDE3NjQ1MjE1NDMkajYwJGwwJGgw';
  imgCenter = 'https://images.pexels.com/photos/31849599/pexels-photo-31849599.jpeg?_gl=1*1sfsmns*_ga*MTI0MjAwNzEzOS4xNzY0NTIyMzM2*_ga_8JE65Q40S6*czE3NjQ1MjIzMzYkbzEkZzEkdDE3NjQ1MjM0OTYkajckbDAkaDA.';
  imgRight = 'https://images.pexels.com/photos/5327534/pexels-photo-5327534.jpeg?_gl=1*107su3t*_ga*MTI0MjAwNzEzOS4xNzY0NTIyMzM2*_ga_8JE65Q40S6*czE3NjQ1MjIzMzYkbzEkZzEkdDE3NjQ1MjI0NTgkajEyJGwwJGgw';
  private swipeGesture?: any;
  showSplash = true;
  isAuthenticated = false;
  cardPng1 = 'assets/onboarding_01.png';
  cardPng2 = 'assets/onboarding_02.png';
  cardPng3 = 'assets/onboarding_03.png';

  formatSubtitle(txt: string): SafeHtml {
    const red = 'color:#dc2626;font-weight:900';
    const html = txt
      .replace(/who\strain/gi, `<span style="${red}">$&</span>`)
      .replace(/trainers/gi, `<span style="${red}">$&</span>`)
      .replace(/entrenan/gi, `<span style="${red}">$&</span>`)
      .replace(/entrenadores/gi, `<span style="${red}">$&</span>`);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private storage = inject(StorageService);
  private store = inject(StoreService);
  private router = inject(Router);
  private translationService = inject(TranslationService);
  private supabase = inject(SupabaseService);
  private coachMode = inject(CoachModeService);
  private sanitizer = inject(DomSanitizer);
  private loader = inject(LoaderService);
  private iconsInit = addIcons({ body, close, chevronForward, chevronBack, informationCircle, globe, checkmark, barbell, statsChart, flame, calendar, logoGoogle, helpCircle, 'people-circle': peopleCircle, person });

  get isValidWeight(): boolean {
    return !!(this.initialWeight && this.initialWeight > 0);
  }

  async ngOnInit() {
    // icons registered in field initializer to avoid race with IonIcon connectedCallback
    this.translationService.lang$.subscribe(lang => {
      this.language = lang;
    });
    this.preloadImages();
    try { localStorage.removeItem('postLoginGoHome'); } catch {}

    // Start with splash visible (loader)
    this.showSplash = true;
    this.step = 0;
    this.animationState = 'entered';

    this.isAuthenticated = await this.supabase.isAuthenticated();

    // Check if we should redirect to home
    let shouldGoHome = false;
    const localDone = await this.storage.getOnboardingCompleted().catch(() => false);

    if (this.isAuthenticated) {
      try {
        const doneRemote = await this.supabase.hasCompletedOnboarding();
        if (doneRemote) {
          shouldGoHome = true;
          // Sync local state if needed
          if (!localDone) { try { await this.storage.setOnboardingCompleted(true); } catch {} }
        } else {
          // Remote says not done. If local says done, it's likely leftover from another user -> clear it
          if (localDone) { try { await this.storage.setOnboardingCompleted(false); } catch {} }
        }
      } catch (e) {
        // If remote check fails (e.g. offline), fallback to local state
        if (localDone) shouldGoHome = true;
      }

      try {
        const prof = await this.coachMode.getUserProfile();
        if (prof && (prof.mode === 'coach' || prof.mode === 'personal')) {
          this.accountMode = prof.mode;
        }
      } catch {}
    }
    // Removed 'else' block to prevent unauthenticated users from bypassing onboarding based on local state

    if (shouldGoHome) {
      this.router.navigate(['/tabs/home'], { replaceUrl: true });
    } else {
      // Stay on onboarding, hide splash
      setTimeout(() => {
        this.showSplash = false;
      }, 800);
    }

    // React to auth completion to close modal state and enable navigation
    try {
      this.supabase.getSignedIn$().subscribe(async (ok: boolean) => {
        if (ok) {
          this.isAuthenticated = true;
          // Keep user in step 1; allow swipe and buttons
          this.swipeGesture?.enable(true);
          this.showSplash = false;

          // Check if user has already completed onboarding (e.g. existing user logging in)
          const doneRemote = await this.supabase.hasCompletedOnboarding().catch(() => false);
          if (doneRemote) {
            await this.storage.setOnboardingCompleted(true);
            this.router.navigate(['/tabs/home'], { replaceUrl: true });
            return;
          }

          // No forzar cambio de sección al autenticarse
          try { await this.supabase.ensureUserProfile(); } catch {}
          try { await this.coachMode.ensureUserId7Digit(); } catch {}
          try {
            const pending = localStorage.getItem('pendingAccountMode');
            if (pending === 'coach' || pending === 'personal') {
              this.accountMode = pending as any;
              await this.coachMode.setCoachMode(pending === 'coach');
              localStorage.removeItem('pendingAccountMode');
            }
          } catch {}
        }
      });
    } catch {}
  }

  setLanguage(lang: 'en' | 'es' | 'de' | 'ko') {
    this.store.setLanguage(lang);
    if (this.isAuthenticated) {
      this.supabase.upsertProfile({ language: lang });
    }
  }

  setUnit(unit: 'kg' | 'lb') {
    if (this.weightUnit === unit) return;
    this.weightUnit = unit;
    if (this.initialWeight && this.initialWeight > 0) {
      if (unit === 'kg') {
        // lb -> kg
        this.initialWeight = parseFloat((this.initialWeight / 2.20462).toFixed(1));
      } else {
        // kg -> lb
        this.initialWeight = parseFloat((this.initialWeight * 2.20462).toFixed(1));
      }
    }
    if (this.isAuthenticated) {
      this.supabase.upsertProfile({ initial_weight_unit: this.weightUnit });
    }
  }

  async selectAccountMode(mode: 'personal' | 'coach') {
    if (this.accountMode === mode) return;
    this.accountMode = mode;
    try {
      if (this.isAuthenticated) {
        await this.coachMode.setCoachMode(mode === 'coach');
      } else {
        localStorage.setItem('pendingAccountMode', mode);
      }
    } catch {}
  }

  next() {
    if (!this.isAuthenticated) return;
    if (this.step < 2) {
      if (this.step === 1 && (!this.initialWeight || this.initialWeight <= 0)) return;
      this.scrollToIndex(this.step + 1);
    }
  }
  prev() {
    if (this.step > 0) {
      this.scrollToIndex(this.step - 1);
    }
  }

  async onScroll() {
    const el = this.viewportRef?.nativeElement; if (!el) return;
    const vw = el.offsetWidth || 1;
    const idx = Math.round(el.scrollLeft / vw);
    if (!this.isAuthenticated && idx > 0) {
      el.scrollTo({ left: 0, behavior: 'auto' });
      this.step = 0;
      return;
    }
    if (idx !== this.step) {
      this.stepTransition = idx > this.step ? 'right' : 'left';
      this.step = idx;
      setTimeout(() => { this.stepTransition = ''; }, 250);
      if (this.step === 2 && !this.metricsAnimated) { this.startMetricsAnimation(); }
      if (this.step === 2 && this.isAuthenticated && this.isValidWeight && !this.hasSavedInitialWeight) {
        try {
          await this.supabase.upsertProfile({ language: this.language, initial_weight_unit: this.weightUnit });
          const saved = await this.supabase.addWeightLog(this.initialWeight!, this.weightUnit, new Date());
          const log: UserWeightLog = { id: saved.id, date: saved.date, weight: saved.weight, unit: saved.unit, createdAt: saved.date };
          this.store.addUserWeightLog(log);
          this.hasSavedInitialWeight = true;
        } catch {}
      }
    }
  }

  ngAfterViewInit() {
    const el = this.viewportRef?.nativeElement; if (!el) return;
    this.swipeGesture = createGesture({
      el,
      gestureName: 'onboard-swipe',
      threshold: 15,
      direction: 'x',
      onEnd: (ev: any) => {
        const d = ev.deltaX || 0;
        if (Math.abs(d) > 60) {
            if (d < 0) {
                // Next
                if (this.step === 1 && (!this.initialWeight || this.initialWeight <= 0)) return;
                this.next();
            } else {
                // Prev
                this.prev();
            }
        }
      }
    });
    this.swipeGesture.enable(this.isAuthenticated);
  }

  scrollToIndex(idx: number) {
    const el = this.viewportRef?.nativeElement; if (!el) return;
    if (!this.isAuthenticated && idx > 0) return;
    const vw = el.offsetWidth || 1;
    el.scrollTo({ left: idx * vw, behavior: 'smooth' });
  }

  onCardError(_ev: Event) {}

  private startMetricsAnimation() {
    this.metricsAnimated = true;
    let r = 0, e = 0, s = 0;
    this.metricsTimer = setInterval(() => {
      if (r < 6) r += 1;
      if (e < 24) e += 2;
      if (s < 7) s += 1;
      this.totalRoutines = r;
      this.totalExercises = e;
      this.streakDays = s;
      if (r >= 6 && e >= 24 && s >= 7) { clearInterval(this.metricsTimer); this.metricsTimer = null; }
    }, 120);
  }

  private preloadImages() {
    const urls = [this.imgLeft, this.imgCenter, this.imgRight];
    urls.forEach((u, i) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.src = u;
      } catch {}
    });
  }

  async complete() {
    if (this.isCompleting) return;
    this.isCompleting = true;
    try {
      this.loader.show(this.translationService.translate('loader.completing_onboarding'));
      if (this.isAuthenticated) {
        await this.supabase.upsertProfile({ language: this.language, initial_weight_unit: this.weightUnit });
        if (this.initialWeight && this.initialWeight > 0 && !this.hasSavedInitialWeight) {
          const saved = await this.supabase.addWeightLog(this.initialWeight, this.weightUnit, new Date());
          const log: UserWeightLog = { id: saved.id, date: saved.date, weight: saved.weight, unit: saved.unit, createdAt: saved.date };
          this.store.addUserWeightLog(log);
          this.hasSavedInitialWeight = true;
        }
        try { await this.supabase.setOnboardingCompleted(true); } catch {}
        try { await this.coachMode.ensureUserId7Digit(); } catch {}
      }
      try { await this.storage.setOnboardingCompleted(true); } catch {}
      this.animationState = 'exiting';
      setTimeout(() => this.router.navigate(['/tabs/home'], { replaceUrl: true }), 200);
      this.loader.hide();
    } catch {
      this.isCompleting = false;
      try { this.loader.hide(); } catch {}
      try { await this.storage.setOnboardingCompleted(true); } catch {}
      try { this.router.navigate(['/tabs/home'], { replaceUrl: true }); } catch {}
    }
  }

  dismiss() {}

  async signInWithGoogle() {
    try {
      this.loader.show(this.translationService.translate('loader.connecting_google'));
      await this.supabase.signInWithGoogle();
      this.isAuthenticated = await this.supabase.isAuthenticated();
      const prof = await this.supabase.getProfile();
      if (!prof) await this.supabase.upsertProfile({});
      try { await this.supabase.ensureUserProfile(); } catch {}
      try { await this.coachMode.ensureUserId7Digit(); } catch {}
      this.loader.hide();
      // Permanecer en la sección 1; no deslizar automáticamente
    } catch {}
  }
}

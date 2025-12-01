import { Component, OnInit, ElementRef, ViewChild, AfterViewInit, inject } from '@angular/core';
import { createGesture } from '@ionic/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, chevronForward, chevronBack, informationCircle, globe, checkmark, barbell, statsChart, flame, calendar } from 'ionicons/icons';
import { StorageService } from '../../services/storage.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-onboarding-modal',
  templateUrl: './onboarding-modal.component.html',
  styleUrls: ['./onboarding-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon]
})
export class OnboardingModalComponent implements OnInit, AfterViewInit {
  step: number = -1;
  animationState: 'entering' | 'entered' | 'exiting' = 'entering';
  language: 'en' | 'es' = 'en';
  stepTransition: '' | 'left' | 'right' = '';
  metricsAnimated = false;
  totalRoutines = 0;
  totalExercises = 0;
  streakDays = 0;
  metricsTimer: any;
  @ViewChild('viewport') viewportRef?: ElementRef<HTMLDivElement>;
  imgLeft = 'https://images.pexels.com/photos/18060023/pexels-photo-18060023.jpeg?_gl=1*jtx3bt*_ga*MTUwNTY4MTM1LjE3NjQ1MjEzNjA.*_ga_8JE65Q40S6*czE3NjQ1MjEzNTkkbzEkZzEkdDE3NjQ1MjE1NDMkajYwJGwwJGgw';
  imgCenter = 'https://images.pexels.com/photos/31849599/pexels-photo-31849599.jpeg?_gl=1*1sfsmns*_ga*MTI0MjAwNzEzOS4xNzY0NTIyMzM2*_ga_8JE65Q40S6*czE3NjQ1MjIzMzYkbzEkZzEkdDE3NjQ1MjM0OTYkajckbDAkaDA.';
  imgRight = 'https://images.pexels.com/photos/5327534/pexels-photo-5327534.jpeg?_gl=1*107su3t*_ga*MTI0MjAwNzEzOS4xNzY0NTIyMzM2*_ga_8JE65Q40S6*czE3NjQ1MjIzMzYkbzEkZzEkdDE3NjQ1MjI0NTgkajEyJGwwJGgw';
  private swipeGesture?: any;
  showSplash = true;

  private storage = inject(StorageService);
  private router = inject(Router);

  async ngOnInit() {
    addIcons({ close, chevronForward, chevronBack, informationCircle, globe, checkmark, barbell, statsChart, flame, calendar });
    const lang = await this.storage.getLanguage();
    this.language = lang || 'en';
    this.preloadImages();
    setTimeout(() => {
      this.showSplash = false;
      this.step = 0;
      this.animationState = 'entered';
    }, 2500);
  }

  setLanguage(lang: 'en' | 'es') { this.language = lang; }
  next() {
    if (this.step < 2) {
      this.scrollToIndex(this.step + 1);
    }
  }
  prev() {
    if (this.step > 0) {
      this.scrollToIndex(this.step - 1);
    }
  }

  onScroll() {
    const el = this.viewportRef?.nativeElement; if (!el) return;
    const vw = el.offsetWidth || 1;
    const idx = Math.round(el.scrollLeft / vw);
    if (idx !== this.step) {
      this.stepTransition = idx > this.step ? 'right' : 'left';
      this.step = idx;
      setTimeout(() => { this.stepTransition = ''; }, 250);
      if (this.step === 2 && !this.metricsAnimated) { this.startMetricsAnimation(); }
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
        if (Math.abs(d) > 60) { if (d < 0) this.next(); else this.prev(); }
      }
    });
    this.swipeGesture.enable(true);
  }

  scrollToIndex(idx: number) {
    const el = this.viewportRef?.nativeElement; if (!el) return;
    const vw = el.offsetWidth || 1;
    el.scrollTo({ left: idx * vw, behavior: 'smooth' });
  }

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
    await this.storage.setLanguage(this.language);
    await this.storage.setOnboardingCompleted(true);
    this.animationState = 'exiting';
    setTimeout(() => this.router.navigate(['/tabs/home']), 300);
  }

  dismiss() {}
}

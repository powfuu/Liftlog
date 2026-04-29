import { Component, OnInit, AfterViewInit, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, ModalController, GestureController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, settings, globe, person, people, sunny, moon, contrastOutline, peopleCircleOutline, notifications, notificationsOutline, informationCircle, informationCircleOutline, chevronUpOutline, chevronDownOutline } from 'ionicons/icons';
import { TranslationService } from '../../services/translation.service';
import { StoreService } from '../../services/store.service';
import { SupabaseService } from '../../services/supabase.service';
import { CoachModeService } from '../../services/coach-mode.service';
import { ThemeService } from '../../services/theme.service';
import { LoaderService } from '../../services/loader.service';
import { NotificationService } from '../../services/notification.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-settings-modal',
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, IonIcon, TranslatePipe]
})
export class SettingsModalComponent implements OnInit, AfterViewInit {
  theme: 'dark' | 'light' = 'dark';
  language: 'es' | 'en' | 'de' | 'ko' = 'es';
  isCoachMode = false;
  saving = false;
  animationState: 'entering' | 'entered' | 'exiting' = 'entering';
  notifHour = 12;
  notifMinute = 0;
  pickerHourDir: 'up' | 'down' | '' = '';
  pickerMinuteDir: 'up' | 'down' | '' = '';
  readonly minuteSteps = [0,5,10,15,20,25,30,35,40,45,50,55];
  private _notifSaveTimer: any = null;

  get prevHourVal() { return (this.notifHour - 1 + 24) % 24; }
  get nextHourVal() { return (this.notifHour + 1) % 24; }
  get minuteIndex() { const i = this.minuteSteps.indexOf(this.notifMinute); return i >= 0 ? i : 0; }
  get prevMinuteVal() { return this.minuteSteps[(this.minuteIndex - 1 + this.minuteSteps.length) % this.minuteSteps.length]; }
  get nextMinuteVal() { return this.minuteSteps[(this.minuteIndex + 1) % this.minuteSteps.length]; }
  padHour(h: number) { return String(h).padStart(2, '0'); }
  padMinute(m: number) { return String(m).padStart(2, '0'); }

  private modalController = inject(ModalController);
  private themeService = inject(ThemeService);
  private translations = inject(TranslationService);
  private store = inject(StoreService);
  private supabase = inject(SupabaseService);
  private coachModeService = inject(CoachModeService);
  private loader = inject(LoaderService);
  private gestureCtrl = inject(GestureController);
  private el = inject(ElementRef);
  private notifications = inject(NotificationService);

  constructor() {
    addIcons({ close, settings, globe, person, people, sunny, moon, contrastOutline, peopleCircleOutline, notifications, notificationsOutline, informationCircle, informationCircleOutline, chevronUpOutline, chevronDownOutline });
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
          setTimeout(() => { this.el.nativeElement.style.transition = ''; }, 300);
        }
      }
    });
    gesture.enable();
  }

  async ngOnInit() {
    try { this.theme = this.themeService.getCurrentTheme(); } catch { this.theme = 'dark'; }
    this.language = this.translations.getCurrentLang();
    this.isCoachMode = this.coachModeService.isCoachMode;
    try { this.notifHour = await this.notifications.getNotificationHour(); } catch {}
    try { this.notifMinute = await this.notifications.getNotificationMinute(); } catch {}
    setTimeout(() => { this.animationState = 'entered'; }, 0);
  }

  async setTheme(theme: 'dark' | 'light') {
    if (this.theme === theme) return;
    this.theme = theme;
    try { await this.themeService.setTheme(theme); } catch {}
  }

  async setLanguage(lang: 'es' | 'en' | 'de' | 'ko') {
    this.language = lang;
    try {
      this.store.setLanguage(lang);
      await this.supabase.upsertProfile({ language: lang });
    } catch {}
  }

  async selectMode(mode: 'personal' | 'coach') {
    const enabled = mode === 'coach';
    if (this.isCoachMode === enabled) return;
    this.saving = true;
    try { this.loader.show(); } catch {}
    try {
      await this.coachModeService.setCoachMode(enabled);
      this.isCoachMode = enabled;
    } catch (error) {
      console.error('Error updating coach mode:', error);
    } finally {
      this.saving = false;
      try { this.loader.hide(); } catch {}
    }
  }

  prevHour() { this._stepHour(-1); this._animate('hour', 'down'); this.scheduleNotifSave(); }
  nextHour() { this._stepHour(1);  this._animate('hour', 'up');   this.scheduleNotifSave(); }
  prevMinute() { this._stepMinute(-1); this._animate('minute', 'down'); this.scheduleNotifSave(); }
  nextMinute() { this._stepMinute(1);  this._animate('minute', 'up');   this.scheduleNotifSave(); }

  private _stepHour(delta: number) {
    this.notifHour = ((this.notifHour + delta) + 24) % 24;
  }
  private _stepMinute(delta: number) {
    const idx = ((this.minuteIndex + delta) + this.minuteSteps.length) % this.minuteSteps.length;
    this.notifMinute = this.minuteSteps[idx];
  }
  private _animate(col: 'hour' | 'minute', dir: 'up' | 'down') {
    if (col === 'hour') {
      this.pickerHourDir = '';
      requestAnimationFrame(() => { this.pickerHourDir = dir; setTimeout(() => { this.pickerHourDir = ''; }, 320); });
    } else {
      this.pickerMinuteDir = '';
      requestAnimationFrame(() => { this.pickerMinuteDir = dir; setTimeout(() => { this.pickerMinuteDir = ''; }, 320); });
    }
  }

  private _touchStartY = 0;
  private _touchStartHour = 0;
  private _touchStartMinIdx = 0;
  private _lastLiveSteps = 0;

  onPickerTouchStart(e: TouchEvent) {
    this._touchStartY = e.touches[0].clientY;
    this._lastLiveSteps = 0;
    this._touchStartHour = this.notifHour;
    this._touchStartMinIdx = this.minuteIndex;
  }

  onPickerTouchMove(e: TouchEvent, col: 'hour' | 'minute') {
    e.preventDefault();
    const dy = e.touches[0].clientY - this._touchStartY;
    const steps = Math.round(dy / 38);
    if (steps === this._lastLiveSteps) return;
    this._lastLiveSteps = steps;
    if (col === 'hour') {
      this.notifHour = ((this._touchStartHour + steps) % 24 + 24) % 24;
    } else {
      const len = this.minuteSteps.length;
      this.notifMinute = this.minuteSteps[((this._touchStartMinIdx + steps) % len + len) % len];
    }
  }

  onPickerTouchEnd(e: TouchEvent, col: 'hour' | 'minute') {
    if (this._lastLiveSteps !== 0) {
      this.scheduleNotifSave();
    }
    this._lastLiveSteps = 0;
  }

  private scheduleNotifSave() {
    clearTimeout(this._notifSaveTimer);
    this._notifSaveTimer = setTimeout(async () => {
      try { await this.notifications.setNotificationTime(this.notifHour, this.notifMinute); } catch {}
    }, 600);
  }

  formatHour(h: number): string {
    if (h === 0) return '12 AM';
    if (h === 12) return '12 PM';
    if (h < 12) return `${h} AM`;
    return `${h - 12} PM`;
  }

  formatTime(h: number, m: number): string {
    const ampm = h < 12 ? 'AM' : 'PM';
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  async dismiss() {
    await this.modalController.dismiss();
  }
}

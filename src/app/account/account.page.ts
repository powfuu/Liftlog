import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { Clipboard } from '@capacitor/clipboard';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { copyOutline, checkmark, helpCircle, personCircle, settingsOutline } from 'ionicons/icons';
import { SupabaseService } from '../services/supabase.service';
import { LoaderService } from '../services/loader.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { CoachModeService } from '../services/coach-mode.service';
import { StoreService } from '../services/store.service';
import { SettingsModalComponent } from './settings-modal/settings-modal.component';

@Component({
  selector: 'app-account',
  templateUrl: './account.page.html',
  styleUrls: ['./account.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonIcon, TranslatePipe]
})
export class AccountPage implements OnInit, OnDestroy {
  displayName = '';
  email = '';
  avatarUrl = '';
  avatarInitials = '';
  userId7Digit: string | null = null;
  copiedUserId = false;
  statsPrograms = 0;
  statsRoutines = 0;
  statsExercises = 0;
  private authUnsub: (() => void) | null = null;
  private statsSub: Subscription | null = null;

  private supabase = inject(SupabaseService);
  private store = inject(StoreService);
  private loader = inject(LoaderService);
  private coachModeService = inject(CoachModeService);
  private modalController = inject(ModalController);

  constructor() { addIcons({ copyOutline, checkmark, helpCircle, personCircle, settingsOutline }); }

  async ngOnInit() {
    this.loader.show();
    setTimeout(() => { try { this.loader.hide(); } catch {} }, 1000);
    await this.loadAvatar();
    await this.loadCoachModeData();
    this.loadStats();
    if (!this.userId7Digit) {
      try {
        const id7 = await this.coachModeService.ensureUserId7Digit();
        if (id7) this.userId7Digit = id7;
      } catch {}
    }
    const client = this.supabase.getClient();
    try {
      const user = await this.supabase.getCurrentUser();
      const meta = (user?.user_metadata as any) || {};
      const name = meta.full_name || meta['name'] || '';
      const email = user?.email || '';
      this.email = email;
      this.displayName = name || (email ? email.split('@')[0] : '');
    } catch {}
    try {
      const sub = client.auth.onAuthStateChange((_evt, _session) => {
        this.loadAvatar();
        this.loadCoachModeData();
      });
      this.authUnsub = () => { try { sub.data?.subscription?.unsubscribe(); } catch {} };
    } catch {}
  }

  async loadAvatar() {
    try {
      const user = await this.supabase.getCurrentUser();
      const email = user?.email || '';
      const pic = await this.supabase.getUserAvatarUrl();
      this.avatarUrl = pic ? pic + (pic.includes('?') ? '&' : '?') + 'v=' + Date.now() : '';
      this.avatarInitials = (this.displayName || email || 'U').split(/\s|@|\./).filter(Boolean).slice(0,2).map(s => s[0].toUpperCase()).join('');
    } catch {
      this.avatarUrl = '';
    }
  }

  onImgError() {
    this.avatarUrl = '';
  }

  async loadCoachModeData() {
    try {
      const profile = await this.coachModeService.getUserProfile();
      if (profile) {
        this.userId7Digit = profile.user_id_7digit;
        if (!this.userId7Digit) {
          const id7 = await this.coachModeService.ensureUserId7Digit();
          if (id7) this.userId7Digit = id7;
        }
      }
    } catch (error) {
      console.error('Error loading coach mode data:', error);
    }
  }

  async copyUserId() {
    if (!this.userId7Digit) return;

    try {
      await Clipboard.write({ string: this.userId7Digit });
      this.showCopySuccess();
    } catch (error) {
      console.error('Clipboard API failed, trying fallback:', error);
      this.fallbackCopyTextToClipboard(this.userId7Digit);
    }
  }

  private fallbackCopyTextToClipboard(text: string) {
    const textArea = document.createElement("textarea");
    textArea.value = text;

    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      if (successful) {
        this.showCopySuccess();
      } else {
        console.error('Fallback copy failed.');
      }
    } catch (err) {
      console.error('Fallback copy error:', err);
    }

    document.body.removeChild(textArea);
  }

  private showCopySuccess() {
    this.copiedUserId = true;
    setTimeout(() => {
      this.copiedUserId = false;
    }, 2000);
  }


  private loadStats() {
    this.statsSub = this.store.getState$().subscribe(state => {
      this.statsPrograms = (state.programs || []).length;
      this.statsRoutines = (state.routines || []).length;
      this.statsExercises = (state.exercises || []).length;
    });
  }

  async logout() {
    await this.supabase.logoutAndReload();
  }

  async openSettings() {
    const modal = await this.modalController.create({
      component: SettingsModalComponent,
      cssClass: 'settings-modal-fullscreen',
    });
    await modal.present();
  }

  ngOnDestroy(): void {
    try { this.authUnsub && this.authUnsub(); } catch {}
    try { this.statsSub?.unsubscribe(); } catch {}
  }
}

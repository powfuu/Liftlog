import { Component, OnInit, inject } from '@angular/core';
import { Clipboard } from '@capacitor/clipboard';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, IonToggle } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { copyOutline, checkmark, helpCircle, person, people, globe, personCircle, sunny, moon } from 'ionicons/icons';
import { SupabaseService } from '../services/supabase.service';
import { TranslationService } from '../services/translation.service';
import { StoreService } from '../services/store.service';
import { LoaderService } from '../services/loader.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { CoachModeService } from '../services/coach-mode.service';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-account',
  templateUrl: './account.page.html',
  styleUrls: ['./account.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonIcon, IonToggle, TranslatePipe]
})
export class AccountPage implements OnInit {
  displayName = '';
  email = '';
  language: 'es'|'en'|'de'|'ko' = 'es';
  avatarUrl = '';
  avatarInitials = '';
  saving = false;
  isCoachMode = false;
  userId7Digit: string | null = null;
  copiedUserId = false;
  theme: 'dark' | 'light' = 'dark';
  private authUnsub: (() => void) | null = null;

  private supabase = inject(SupabaseService);
  private translations = inject(TranslationService);
  private store = inject(StoreService);
  private loader = inject(LoaderService);
  private coachModeService = inject(CoachModeService);
  private themeService = inject(ThemeService);

  constructor() { addIcons({ copyOutline, checkmark, helpCircle, person, people, globe, personCircle, sunny, moon }); }

  async ngOnInit() {
    this.loader.show();
    setTimeout(() => { try { this.loader.hide(); } catch {} }, 1000);
    // Initialize coach mode instantly from current state
    this.isCoachMode = this.coachModeService.isCoachMode;
    try { this.theme = this.themeService.getCurrentTheme(); } catch { this.theme = 'dark'; }

    await this.loadAvatar();
    await this.loadCoachModeData();
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
      this.language = this.translations.getCurrentLang();
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
        this.isCoachMode = profile.mode === 'coach';
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

  async onCoachModeToggle(event: any) {
    const enabled = event.detail.checked;
    this.saving = true;
    try {
      await this.coachModeService.setCoachMode(enabled);
      this.isCoachMode = enabled;
    } catch (error) {
      console.error('Error updating coach mode:', error);
      // Revert toggle if error
      event.detail.checked = !enabled;
    } finally {
      this.saving = false;
    }
  }

  async selectMode(mode: 'personal'|'coach') {
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


  async setLanguage(lang: 'es'|'en'|'de'|'ko') {
    this.language = lang;
    try {
      this.store.setLanguage(lang);
      await this.supabase.upsertProfile({ language: lang });
    } catch {}
  }

  async logout() {
    await this.supabase.logoutAndReload();
  }

  async setTheme(theme: 'dark' | 'light') {
    this.theme = theme;
    await this.themeService.setTheme(theme);
  }

  async toggleTheme() {
    try {
      const next = await this.themeService.toggleTheme();
      this.theme = next;
    } catch {}
  }

  ngOnDestroy(): void {
    try { this.authUnsub && this.authUnsub(); } catch {}
  }
}

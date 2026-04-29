import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

type ThemeMode = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private key = 'theme_preference';
  private current: ThemeMode = 'dark';

  async init(): Promise<ThemeMode> {
    const saved = await this.getSavedTheme();
    this.applyTheme(saved);
    return saved;
  }

  getCurrentTheme(): ThemeMode {
    return this.current;
  }

  async setTheme(theme: ThemeMode): Promise<void> {
    this.applyTheme(theme);
    await Preferences.set({ key: this.key, value: theme });
  }

  async toggleTheme(): Promise<ThemeMode> {
    const next: ThemeMode = this.current === 'light' ? 'dark' : 'light';
    await this.setTheme(next);
    return next;
  }

  private async getSavedTheme(): Promise<ThemeMode> {
    try {
      const { value } = await Preferences.get({ key: this.key });
      if (value === 'light' || value === 'dark') return value;
    } catch {}
    return 'dark';
  }

  private applyTheme(theme: ThemeMode): void {
    this.current = theme;
    try {
      const root = document.documentElement;
      root.classList.toggle('theme-light', theme === 'light');
      (root.style as any).colorScheme = theme;
    } catch {}
    this.applyStatusBar(theme).catch(() => {});
  }

  private async applyStatusBar(theme: ThemeMode): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await StatusBar.setOverlaysWebView({ overlay: false });
    } catch {}
    try {
      if (theme === 'light') {
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#ffffff' });
      } else {
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#141414' });
      }
    } catch {}
  }
}

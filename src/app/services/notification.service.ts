import { Injectable, inject } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { StorageService } from './storage.service';
import { StoreService } from './store.service';
import { TranslationService } from './translation.service';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private storage = inject(StorageService);
  private store = inject(StoreService);
  private i18n = inject(TranslationService);
  private ln: any = null;
  private readonly NOTIF_HOUR_KEY = 'notification_hour';
  private readonly NOTIF_MINUTE_KEY = 'notification_minute';

  private async plugin() {
    if (this.ln) return this.ln;
    try {
      const anyWin = (window as any);
      const viaCap = anyWin?.Capacitor?.Plugins?.LocalNotifications || anyWin?.LocalNotifications;
      if (viaCap) { this.ln = viaCap; return this.ln; }
      return null;
    } catch { return null; }
  }

  async init() {
    const ln = await this.plugin();
    if (!ln) return;
    try {
      // Check overall permission (Android 13+ requires runtime grant)
      if (ln.checkPermissions) {
        const perm = await ln.checkPermissions();
        if (perm?.display !== 'granted') { await ln.requestPermissions?.(); }
      } else {
        await ln.requestPermissions?.();
      }
      // Ensure exact alarms on Android 12+ for precise scheduling
      if (Capacitor.getPlatform() === 'android' && ln.createChannel) {
        try {
          await ln.createChannel({
            id: 'training',
            name: 'Training Reminders',
            description: 'Daily training and inactivity reminders',
            importance: 4,
            visibility: 1
          });
        } catch {}
      }
      App.addListener('resume', async () => { try { await this.scheduleDaysAhead(14); } catch {} });
    } catch {}
    await this.scheduleDaysAhead(14);
  }

  private dayName(date: Date): string {
    return ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];
  }
  private toUS(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${m}/${d}/${y}`;
  }
  private atTime(date: Date, hour: number, minute: number): Date {
    const d = new Date(date);
    d.setHours(hour, minute, 0, 0);
    return d;
  }
  private parseUS(dateUS: string): Date {
    try {
      const [m,d,y] = dateUS.split('/').map(s => parseInt(s, 10));
      return new Date(y, (m - 1), d);
    } catch { return new Date(); }
  }

  async getNotificationHour(): Promise<number> {
    try {
      const { value } = await Preferences.get({ key: this.NOTIF_HOUR_KEY });
      if (value !== null && value !== undefined) {
        const h = parseInt(value, 10);
        if (!isNaN(h) && h >= 0 && h <= 23) return h;
      }
    } catch {}
    return 12;
  }

  async getNotificationMinute(): Promise<number> {
    try {
      const { value } = await Preferences.get({ key: this.NOTIF_MINUTE_KEY });
      if (value !== null && value !== undefined) {
        const m = parseInt(value, 10);
        if (!isNaN(m) && m >= 0 && m <= 59) return m;
      }
    } catch {}
    return 0;
  }

  async setNotificationTime(hour: number, minute: number): Promise<void> {
    const oldHour = await this.getNotificationHour();
    await Preferences.set({ key: this.NOTIF_HOUR_KEY, value: String(hour) });
    await Preferences.set({ key: this.NOTIF_MINUTE_KEY, value: String(minute) });
    if (oldHour !== hour) {
      await this.cancelTrainingNotifs(oldHour, 16);
    }
    await this.scheduleDaysAhead(14);
  }

  private async cancelTrainingNotifs(hour: number, days: number) {
    const ln = await this.plugin();
    if (!ln) return;
    const now = new Date();
    const ids: { id: number }[] = [];
    for (let i = 0; i <= days; i++) {
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      ids.push({ id: Number(`${hour}${dt.getMonth() + 1}${dt.getDate()}`) });
    }
    try { await ln.cancel({ notifications: ids }); } catch {}
  }

  async scheduleDaysAhead(days: number) {
    const ln = await this.plugin();
    if (!ln) return;
    if (Capacitor.getPlatform() === 'android' && ln.createChannel) {
      try {
        await ln.createChannel({ id: 'training', name: 'Training Reminders', description: 'Daily training reminders', importance: 4, visibility: 1 });
      } catch {}
    }
    try {
      const enabled = await ln.areEnabled?.();
      if (enabled && (enabled as any).value === false) {
        await ln.requestPermissions?.();
      }
    } catch {}
    const lnPerm = await (ln.checkPermissions?.() ?? Promise.resolve({ display: 'granted' }));
    if ((lnPerm as any).display !== 'granted') { try { await ln.requestPermissions?.(); } catch {} }
    const routines = await this.storage.getRoutines();
    const programs = await this.storage.getPrograms() as any[];
    const activePrograms = new Set<string>((programs||[]).filter(p => (p.isActive !== false)).map(p => p.name));
    const hasForDay = (date: Date) => {
      const dn = date.toLocaleString('en-US', { weekday: 'long' });
      return (routines||[]).some((r: any) => ((r?.frequency === 'daily') || ((r.days||[]).includes(dn))) && (!r.programName || activePrograms.has(r.programName)));
    };
    const hour = await this.getNotificationHour();
    const minute = await this.getNotificationMinute();
    const notifications: any[] = [];
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
    // Always schedule from today to ensure updates are applied immediately
    const startDate = now;
    for (let dt = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()); dt <= end; dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1)) {
      const us = this.toUS(dt);
      const trained = (await this.storage.getWorkoutTotalDurationLocal(us)) > 0;
      if (!trained && hasForDay(dt)) {
        const at = this.atTime(dt, hour, minute);
        if (at.getTime() <= now.getTime()) continue;
        notifications.push({
          id: Number(`${hour}${dt.getMonth()+1}${dt.getDate()}`),
          title: this.i18n.getCurrentLang?.() === 'es' ? '¡Día de Entrenamiento!' : 'Training Day!',
          body: this.i18n.getCurrentLang?.() === 'es' ? 'Prepárate bien hoy 💪' : 'Get ready today 💪',
          schedule: { at, allowWhileIdle: true },
          smallIcon: 'res://drawable/ic_stat_liftbuilder',
          largeIcon: Capacitor.getPlatform() === 'android' ? 'res://drawable/ic_notif_large' : undefined,
          iconColor: Capacitor.getPlatform() === 'android' ? '#EF4444' : undefined,
          channelId: Capacitor.getPlatform() === 'android' ? 'training' : undefined
        });
      } else {
        try { await ln.cancel({ notifications: [{ id: Number(`${hour}${dt.getMonth()+1}${dt.getDate()}`) }] }); } catch {}
      }
    }
    if (notifications.length) {
      try { await ln.schedule({ notifications }); } catch {}
    }
    try { await Preferences.set({ key: 'notifs_scheduled_until', value: this.toUS(end) }); } catch {}
  }


  private inactivityKey(dateUS: string) { return `inactivity_last_${dateUS}`; }

  async startTrainingInactivity(dateUS: string) {
    const ln = await this.plugin();
    if (!ln) return;
    const now = Date.now();
    await Preferences.set({ key: this.inactivityKey(dateUS), value: String(now) });
    await this.scheduleInactivity(dateUS, 30 * 60 * 1000);
  }
  async bumpTrainingActivity(dateUS: string) {
    const ln = await this.plugin();
    if (!ln) return;
    const now = Date.now();
    await Preferences.set({ key: this.inactivityKey(dateUS), value: String(now) });
    await this.scheduleInactivity(dateUS, 30 * 60 * 1000);
  }
  async stopTrainingInactivity(dateUS: string) {
    const ln = await this.plugin();
    if (!ln) return;
    await Preferences.remove({ key: this.inactivityKey(dateUS) });
    try { await ln.cancel({ notifications: [{ id: this.inactivityId(dateUS) }] }); } catch {}
  }
  private inactivityId(dateUS: string) {
    const [m,d,y] = dateUS.split('/');
    return Number(`30${m}${d}`);
  }
  private async scheduleInactivity(dateUS: string, delayMs: number) {
    const ln = await this.plugin();
    if (!ln) return;
    const when = new Date(Date.now() + delayMs);
    const id = this.inactivityId(dateUS);
    try { await ln.cancel({ notifications: [{ id }] }); } catch {}
    const es = this.i18n.getCurrentLang?.() === 'es';
    try {
      await ln.schedule({
        notifications: [{
          id,
          title: es ? 'Entrenamiento en progreso' : 'Training in progress',
          body: es ? '¿Sigues entrenando? Registra tus avances.' : 'Still training? Log your progress.',
          schedule: { at: when, allowWhileIdle: true },
          smallIcon: 'res://drawable/ic_stat_liftbuilder',
          largeIcon: Capacitor.getPlatform() === 'android' ? 'res://drawable/ic_notif_large' : undefined,
          iconColor: Capacitor.getPlatform() === 'android' ? '#EF4444' : undefined,
          channelId: Capacitor.getPlatform() === 'android' ? 'training' : undefined
        }]
      });
    } catch {}
  }


}

import { Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { Browser } from '@capacitor/browser';
import { BehaviorSubject } from 'rxjs';
import { LoaderService } from './loader.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private client!: SupabaseClient;
  private redirectUrl = 'liftbuilder://auth-callback';
  private signedIn$ = new BehaviorSubject<boolean>(false);
  private loader = inject(LoaderService);
  private router = inject(Router);
  private reloadedAfterLogin = false;
  private cachedUserId: string | null = null;
  private currentUser: User | null = null;
  private inflight = new Map<string, Promise<any>>();
  private memoCache = new Map<string, { ts: number; data: any }>();
  private memoTTLms = 60 * 60 * 1000; // 1 hour default TTL for persistence
  private isLoggingOut = false;

  get isLoggingOutState() { return this.isLoggingOut; }

  private withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
      p.then(val => { clearTimeout(t); resolve(val); }).catch(err => { clearTimeout(t); reject(err); });
    });
  }
  private async safeCall<T>(key: string, fn: () => Promise<T>, timeoutMs = 8000, retries = 2): Promise<T> {
    if (this.isLoggingOut) return Promise.reject(new Error('Logging out'));
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const run = async (attempt: number): Promise<T> => {
      try {
        return await this.withTimeout(fn(), timeoutMs, key);
      } catch (e) {
        if (attempt < retries) {
          const delay = Math.min(1200 * (attempt + 1), 1800);
          await new Promise(r => setTimeout(r, delay));
          return run(attempt + 1);
        }
        throw e;
      }
    };
    const prom = run(0);
    this.inflight.set(key, prom);
    try { const res = await prom; return res; }
    finally { this.inflight.delete(key); }
  }
  public async memoized<T>(key: string, fn: () => Promise<T>, ttlMs?: number): Promise<T> {
    const ttl = typeof ttlMs === 'number' ? ttlMs : this.memoTTLms;
    const now = Date.now();
    const cached = this.memoCache.get(key);
    if (cached && (now - cached.ts) < ttl) return cached.data as T;
    try {
      const data = await this.safeCall(key, fn);
      this.memoCache.set(key, { ts: now, data });
      return data;
    } catch (e) {
      if (cached) return cached.data as T;
      throw e;
    }
  }
  public invalidateMemo(prefix: string) {
    for (const k of Array.from(this.memoCache.keys())) { if (k.startsWith(prefix)) this.memoCache.delete(k); }
  }
  private isMissingColumnError(e: any): boolean {
    const code = String((e && (e.code as any)) || '');
    const msg = String((e && (e.message as any)) || '');
    return code === '42703' || code === 'PGRST204' || code === 'PGRST205' || msg.includes('does not exist') || msg.includes('schema cache');
  }
  private async generateShareCode(): Promise<string> {
    const rand = () => String(Math.floor(1000000 + Math.random() * 9000000));
    let code = rand();
    try {
      const { data } = await this.client.from('programs').select('id').eq('code', code).limit(1).maybeSingle();
      if (data) code = rand();
    } catch {}
    return code;
  }
  private async generateRoutineCode(): Promise<string> {
    const rand = () => String(Math.floor(1000000 + Math.random() * 9000000));
    let code = rand();
    try {
      const { data } = await this.client.from('routines').select('id').eq('code', code).limit(1).maybeSingle();
      if (data) code = rand();
    } catch {}
    return code;
  }

constructor(private zone: NgZone) {
  const capStorage = {
    getItem: async (key: string) => (await Preferences.get({ key })).value ?? null,
    setItem: async (key: string, value: string) => { await Preferences.set({ key, value }); },
    removeItem: async (key: string) => { await Preferences.remove({ key }); }
  };

  this.client = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
    {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        storage: capStorage,

        // IMPORTANTE:
        // En native NO dependas de detectSessionInUrl.
        // Deja esto en false para evitar dobles manejos raros.
        detectSessionInUrl: !Capacitor.isNativePlatform(),
      },
    }
  );

  if (Capacitor.isNativePlatform()) {
    App.addListener('appUrlOpen', async (event) => {
this.loader.show();
      try {
        const urlObj = new URL(event.url);

        // 1) PKCE: viene en query (?code=...)
        const code = urlObj.searchParams.get('code');
        const errorDesc = urlObj.searchParams.get('error_description');
        const error = urlObj.searchParams.get('error');

        if (error || errorDesc) {
          console.error('[OAuth callback error]', { error, errorDesc });
          try { await Browser.close(); } catch {}
          return;
        }

if (code) {
  const { data, error } = await this.client.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('[exchangeCodeForSession] ERROR:', error);
    try { await Browser.close(); } catch {}
    return;
  }
  // NO reload aquí
  return;
}


        // 2) Implicit flow (fragment #access_token=...) por si te llega así
        const hash = urlObj.hash?.startsWith('#') ? urlObj.hash.slice(1) : '';
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error } = await this.client.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('[setSession] ERROR:', error);
            try { await Browser.close(); } catch {}
            return;
          }

          try { localStorage.setItem('postLoginGoHome', '1'); } catch {}
          this.signedIn$.next(true);
          try { await Browser.close(); } catch {}
          this.forceReload();
          return;
        }

        console.warn('[OAuth] No code/token found in callback URL.');
      } catch (e) {
        console.error('[appUrlOpen] exception parsing url', e);
      }
    });

    // Si el usuario cierra el browser manualmente
    try {
      Browser.addListener('browserFinished', async () => {
        // NO fuerces reload aquí siempre, solo si tú quieres
        // this.forceReload();
      });
    } catch {}
  }

this.client.auth.onAuthStateChange(async (event, session) => {

  if (session) {
    try { await Browser.close(); } catch {}

    this.zone.run(() => {
      this.signedIn$.next(true);
      this.currentUser = session.user;
      this.cachedUserId = session.user?.id ?? null;
    });

    // ✅ One-shot reload (native) usando Preferences
    if (Capacitor.isNativePlatform() && !this.reloadedAfterLogin) {
      const { value } = await Preferences.get({ key: 'postLoginReload' });

      if (value === '1') {
        this.reloadedAfterLogin = true;

        // MUY IMPORTANTE: borrar el flag antes del reload
        await Preferences.remove({ key: 'postLoginReload' });

        setTimeout(() => {
          try { this.forceReload(); } catch (e) { console.error('[Reload] failed', e); }
        }, 150);
      }
    }

    return;
  }

  this.zone.run(() => {
    this.signedIn$.next(false);
    this.currentUser = null;
    this.cachedUserId = null;
    this.invalidateMemo('');
  });

  this.reloadedAfterLogin = false;
});


  (async () => {
    try {
      const { data } = await this.client.auth.getSession();
      this.signedIn$.next(!!data?.session);
      this.currentUser = data?.session?.user ?? null;
      this.cachedUserId = data?.session?.user?.id ?? null;
    } catch {
      this.signedIn$.next(false);
    }
  })();

  this.startSessionKeepAlive();
}


  getClient() {
    return this.client;
  }

  async getCurrentUser(): Promise<User | null> {
    if (this.isLoggingOut) return null;
    if (this.currentUser) return this.currentUser;
    return await this.safeCall('getCurrentUser', async () => {
      const { data } = await this.client.auth.getUser();
      this.currentUser = data.user;
      this.cachedUserId = data.user?.id ?? null;
      return this.currentUser;
    });
  }

  async ensureUserProfile(): Promise<void> {
    try {
      const user = await this.getCurrentUser();
      if (!user) return;
      try {
        await this.client
          .from('user_profiles')
          .upsert({ id: user.id }, { onConflict: 'id' });
      } catch (e: any) {
        const code = String(e?.code || '');
        if (code === '42703') {
          await this.client
            .from('user_profiles')
            .upsert({ user_id: user.id as any }, { onConflict: 'user_id' as any });
        }
      }
    } catch {}
  }
  async isAuthenticated(): Promise<boolean> {
    if (this.isLoggingOut) return false;
    return !!(await this.getCurrentUser());
  }
  getSignedIn$() {
    return this.signedIn$.asObservable();
  }

  forceReload() {
    // Force hard reload to reset app state
    try { this.loader.show(); } catch {}
    setTimeout(() => {
      try {
        window.location.href = '/';
        // Fallback if href assignment doesn't trigger immediate reload
        setTimeout(() => window.location.reload(), 100);
      } catch {
        window.location.reload();
      }
    }, 200);
  }
  private keepAliveTimer: any = null;
  private startSessionKeepAlive() {
    if (this.keepAliveTimer) { try { clearInterval(this.keepAliveTimer); } catch {} }
    this.keepAliveTimer = setInterval(async () => {
      try {
        const { data } = await this.client.auth.getSession();
        const s = data?.session;
        if (!s) return;
        const now = Math.floor(Date.now() / 1000);
        const exp = Number((s as any).expires_at || (now + 3600));
        if (exp - now < 600) {
          await this.client.auth.refreshSession();
        }
      } catch {}
    }, 10 * 60 * 1000);
    try {
      App.addListener('resume', async () => {
        try { await this.client.auth.refreshSession(); } catch {}
      });
    } catch {}
  }
  async getUserId(): Promise<string | null> {
    const user = await this.getCurrentUser();
    return user?.id ?? null;
  }

  async getUserAvatarUrl(): Promise<string> {
    try {
      const user = await this.getCurrentUser();
      if (!user) return '';
      const meta = (user?.user_metadata as any) || {};
      let pic: string = meta.picture || meta.avatar_url || meta.avatar || '';
      if (!pic) {
        const identities: any[] = (user?.identities as any[]) || [];
        for (const id of identities) {
          const idata = (id?.identity_data as any) || {};
          pic = idata.picture || idata.avatar_url || pic;
          if (pic) break;
        }
      }
      if (!pic) {
        const { data: sessionData } = await this.client.auth.getSession();
        const session: any = (sessionData as any)?.session;
        const providerToken: string | undefined = session?.provider_token;
        const provider: string | undefined = session?.user?.app_metadata?.provider;
        if (provider === 'google' && providerToken) {
          try {
            const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${providerToken}` },
            });
            const json = await resp.json();
            pic = json?.picture || '';
          } catch {}
        }
      }
      if (pic && pic.includes('googleusercontent.com')) {
        // Force high resolution for Google avatars
        pic = pic.replace(/=s\d+(-c)?/g, '=s400-c');
      }
      return pic || '';
    } catch { return ''; }
  }

async signInWithGoogle(): Promise<void> {
  // WEB
  if (Capacitor.getPlatform() === 'web') {
    try { localStorage.setItem('postLoginGoHome', '1'); } catch {}
    await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' }
      }
    });
    return;
  }

  // NATIVE
  await Preferences.set({ key: 'postLoginReload', value: '1' });

  const { data, error } = await this.client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: this.redirectUrl,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error) throw error;

  const url = (data as any)?.url;
  if (url) {
    await Browser.open({ url, presentationStyle: 'fullscreen' });
  }
}



  async signOut(): Promise<void> {
    this.isLoggingOut = true;
    try {
      // Very short timeout (300ms) for network logout.
      // We prioritize UI responsiveness over server acknowledgement.
      await this.withTimeout(this.client.auth.signOut({ scope: 'global' } as any), 300, 'signOut');
    } catch (e) {
      // Ignore network errors or timeout, proceed to local cleanup
    }
    this.cachedUserId = null;
    this.signedIn$.next(false);

    // Fast local cleanup
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      if (k.startsWith('sb-')) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    localStorage.removeItem('postLoginGoHome');
    try { localStorage.removeItem('onboarding_completed'); } catch {}
    try { await Preferences.clear(); } catch (e) { console.warn('Preferences clear failed', e); }
  }

  async logoutAndReload(): Promise<void> {
    this.isLoggingOut = true;
    if (this.keepAliveTimer) { clearInterval(this.keepAliveTimer); this.keepAliveTimer = null; }

    // Immediate navigation to avoid stuck UI
    this.zone.run(() => {
        this.router.navigate(['/login'], { replaceUrl: true });
    });

    localStorage.removeItem('CapacitorStorage.onboarding_completed');
    this.loader.show();

    // Safety timeout to ensure loader is removed even if logout hangs
    const safetyTimeout = setTimeout(() => {
      try { this.loader.hide(); } catch {}
      this.forceReload();
    }, 6000);

    try {
      await this.signOut();
    } catch (e) {
      console.error('Logout failed', e);
    } finally {
      clearTimeout(safetyTimeout);
      // Proceed to reload
      try { this.loader.hide(); } catch {}
      setTimeout(() => this.forceReload(), 50);
    }
  }

  async purgeUserAccountData(): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    const c = this.client;
    try {
      const { data: logs } = await c
        .from('exercise_logs')
        .select('id')
        .eq('user_id', uid);
      const logIds = (logs || []).map((l: any) => l.id).filter(Boolean);
      if (logIds.length) {
        await c.from('exercise_sets').delete().in('log_id', logIds);
      }
      await c.from('exercise_logs').delete().eq('user_id', uid);

      const { data: routines } = await c
        .from('routines')
        .select('id')
        .eq('user_id', uid);
      const routineIds = (routines || []).map((r: any) => r.id).filter(Boolean);
      if (routineIds.length) {
        await c.from('routine_exercises').delete().in('routine_id', routineIds);
        await c.from('routine_days').delete().in('routine_id', routineIds);
      }
      await c.from('routines').delete().eq('user_id', uid);

      await c.from('programs').delete().eq('user_id', uid);
      await c.from('exercises').delete().eq('user_id', uid);
      await c.from('user_weight_logs').delete().eq('user_id', uid);
      await c.from('user_preferences').delete().eq('user_id', uid);
    } catch (e) {
      console.error('Supabase purge failed', e);
    }
  }

  async getProfile(): Promise<any | null> {
    const uid = await this.getUserId();
    if (!uid) return null;
    const key = `user_preferences:${uid}`;
    return await this.memoized(key, async () => {
      const { data } = await this.client
        .from('user_preferences')
        .select('*')
        .eq('user_id', uid)
        .limit(1)
        .maybeSingle();
      return data || null;
    });
  }

  async getUserProfileData(): Promise<any | null> {
    const uid = await this.getUserId();
    if (!uid) return null;
    const key = `user_profiles:${uid}`;
    return await this.memoized(key, async () => {
      const { data: byId, error: errId } = await this.client
        .from('user_profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();
      if (byId) return byId;
      if (errId && String(errId.code || '') === '42703') {
        const { data: byUserId } = await this.client
          .from('user_profiles')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle();
        return byUserId || null;
      }
      return null;
    });
  }

  async invalidateUserProfileData(): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    this.invalidateMemo(`user_profiles:${uid}`);
  }

  async upsertProfile(
    p: Partial<{
      language: string;
      initial_weight_unit: 'kg' | 'lb';
      onboarding_completed: boolean;
    }>
  ): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    const row: any = { user_id: uid };
    if (p.language !== undefined) row.language = p.language;
    if (p.initial_weight_unit !== undefined)
      row.weight_unit = p.initial_weight_unit;
    if (p.onboarding_completed !== undefined)
      row.onboarding_completed = p.onboarding_completed;
    try {
      await this.client
        .from('user_preferences')
        .upsert(row, { onConflict: 'user_id' });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (
        msg.includes('onboarding_completed') ||
        msg.includes('schema cache')
      ) {
        delete row.onboarding_completed;
        await this.client
          .from('user_preferences')
          .upsert(row, { onConflict: 'user_id' });
      } else {
        throw e;
      }
    }
    this.invalidateMemo(`user_preferences:${uid}`);
  }

  async hasCompletedOnboarding(): Promise<boolean> {
    const uid = await this.getUserId();
    if (!uid) return false;

    // Strict check: Must have at least one weight log
    // This overrides any profile flag, ensuring user has weight data
    const { count, error } = await this.client
      .from('user_weight_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid);

    if (error) throw error;
    return (count || 0) > 0;
  }

  async setOnboardingCompleted(val: boolean): Promise<void> {
    try {
      await this.upsertProfile({ onboarding_completed: val });
    } catch {}
  }

  async addWeightLog(
    weight: number,
    unit: 'kg' | 'lb',
    date: Date
  ): Promise<{ id: string; date: Date; weight: number; unit: 'kg' | 'lb' }> {
    const uid = await this.getUserId();
    if (!uid) return { id: '', date, weight, unit };
    const { data } = await this.client
      .from('user_weight_logs')
      .insert({
        user_id: uid,
        log_date: date.toISOString().slice(0, 10),
        weight,
        unit,
      })
      .select('id, log_date, weight, unit')
      .single();
    const id = data?.id || '';
    const d = data?.log_date ? new Date(data.log_date) : date;
    return {
      id,
      date: d,
      weight: data?.weight ?? weight,
      unit: (data?.unit as any) ?? unit,
    };
  }

  async getUserWeightLogs(): Promise<
    { id: string; date: Date; weight: number; unit: 'kg' | 'lb' }[]
  > {
    const uid = await this.getUserId();
    if (!uid) return [];
    const { data } = await this.client
      .from('user_weight_logs')
      .select('id, log_date, weight, unit')
      .eq('user_id', uid)
      .order('log_date', { ascending: false });
    return (data || []).map((r: any) => ({
      id: r.id,
      date: new Date(r.log_date),
      weight: r.weight,
      unit: r.unit,
    }));
  }

  async deleteUserWeightLog(id: string): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    await this.client
      .from('user_weight_logs')
      .delete()
      .eq('user_id', uid)
      .eq('id', id);
  }

  // Remote Programs
  async getPrograms(): Promise<{ name: string; description?: string }[]> {
    const uid = await this.getUserId();
    if (!uid) return [];
    const key = `programs:${uid}`;
    return await this.memoized(key, async () => {
      try {
        const { data } = await this.client
          .from('programs')
          .select('name, description, code, is_active')
          .eq('user_id', uid)
          .order('created_at', { ascending: false });
        return (data || []).map((p: any) => ({
          name: p.name,
          description: p.description || undefined,
          code: p.code || undefined,
          isActive: (p.is_active as boolean) !== false,
        }));
      } catch (e: any) {
        if (this.isMissingColumnError(e) || String(e?.code||'') === 'PGRST205' || String(e?.message||'').includes('schema cache')) {
          const { data } = await this.client
            .from('programs')
            .select('name, description')
            .eq('user_id', uid)
            .order('created_at', { ascending: false });
          return (data || []).map((p: any) => ({
            name: p.name,
            description: p.description || undefined,
            isActive: true,
          }));
        }
        throw e;
      }
    });
  }

  async upsertProgram(program: {
    name: string;
    description?: string;
    code?: string;
  }): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    try {
      let code: string | null = program.code || null;
      try {
        const { data: existing } = await this.client
          .from('programs')
          .select('code')
          .eq('user_id', uid)
          .eq('name', program.name)
          .limit(1)
          .maybeSingle();
        code = existing?.code || null;
      } catch {}
      if (!code) code = await this.generateShareCode();
      await this.client
        .from('programs')
        .upsert(
          {
            user_id: uid,
            name: program.name,
            description: program.description ?? null,
            code,
          },
          { onConflict: 'user_id,name' }
        );
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (this.isMissingColumnError(e)) {
        await this.client
          .from('programs')
          .upsert(
            {
              user_id: uid,
              name: program.name,
              description: program.description ?? null,
            },
            { onConflict: 'user_id,name' }
          );
      } else if (msg.includes('42P10') || msg.includes('ON CONFLICT')) {
        const { data: existing } = await this.client
          .from('programs')
          .select('id')
          .eq('user_id', uid)
          .eq('name', program.name)
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          let code: string | null = program.code || null;
          try {
            const { data: ex } = await this.client
              .from('programs')
              .select('code')
              .eq('user_id', uid)
              .eq('name', program.name)
              .limit(1)
              .maybeSingle();
            code = ex?.code || null;
          } catch {}
          if (!code) code = await this.generateShareCode();
          try {
            await this.client
              .from('programs')
              .update({ description: program.description ?? null, code })
              .eq('user_id', uid)
              .eq('name', program.name);
          } catch (e2: any) {
            if (this.isMissingColumnError(e2)) {
              await this.client
                .from('programs')
                .update({ description: program.description ?? null })
                .eq('user_id', uid)
                .eq('name', program.name);
            } else { throw e2; }
          }
        } else {
          const code = program.code || await this.generateShareCode();
          try {
            await this.client
              .from('programs')
              .insert({
                user_id: uid,
                name: program.name,
                description: program.description ?? null,
                code,
              });
          } catch (e3: any) {
            if (this.isMissingColumnError(e3)) {
              await this.client
                .from('programs')
                .insert({
                  user_id: uid,
                  name: program.name,
                  description: program.description ?? null,
                });
            } else { throw e3; }
          }
        }
      } else {
        throw e;
      }
    }
    this.invalidateMemo(`programs:${uid}`);
    this.invalidateMemo(`routines:${uid}`);
  }

  async upsertProgramsList(
    programs: { name: string; description?: string }[]
  ): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    const rows = [] as any[];
    for (const p of programs) {
      let code: string | null = null;
      try {
        const { data: existing } = await this.client
          .from('programs')
          .select('code')
          .eq('user_id', uid)
          .eq('name', p.name)
          .limit(1)
          .maybeSingle();
        code = existing?.code || null;
      } catch {}
      if (!code) code = await this.generateShareCode();
      rows.push({ user_id: uid, name: p.name, description: p.description ?? null, code });
    }
    if (!rows.length) return;
    try {
      await this.client
        .from('programs')
        .upsert(rows, { onConflict: 'user_id,name' });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (this.isMissingColumnError(e)) {
        const rowsNoCode = rows.map(r => ({ user_id: r.user_id, name: r.name, description: r.description }));
        await this.client
          .from('programs')
          .upsert(rowsNoCode, { onConflict: 'user_id,name' });
      } else if (msg.includes('42P10') || msg.includes('ON CONFLICT')) {
        const { data: existingRows } = await this.client
          .from('programs')
          .select('id,name')
          .eq('user_id', uid);
        const existingNames = new Set<string>(
          (existingRows || []).map((r: any) => r.name)
        );
        for (const r of rows) {
          if (existingNames.has(r.name)) {
            try {
              await this.client
                .from('programs')
                .update({ description: r.description, code: r.code })
                .eq('user_id', uid)
                .eq('name', r.name);
            } catch (e2: any) {
              if (this.isMissingColumnError(e2)) {
                await this.client
                  .from('programs')
                  .update({ description: r.description })
                  .eq('user_id', uid)
                  .eq('name', r.name);
              } else { throw e2; }
            }
          } else {
            await this.client.from('programs').insert(r);
          }
        }
      } else {
        throw e;
      }
    }
    this.invalidateMemo(`programs:${uid}`);
    this.invalidateMemo(`routines:${uid}`);
  }

  async refreshProgramsCache(): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    this.invalidateMemo(`programs:${uid}`);
  }

  async getProgramByCode(code: string): Promise<any | null> {
    try {
      const rpc = await this.client.rpc('get_program_bundle_by_code', { c: code });
      const rows: any[] = (rpc.data || []);
      if (rows.length) {
        const program = { id: rows[0].program_id, name: rows[0].program_name, description: rows[0].program_description };
        const routinesMap = new Map<string, any>();
        const exercises: any[] = [];
        const days: any[] = [];
        for (const r of rows) {
          if (r.routine_id) {
            if (!routinesMap.has(r.routine_id)) {
              routinesMap.set(r.routine_id, { id: r.routine_id, name: r.routine_name, description: r.routine_description, frequency: r.frequency, days: [], is_active: true, created_at: new Date(), updated_at: new Date() });
            }
            if (r.day) days.push({ routine_id: r.routine_id, day: r.day });
            if (r.exercise_id) exercises.push({ routine_id: r.routine_id, exercise_id: r.exercise_id, exercise_name: r.exercise_name, target_sets: r.target_sets, target_reps: r.target_reps, order_index: r.order_index, weight: r.weight, weight_unit: r.weight_unit, reserve_reps: r.reserve_reps, notes: r.notes, sets_json: r.sets_json });
          }
        }
        const routines = Array.from(routinesMap.values());
        return { program, routines, exercises, days };
      }
    } catch (e: any) { /* fall back below */ }
    try {
      const { data: prog } = await this.client.from('programs').select('id,name,description').eq('code', code).limit(1).maybeSingle();
      if (!prog) return null;
      const pid = prog.id;
      const { data: routines } = await this.client
        .from('routines')
        .select('id,name,description,frequency,days,is_active,created_at,updated_at')
        .eq('program_id', pid);
      const rids = (routines || []).map((r: any) => r.id);
      const { data: rex } = await this.client
        .from('routine_exercises')
        .select('routine_id,exercise_id,exercise_name,target_sets,target_reps,order_index,weight,weight_unit,reserve_reps,notes,sets_json')
        .in('routine_id', rids);
      const { data: rdays } = await this.client
        .from('routine_days')
        .select('routine_id,day')
        .in('routine_id', rids);
      return { program: prog, routines: routines || [], exercises: rex || [], days: rdays || [] };
    } catch (e: any) { if (this.isMissingColumnError(e)) return null; return null; }
  }

  async getRoutineCode(id: string): Promise<string | null> {
    try {
      const { data } = await this.client.from('routines').select('code').eq('id', id).limit(1).maybeSingle();
      return (data?.code as any) || null;
    } catch (e: any) { if (this.isMissingColumnError(e)) return null; return null; }
  }

  async getRoutineByCode(code: string): Promise<any | null> {
    try {
      const { data: r } = await this.client
        .from('routines')
        .select('id,name,description,frequency,days,is_active,created_at,updated_at')
        .eq('code', code)
        .limit(1)
        .maybeSingle();
      if (!r) return null;
      const rid = r.id;
      const { data: rex } = await this.client
        .from('routine_exercises')
        .select('exercise_id,exercise_name,target_sets,target_reps,order_index,weight,weight_unit,reserve_reps,notes,sets_json,goal_weight,goal_unit')
        .eq('routine_id', rid);
      const { data: rdays } = await this.client
        .from('routine_days')
        .select('day')
        .eq('routine_id', rid);
      return { routine: r, exercises: rex || [], days: rdays || [] };
    } catch (e: any) { if (this.isMissingColumnError(e)) return null; return null; }
  }

  async updateProgramNameAndDescription(oldName: string, newName: string, description?: string): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    const c = this.client;
    try {
      const { data: prog } = await c
        .from('programs')
        .select('id,code')
        .eq('user_id', uid)
        .eq('name', oldName)
        .limit(1)
        .maybeSingle();
      if (!prog?.id) {
        await this.upsertProgram({ name: newName, description });
        return;
      }
      // Update name and description; keep code if column exists
      try {
        await c
          .from('programs')
          .update({ name: newName, description: description ?? null })
          .eq('user_id', uid)
          .eq('name', oldName);
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (this.isMissingColumnError(e) || msg.includes('schema cache')) {
          await c
            .from('programs')
            .update({ name: newName, description: description ?? null })
            .eq('user_id', uid)
            .eq('name', oldName);
        } else {
          throw e;
        }
      }
    } catch (e) {
      // Fallback: insert if update failed
      await this.upsertProgram({ name: newName, description });
    }
    this.invalidateMemo(`programs:${uid}`);
    this.invalidateMemo(`routines:${uid}`);
  }

  async deleteProgram(name: string): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    const c = this.client;
    try {
      const { data: prog } = await c
        .from('programs')
        .select('id,code')
        .eq('user_id', uid)
        .eq('name', name)
        .limit(1)
        .maybeSingle();
      const pid = prog?.id || null;
      const pcode = (prog as any)?.code || null;
      if (pid) {
        const { data: routines } = await c
          .from('routines')
          .select('id')
          .eq('user_id', uid)
          .eq('program_id', pid);
        const rids = (routines || []).map((r: any) => r.id).filter(Boolean);
        if (rids.length) {
          const { data: rex } = await c
            .from('routine_exercises')
            .select('exercise_id')
            .eq('user_id', uid)
            .in('routine_id', rids);
          const exIds = Array.from(new Set((rex || []).map((e: any) => e.exercise_id).filter(Boolean)));
          await c.from('routine_exercises').delete().in('routine_id', rids);
          await c.from('routine_days').delete().in('routine_id', rids);
          await c.from('routines').delete().eq('user_id', uid).in('id', rids);
          if (exIds.length) {
            const { data: usedElsewhere } = await c
              .from('routine_exercises')
              .select('exercise_id')
              .eq('user_id', uid)
              .in('exercise_id', exIds)
              .not('routine_id', 'in', `(${rids.join(',')})`);
            const stillUsed = new Set<string>((usedElsewhere || []).map((r: any) => r.exercise_id));
            const toDelete = exIds.filter(id => !stillUsed.has(id));
            if (toDelete.length) {
              await c.from('exercises').delete().eq('user_id', uid).in('id', toDelete);
            }
          }
        }
      }
      await c.from('programs').delete().eq('user_id', uid).eq('name', name);
      if (pcode) {
        const { data: others } = await c
          .from('programs')
          .select('id')
          .eq('code', pcode)
          .neq('user_id', uid)
          .limit(1)
          .maybeSingle();
        if (!others?.id) {
          try { await c.from('programs').delete().eq('code', pcode); } catch {}
        }
      }
    } finally {
      this.invalidateMemo(`programs:${uid}`);
      this.invalidateMemo(`routines:${uid}`);
    }
  }

  // Remote Routines (basic)
  async getRoutines(): Promise<any[]> {
    const uid = await this.getUserId();
    if (!uid) return [];
    const key = `routines:${uid}`;
    const { routines, rex, rdays } = await this.memoized(key, async () => {
      const { data: routines } = await this.client
        .from('routines')
        .select(
          'id,name,description,frequency,days,is_active,created_at,updated_at,program_id,code,order_index'
        )
        .eq('user_id', uid)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: false });
      const routineIds = (routines || []).map((r: any) => r.id);
      const { data: rex } = await this.client
        .from('routine_exercises')
        .select(
          'routine_id,exercise_id,exercise_name,target_sets,target_reps,order_index,weight,weight_unit,reserve_reps,notes,sets_json,goal_weight,goal_unit'
        )
        .in('routine_id', routineIds);
      const { data: rdays } = await this.client
        .from('routine_days')
        .select('routine_id,day')
        .in('routine_id', routineIds);
      return { routines: routines || [], rex: rex || [], rdays: rdays || [] };
    });

    // Fill missing exercise_name by joining exercises when needed
    const missingNamesIds = Array.from(
      new Set(
        (rex || [])
          .filter((e: any) => !e.exercise_name)
          .map((e: any) => e.exercise_id)
      )
    ).filter(Boolean);
    const namesMap = new Map<string, string>();
    if (missingNamesIds.length) {
      const { data: exRows } = await this.client
        .from('exercises')
        .select('id,name')
        .eq('user_id', uid)
        .in('id', missingNamesIds);
      (exRows || []).forEach((row: any) => namesMap.set(row.id, row.name));
    }

    const { data: programs } = await this.client
      .from('programs')
      .select('id,name,is_active')
      .eq('user_id', uid);
    const pname = new Map<string, string>();
    const pactive = new Map<string, boolean>();
    (programs || []).forEach((p: any) => { pname.set(p.id, p.name); pactive.set(p.id, (p.is_active as boolean) !== false); });

    const exByRoutine = new Map<string, any[]>();
    (rex || []).forEach((e: any) => {
      const arr = exByRoutine.get(e.routine_id) || [];
      arr.push({
        exerciseId: e.exercise_id,
        exerciseName: e.exercise_name || namesMap.get(e.exercise_id) || '',
        weight: typeof e.weight === 'number' ? e.weight : 0,
        weightUnit: e.weight_unit || 'lb',
        targetSets: e.target_sets,
        targetReps: e.target_reps,
        reserveReps: typeof e.reserve_reps === 'number' ? e.reserve_reps : 0,
        notes: e.notes || '',
        goalWeight: e.goal_weight,
        goalUnit: e.goal_unit,
        order: e.order_index,
        sets: e.sets_json
          ? (() => {
              try {
                return JSON.parse(e.sets_json);
              } catch {
                return [];
              }
            })()
          : [],
      });
      exByRoutine.set(e.routine_id, arr);
    });
    const daysByRoutine = new Map<string, string[]>();
    (rdays || []).forEach((d: any) => {
      const arr = daysByRoutine.get(d.routine_id) || [];
      arr.push(d.day);
      daysByRoutine.set(d.routine_id, arr);
    });

    return (routines || [])
      .map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description || '',
      exercises: (exByRoutine.get(r.id) || []).sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      ),
      frequency: r.frequency || 'weekly',
      days: Array.from(new Set(daysByRoutine.get(r.id) || r.days || [])),
      isActive: !!r.is_active,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
      programName: r.program_id ? pname.get(r.program_id) : undefined,
      code: r.code || undefined,
      order: r.order_index,
    }));
  }

  async updateProgramActive(name: string, isActive: boolean): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    try {
      await this.client
        .from('programs')
        .update({ is_active: !!isActive })
        .eq('user_id', uid)
        .eq('name', name);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (this.isMissingColumnError(e) || msg.includes('schema cache')) {
        await this.client
          .from('programs')
          .update({ is_active: !!isActive })
          .eq('user_id', uid)
          .eq('name', name);
      } else { throw e; }
    }
    this.invalidateMemo(`programs:${uid}`);
    this.invalidateMemo(`routines:${uid}`);
  }

  async upsertRoutine(r: {
    id: string;
    name: string;
    description?: string;
    frequency: string;
    days: string[];
    isActive: boolean;
    programName?: string;
    exercises: any[];
    createdAt: Date;
    updatedAt: Date;
    code?: string;
  }): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    const isUuid = (v: string | undefined) =>
      !!v &&
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
        v
      );
    let programId: string | null = null;
    if (r.programName) {
      const { data: prog } = await this.client
        .from('programs')
        .select('id')
        .eq('user_id', uid)
        .eq('name', r.programName)
        .limit(1)
        .maybeSingle();
      programId = prog?.id || null;
    }
    let routineId: string | null = null;
    const routineCode = r.code || await this.generateRoutineCode();
    try {
      let canUseProvidedId = false;
      if (isUuid(r.id)) {
        const { data: owned } = await this.client
          .from('routines')
          .select('id')
          .eq('user_id', uid)
          .eq('id', r.id)
          .limit(1)
          .maybeSingle();
        canUseProvidedId = !!owned?.id;
      }
      if (canUseProvidedId) {
        await this.client.from('routines').upsert(
          {
            id: r.id,
            user_id: uid,
            name: r.name,
            description: r.description ?? null,
            frequency: r.frequency,
            days: r.days ?? [],
            is_active: r.isActive,
            program_id: programId,
            created_at: r.createdAt.toISOString(),
            updated_at: r.updatedAt.toISOString(),
            code: routineCode,
          },
          { onConflict: 'id' }
        );
        routineId = r.id;
      } else {
        const { data: inserted } = await this.client
          .from('routines')
          .insert({
            user_id: uid,
            name: r.name,
            description: r.description ?? null,
            frequency: r.frequency,
            days: r.days ?? [],
            is_active: r.isActive,
            program_id: programId,
            created_at: r.createdAt.toISOString(),
            updated_at: r.updatedAt.toISOString(),
            code: routineCode,
          })
          .select('id')
          .single();
        routineId = inserted?.id || null;
      }
    } catch (e: any) {
      if (this.isMissingColumnError(e)) {
        if (isUuid(r.id)) {
          await this.client.from('routines').upsert(
            {
              id: r.id,
              user_id: uid,
              name: r.name,
              description: r.description ?? null,
              frequency: r.frequency,
              days: r.days ?? [],
              is_active: r.isActive,
              program_id: programId,
              created_at: r.createdAt.toISOString(),
              updated_at: r.updatedAt.toISOString(),
            },
            { onConflict: 'id' }
          );
          routineId = r.id;
        } else {
          const { data: inserted } = await this.client
            .from('routines')
            .insert({
              user_id: uid,
              name: r.name,
              description: r.description ?? null,
              frequency: r.frequency,
              days: r.days ?? [],
              is_active: r.isActive,
              program_id: programId,
              created_at: r.createdAt.toISOString(),
              updated_at: r.updatedAt.toISOString(),
            })
            .select('id')
            .single();
          routineId = inserted?.id || null;
        }
      } else {
        const msg = String(e?.message || '');
        const code = String(e?.code || '');
        const shouldInsert = code === '42501' || code === '21000' || msg.includes('row-level security') || msg.includes('USING') || msg.includes('ON CONFLICT');
        if (shouldInsert) {
          const { data: inserted } = await this.client
            .from('routines')
            .insert({
              user_id: uid,
              name: r.name,
              description: r.description ?? null,
              frequency: r.frequency,
              days: r.days ?? [],
              is_active: r.isActive,
              program_id: programId,
              created_at: r.createdAt.toISOString(),
              updated_at: r.updatedAt.toISOString(),
              code: routineCode,
            })
            .select('id')
            .single();
          routineId = inserted?.id || null;
        } else { throw e; }
      }
    }
    if (!routineId) return;

    await this.client
      .from('routine_exercises')
      .delete()
      .eq('routine_id', routineId);
    await this.client.from('routine_days').delete().eq('routine_id', routineId);
    if (r.exercises && r.exercises.length) {
      const rows: any[] = [];
      for (const e of r.exercises) {
        let exerciseId = e.exerciseId;
        if (!isUuid(exerciseId)) {
          const { data: existingEx } = await this.client
            .from('exercises')
            .select('id')
            .eq('user_id', uid)
            .eq('name', e.exerciseName)
            .limit(1)
            .maybeSingle();
          exerciseId = existingEx?.id;
          if (!exerciseId) {
            const created = await this.upsertExercise({
              name: e.exerciseName,
              muscleGroup: 'full_body',
              equipment: 'other',
              description: '',
              defaultWeightUnit: e.weightUnit || 'lb',
              isCustom: true,
            });
            exerciseId = created.id;
          }
        } else {
          const { data: existsForUser } = await this.client
            .from('exercises')
            .select('id')
            .eq('user_id', uid)
            .eq('id', exerciseId)
            .limit(1)
            .maybeSingle();
          if (!existsForUser?.id) {
            const { data: byName } = await this.client
              .from('exercises')
              .select('id')
              .eq('user_id', uid)
              .eq('name', e.exerciseName)
              .limit(1)
              .maybeSingle();
            exerciseId = byName?.id || exerciseId;
            if (!byName?.id) {
              const created = await this.upsertExercise({
                name: e.exerciseName,
                muscleGroup: 'full_body',
                equipment: 'other',
                description: '',
                defaultWeightUnit: e.weightUnit || 'lb',
                isCustom: true,
              });
              exerciseId = created.id;
            }
          }
        }
        rows.push({
          user_id: uid,
          routine_id: routineId,
          exercise_id: exerciseId,
          exercise_name: e.exerciseName || null,
          target_sets: e.targetSets,
          target_reps: e.targetReps,
          order_index: e.order,
          weight: Number(e.weight) || 0,
          weight_unit: e.weightUnit || 'lb',
          reserve_reps: Number(e.reserveReps) || 0,
          notes: e.notes || '',
          sets_json: (e as any).sets ? JSON.stringify((e as any).sets) : null,
          goal_weight: (e as any).goalWeight ? Number((e as any).goalWeight) : null,
          goal_unit: (e as any).goalUnit || null,
        });
      }
      const seen = new Set<string>();
      const unique = rows.filter((row) => {
        const key = String(row.exercise_id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (unique.length) {
        await this.client
          .from('routine_exercises')
          .upsert(unique, { onConflict: 'routine_id,exercise_id' });
      }
    }
    if (r.days && r.days.length) {
      const drows = Array.from(new Set(r.days)).map((d) => ({
        user_id: uid,
        routine_id: routineId,
        day: d,
      }));
      if (drows.length) {
        await this.client
          .from('routine_days')
          .upsert(drows, { onConflict: 'routine_id,day' });
      }
    }
    this.invalidateMemo(`routines:${uid}`);
  }

  async deleteRoutine(id: string): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    const c = this.client;
    const { data: rex } = await c
      .from('routine_exercises')
      .select('exercise_id')
      .eq('user_id', uid)
      .eq('routine_id', id);
    const exIds = Array.from(new Set((rex || []).map((e: any) => e.exercise_id).filter(Boolean)));
    await c.from('routine_exercises').delete().eq('routine_id', id);
    await c.from('routine_days').delete().eq('routine_id', id);
    await c.from('routines').delete().eq('user_id', uid).eq('id', id);
    if (exIds.length) {
      const { data: usedElsewhere } = await c
        .from('routine_exercises')
        .select('exercise_id')
        .eq('user_id', uid)
        .in('exercise_id', exIds)
        .neq('routine_id', id);
      const stillUsed = new Set<string>((usedElsewhere || []).map((r: any) => r.exercise_id));
      const toDelete = exIds.filter(eid => !stillUsed.has(eid));
      if (toDelete.length) {
        await c.from('exercises').delete().eq('user_id', uid).in('id', toDelete);
      }
    }
    this.invalidateMemo(`routines:${uid}`);
  }

  async updateRoutineExerciseOrder(
    routineId: string,
    orderedExerciseIds: string[]
  ): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    const rows = orderedExerciseIds.map((eid, i) => ({
      user_id: uid,
      routine_id: routineId,
      exercise_id: eid,
      order_index: i,
    }));
    if (rows.length) {
      await this.client
        .from('routine_exercises')
        .upsert(rows, { onConflict: 'routine_id,exercise_id' });
    }
    this.invalidateMemo(`routines:${uid}`);
  }

  async upsertWorkoutSession(
    sessionDate: string,
    startTs?: number,
    endTs?: number,
    durationSec?: number
  ): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    const payload: any = { user_id: uid, session_date: sessionDate };
    if (typeof startTs === 'number')
      payload.start_ts = new Date(startTs).toISOString();
    if (typeof endTs === 'number')
      payload.end_ts = new Date(endTs).toISOString();
    if (typeof durationSec === 'number') payload.duration_seconds = durationSec;
    const key = `upsertWorkout:${uid}:${sessionDate}`;
    await this.safeCall(key, async () => {
      try {
        await this.client
          .from('workout_sessions')
          .upsert(payload, { onConflict: 'user_id,session_date' });
      } catch (e: any) {
        const msg = String(e?.message || '');
        const code = String(e?.code || '');
        if (this.isMissingColumnError(e) || code === 'PGRST205' || msg.includes('schema cache')) {
          return;
        }
        throw e;
      }
      return;
    }, 8000, 2);
    this.invalidateMemo(`getWorkout:${uid}:${sessionDate}`);
  }
  async getWorkoutSessionByDate(
    sessionDate: string
  ): Promise<{
    start_ts?: string;
    end_ts?: string;
    duration_seconds?: number;
  } | null> {
    const uid = await this.getUserId();
    if (!uid) return null;
    const key = `getWorkout:${uid}:${sessionDate}`;
    return await this.memoized(key, async () => {
      try {
        const { data } = await this.client
          .from('workout_sessions')
          .select('*')
          .eq('user_id', uid)
          .eq('session_date', sessionDate)
          .limit(1)
          .maybeSingle();
        return data || null;
      } catch (e: any) {
        const msg = String(e?.message || '');
        const code = String(e?.code || '');
        if (this.isMissingColumnError(e) || code === 'PGRST205' || msg.includes('schema cache')) {
          return null;
        }
        throw e;
      }
    });
  }

  async clearWorkoutSession(sessionDate: string): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    try {
      await this.client
        .from('workout_sessions')
        .update({ start_ts: null, end_ts: null, duration_seconds: null })
        .eq('user_id', uid)
        .eq('session_date', sessionDate);
    } catch (e: any) {
      const msg = String(e?.message || '');
      const code = String(e?.code || '');
      if (this.isMissingColumnError(e) || code === 'PGRST205' || msg.includes('schema cache')) {
        return;
      }
      throw e;
    }
    this.invalidateMemo(`getWorkout:${uid}:${sessionDate}`);
  }

  async getExercises(): Promise<any[]> {
    const uid = await this.getUserId();
    if (!uid) return [];
    const key = `exercises:${uid}`;
    const rows = await this.memoized(key, async () => {
      const { data } = await this.client
        .from('exercises')
        .select(
          'id,name,muscle_group,equipment,description,default_weight_unit,is_custom,created_at,updated_at'
        )
        .eq('user_id', uid)
        .order('name', { ascending: true });
      return data || [];
    });
    return (rows || []).map((e: any) => ({
      id: e.id,
      name: e.name,
      muscleGroup: e.muscle_group,
      equipment: e.equipment,
      description: e.description || '',
      defaultWeightUnit: e.default_weight_unit || 'lb',
      isCustom: !!e.is_custom,
      createdAt: new Date(e.created_at),
      updatedAt: new Date(e.updated_at),
    }));
  }

  async getExerciseById(id: string): Promise<any | null> {
    const uid = await this.getUserId();
    if (!uid) return null;
    const { data } = await this.client
      .from('exercises')
      .select(
        'id,name,muscle_group,equipment,description,default_weight_unit,is_custom,created_at,updated_at'
      )
      .eq('user_id', uid)
      .eq('id', id)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      muscleGroup: data.muscle_group,
      equipment: data.equipment,
      description: data.description || '',
      defaultWeightUnit: data.default_weight_unit || 'lb',
      isCustom: !!data.is_custom,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  async upsertExercise(ex: {
    id?: string;
    name: string;
    muscleGroup: string;
    equipment: string;
    description?: string;
    defaultWeightUnit: 'lb' | 'kg';
    isCustom?: boolean;
  }): Promise<{ id: string }> {
    const uid = await this.getUserId();
    if (!uid) return { id: '' };
    const row: any = {
      user_id: uid,
      name: ex.name,
      muscle_group: ex.muscleGroup,
      equipment: ex.equipment,
      description: ex.description ?? null,
      default_weight_unit: ex.defaultWeightUnit,
      is_custom: !!ex.isCustom,
    };
    if (ex.id) row.id = ex.id;
    const { data } = await this.client
      .from('exercises')
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .limit(1);
    const id = (data && data[0]?.id) || ex.id || '';
    this.invalidateMemo(`exercises:${uid}`);
    return { id };
  }

  async deleteExercise(id: string): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    await this.client
      .from('exercises')
      .delete()
      .eq('user_id', uid)
      .eq('id', id);
    this.invalidateMemo(`exercises:${uid}`);
  }

  async logExercise(log: {
    exerciseId: string;
    routineId?: string;
    sets: {
      reps: number;
      weight: number;
      weightUnit: 'lb' | 'kg';
      isPersonalRecord?: boolean;
    }[];
    notes?: string;
    date: Date;
    totalVolume: number;
    maxWeight: number;
  }): Promise<{ id: string }> {
    const uid = await this.getUserId();
    if (!uid) return { id: '' };
    const { data } = await this.client
      .from('exercise_logs')
      .insert({
        user_id: uid,
        exercise_id: log.exerciseId,
        routine_id: log.routineId ?? null,
        notes: log.notes ?? '',
        log_date: log.date.toISOString(),
        total_volume: log.totalVolume,
        max_weight: log.maxWeight,
      })
      .select('id')
      .limit(1);
    const id = (data && data[0]?.id) || '';
    if (id && log.sets && log.sets.length) {
      const rows = log.sets.map((s, i) => ({
        log_id: id,
        reps: s.reps,
        weight: s.weight,
        weight_unit: s.weightUnit,
        is_personal_record: !!s.isPersonalRecord,
        order_index: i,
      }));
      await this.client.from('exercise_sets').insert(rows);
    }
    this.invalidateMemo(`exerciseLogs:${uid}`);
    return { id };
  }

  async logExercisesBulk(logs: Array<{
    exerciseId: string;
    routineId?: string;
    sets: { reps: number; weight: number; weightUnit: 'lb'|'kg'; isPersonalRecord?: boolean; }[];
    notes?: string;
    date: Date;
    totalVolume: number;
    maxWeight: number;
  }>): Promise<string[]> {
    const uid = await this.getUserId();
    if (!uid || !logs || !logs.length) return [];
    const clientIds = logs.map(() => uuidv4());
    const logRows = logs.map((l, i) => ({
      id: clientIds[i],
      user_id: uid,
      exercise_id: l.exerciseId,
      routine_id: l.routineId ?? null,
      notes: l.notes ?? '',
      log_date: l.date.toISOString(),
      total_volume: l.totalVolume,
      max_weight: l.maxWeight,
    }));
    await this.client.from('exercise_logs').insert(logRows);
    const setsAll: any[] = [];
    for (let i = 0; i < logs.length; i++) {
      const lid = clientIds[i];
      if (!lid) continue;
      const l = logs[i];
      for (let si = 0; si < (l.sets || []).length; si++) {
        const s = l.sets[si];
        setsAll.push({
          log_id: lid,
          reps: s.reps,
          weight: s.weight,
          weight_unit: s.weightUnit,
          is_personal_record: !!s.isPersonalRecord,
          order_index: si,
        });
      }
    }
    if (setsAll.length) {
      await this.client.from('exercise_sets').insert(setsAll);
    }
    this.invalidateMemo(`exerciseLogs:${uid}`);
    return clientIds;
  }

  async getExerciseLogs(): Promise<any[]> {
    const uid = await this.getUserId();
    if (!uid) return [];
    const key = `exerciseLogs:${uid}`;
    const raw = await this.memoized(key, async () => {
      const { data: logs } = await this.client
        .from('exercise_logs')
        .select(
          'id,exercise_id,routine_id,notes,log_date,total_volume,max_weight'
        )
        .eq('user_id', uid)
        .order('log_date', { ascending: false });

      const logRows = logs || [];
      const logIds = logRows.map((l: any) => l.id).filter(Boolean);
      let setsRows: any[] = [];
      if (logIds.length) {
        const { data: allSets } = await this.client
          .from('exercise_sets')
          .select('log_id,reps,weight,weight_unit,is_personal_record,order_index')
          .in('log_id', logIds)
          .order('order_index');
        setsRows = allSets || [];
      }

      const setsByLog = new Map<string, any[]>();
      for (const s of setsRows) {
        const arr = setsByLog.get(s.log_id) || [];
        arr.push(s);
        setsByLog.set(s.log_id, arr);
      }

      return logRows.map((l: any) => ({
        id: l.id,
        exerciseId: l.exercise_id,
        routineId: l.routine_id || undefined,
        sets: (setsByLog.get(l.id) || []).map((s: any) => ({
          reps: s.reps,
          weight: s.weight,
          weightUnit: s.weight_unit,
          isPersonalRecord: !!s.is_personal_record,
        })),
        notes: l.notes || '',
        date: l.log_date,
        totalVolume: l.total_volume,
        maxWeight: l.max_weight,
        createdAt: l.log_date,
      }));
    });

    return raw.map((r: any) => ({
      ...r,
      date: new Date(r.date),
      createdAt: new Date(r.createdAt)
    }));
  }

  async isNewUser(): Promise<boolean> {
    const uid = await this.getUserId();
    if (!uid) return true;
    const { count: progCount } = await this.client
      .from('programs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid);
    if ((progCount || 0) > 0) return false;
    const { count: routineCount } = await this.client
      .from('routines')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid);
    return (routineCount || 0) === 0;
  }

  async updateRoutineExerciseSets(
    routineId: string,
    exerciseId: string,
    sets: Array<{ reps: number; weight: number; rir: number; unit?: 'lb'|'kg' }>,
    targetReps?: number
  ): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    const setsJson = JSON.stringify(sets || []);
    const update: any = { sets_json: setsJson };
    if (typeof targetReps === 'number') {
      update.target_reps = targetReps;
    }
    await this.client
      .from('routine_exercises')
      .update(update)
      .eq('routine_id', routineId)
      .eq('exercise_id', exerciseId);
      
    this.invalidateMemo(`routines:${uid}`);
  }

  async updateRoutineExerciseWeight(
    routineId: string,
    exerciseId: string,
    weight: number
  ): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    await this.client
      .from('routine_exercises')
      .update({ weight: Number(weight) || 0 })
      .eq('routine_id', routineId)
      .eq('exercise_id', exerciseId);

    this.invalidateMemo(`routines:${uid}`);
  }

  async updateRoutineExerciseGoal(
    routineId: string,
    exerciseId: string,
    goalWeight: number | null,
    goalUnit: 'lb'|'kg' | null
  ): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    await this.client
      .from('routine_exercises')
      .update({
        goal_weight: goalWeight,
        goal_unit: goalUnit
      })
      .eq('routine_id', routineId)
      .eq('exercise_id', exerciseId);

    this.invalidateMemo(`routines:${uid}`);
  }

  async deleteExerciseLogsForDateAndExercises(
    date: Date,
    targets: Array<{ exerciseId: string; routineId?: string | null }>
  ): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    const dStr = date.toISOString().slice(0, 10);
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    const exerciseIds = Array.from(new Set((targets || []).map(t => t?.exerciseId).filter(Boolean)));
    if (!exerciseIds.length) return;

    const { data: logs } = await this.client
      .from('exercise_logs')
      .select('id,exercise_id,routine_id')
      .eq('user_id', uid)
      .gte('log_date', start.toISOString())
      .lte('log_date', end.toISOString())
      .in('exercise_id', exerciseIds);

    const wanted = new Set((targets || []).map(t => `${t.exerciseId}::${t.routineId ?? ''}`));
    const ids = (logs || [])
      .filter((l: any) => wanted.has(`${l.exercise_id}::${l.routine_id ?? ''}`))
      .map((l: any) => l.id)
      .filter(Boolean);

    if (ids.length > 0) {
      await this.client.from('exercise_sets').delete().in('log_id', ids);
      await this.client.from('exercise_logs').delete().in('id', ids);
    }
    this.invalidateMemo(`exerciseLogs:${uid}`);
    this.invalidateMemo(`exerciseLogsDate:${uid}:${dStr}`);
  }

  async deleteExerciseLogsForDate(date: Date): Promise<void> {
    const uid = await this.getUserId();
    if (!uid) return;
    const dStr = date.toISOString().slice(0, 10);
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);

    const { data: logs } = await this.client
      .from('exercise_logs')
      .select('id')
      .eq('user_id', uid)
      .gte('log_date', start.toISOString())
      .lte('log_date', end.toISOString());

    const ids = (logs || []).map((l: any) => l.id);
    if (ids.length > 0) {
       await this.client.from('exercise_sets').delete().in('log_id', ids);
       await this.client.from('exercise_logs').delete().in('id', ids);
    }
    this.invalidateMemo(`exerciseLogs:${uid}`);
    this.invalidateMemo(`exerciseLogsDate:${uid}:${dStr}`);
  }

  async getExerciseLogsForDate(date: Date): Promise<any[]> {
    const uid = await this.getUserId();
    if (!uid) return [];
    const dStr = date.toISOString().slice(0, 10);
    const key = `exerciseLogsDate:${uid}:${dStr}`;
    
    return await this.memoized(key, async () => {
      const start = new Date(date); start.setHours(0, 0, 0, 0);
      const end = new Date(date); end.setHours(23, 59, 59, 999);

      const { data: logs } = await this.client
        .from('exercise_logs')
        .select('id,exercise_id,routine_id,notes,log_date,total_volume,max_weight, routines (name)')
        .eq('user_id', uid)
        .gte('log_date', start.toISOString())
        .lte('log_date', end.toISOString())
        .order('log_date', { ascending: true });

      const logRows = logs || [];
      const logIds = logRows.map((l: any) => l.id).filter(Boolean);
      let setsRows: any[] = [];
      if (logIds.length) {
        const { data: allSets } = await this.client
          .from('exercise_sets')
          .select('log_id,reps,weight,weight_unit,is_personal_record,order_index')
          .in('log_id', logIds)
          .order('order_index');
        setsRows = allSets || [];
      }

      const setsByLog = new Map<string, any[]>();
      for (const s of setsRows) {
        const arr = setsByLog.get(s.log_id) || [];
        arr.push(s);
        setsByLog.set(s.log_id, arr);
      }

      // Also fetch exercise names to populate the view correctly if needed
      const exerciseIds = Array.from(new Set(logRows.map((l: any) => l.exercise_id)));
      const exerciseMap = new Map<string, any>();
      if (exerciseIds.length > 0) {
         const { data: exercises } = await this.client
           .from('exercises')
           .select('id,name,default_weight_unit')
           .in('id', exerciseIds);
         (exercises || []).forEach((e: any) => exerciseMap.set(e.id, e));
      }

      return logRows.map((l: any) => {
        const exDef = exerciseMap.get(l.exercise_id);
        return {
          id: l.id,
          exerciseId: l.exercise_id,
          exerciseName: exDef?.name || '',
          routineId: l.routine_id || undefined,
          routineName: (l.routines as any)?.name || undefined,
          sets: (setsByLog.get(l.id) || []).map((s: any) => ({
            reps: s.reps,
            weight: s.weight,
            weightUnit: s.weight_unit,
            isPersonalRecord: !!s.is_personal_record,
          })),
          notes: l.notes || '',
          date: l.log_date,
          totalVolume: l.total_volume,
          maxWeight: l.max_weight,
          weightUnit: exDef?.default_weight_unit || 'lb',
          createdAt: l.log_date,
        };
      });
    });
  }
}

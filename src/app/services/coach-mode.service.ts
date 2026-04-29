import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface CoachModeState {
  isCoachMode: boolean;
  userId7Digit: string | null;
  loading: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CoachModeService {
  private supabase = inject(SupabaseService);
  private coachModeSubject = new BehaviorSubject<CoachModeState>({
    isCoachMode: false,
    userId7Digit: null,
    loading: true
  });

  public coachModeState$: Observable<CoachModeState> = this.coachModeSubject.asObservable();

  constructor() {
    this.initializeCoachMode();
  }

  private async initializeCoachMode() {
    await this.refreshUserData();

    // Subscribe to auth changes
    this.supabase.getClient().auth.onAuthStateChange(() => {
      this.refreshUserData();
    });
  }

  async refreshUserData() {
    try {
      const user = await this.supabase.getCurrentUser();
      if (!user) {
        this.coachModeSubject.next({
          isCoachMode: false,
          userId7Digit: null,
          loading: false
        });
        return;
      }

      const profile = await this.supabase.getUserProfileData();

      if (profile) {
        this.coachModeSubject.next({
          isCoachMode: profile.mode === 'coach',
          userId7Digit: profile.user_id_7digit,
          loading: false
        });
      } else {
        this.coachModeSubject.next({
          isCoachMode: false,
          userId7Digit: null,
          loading: false
        });
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
      this.coachModeSubject.next({
        isCoachMode: false,
        userId7Digit: null,
        loading: false
      });
    }
  }

  async setCoachMode(enabled: boolean): Promise<void> {
    try {
      const user = await this.supabase.getCurrentUser();
      if (!user) throw new Error('User not authenticated');
      const newMode = enabled ? 'coach' : 'personal';

      // Use SECURITY DEFINER RPC to avoid RLS/FK issues entirely
      try { await this.supabase.getClient().rpc('set_profile_mode', { new_mode: newMode }); }
      catch (e) { console.error('RPC set_profile_mode failed', e); throw e; }

      await this.supabase.invalidateUserProfileData();
      const currentState = this.coachModeSubject.value;
      this.coachModeSubject.next({ ...currentState, isCoachMode: enabled });
    } catch (error) {
      console.error('Error updating coach mode:', error);
      throw error;
    }
  }

  get currentState(): CoachModeState {
    return this.coachModeSubject.value;
  }

  get isCoachMode(): boolean {
    return this.currentState.isCoachMode;
  }

  get userId7Digit(): string | null {
    return this.currentState.userId7Digit;
  }

  get loading(): boolean {
    return this.currentState.loading;
  }

  async getUserProfile() {
    try {
      const user = await this.supabase.getCurrentUser();
      if (!user) return null;
      return await this.supabase.getUserProfileData();
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  async ensureUserId7Digit(): Promise<string | null> {
    try {
      const user = await this.supabase.getCurrentUser();
      if (!user) return null;
      const cur = await this.supabase.getUserProfileData();
      const existing = (cur as any)?.user_id_7digit || null;
      if (existing) return existing;
      await this.supabase.getClient().rpc('ensure_user_profile');
      await this.supabase.invalidateUserProfileData();
      const after = await this.supabase.getUserProfileData();
      return ((after as any)?.user_id_7digit || null);
    } catch (e) {
      console.error('ensureUserId7Digit failed', e);
      return null;
    }
  }
}

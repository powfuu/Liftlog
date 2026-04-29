import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { StorageService } from '../services/storage.service';

export const authGuard = async (): Promise<boolean | UrlTree> => {
  const router = inject(Router);
  const supabase = inject(SupabaseService);
  const storage = inject(StorageService);

  try {
    const isAuth = await supabase.isAuthenticated();
    if (!isAuth) {
      return router.createUrlTree(['/onboarding']);
    }

    // Check local storage first (fastest)
    const localDone = await storage.getOnboardingCompleted().catch(() => false);
    if (localDone) {
      return true;
    }

    // Check remote status
    const remoteDone = await supabase.hasCompletedOnboarding().catch(() => false);
    if (remoteDone) {
      await storage.setOnboardingCompleted(true);
      return true;
    }

    // Authenticated but onboarding not completed
    return router.createUrlTree(['/onboarding']);
  } catch {
    return router.createUrlTree(['/onboarding']);
  }
};

export const publicGuard = async (): Promise<boolean | UrlTree> => {
  const router = inject(Router);
  const supabase = inject(SupabaseService);
  const storage = inject(StorageService);

  try {
    const isAuth = await supabase.isAuthenticated();
    if (!isAuth) {
      return true;
    }

    // If authenticated, check if onboarding is done
    const localDone = await storage.getOnboardingCompleted().catch(() => false);
    if (localDone) {
      return router.createUrlTree(['/tabs/home']);
    }

    const remoteDone = await supabase.hasCompletedOnboarding().catch(() => false);
    if (remoteDone) {
      await storage.setOnboardingCompleted(true);
      return router.createUrlTree(['/tabs/home']);
    }

    return true;
  } catch {
    return true;
  }
};

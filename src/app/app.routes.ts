import { Routes } from '@angular/router';
import { authGuard, publicGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'onboarding',
    loadComponent: () => import('./onboarding/onboarding-modal/onboarding-modal.component').then((m) => m.OnboardingModalComponent),
    canActivate: [publicGuard],
  },
  {
    path: 'tabs',
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.TabsPage),
    canActivate: [authGuard],
    children: [
      {
        path: 'coaching',
        loadComponent: () => import('./coaching/coaching.page').then((m) => m.CoachingPage),
      },
      {
        path: 'home',
        loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'programs',
        loadComponent: () => import('./programs/programs.page').then((m) => m.ProgramsPage),
      },
      {
        path: 'programs/routines',
        loadComponent: () => import('./routines/routines.page').then((m) => m.RoutinesPage),
      },
      {
        path: 'tracking',
        loadComponent: () => import('./tracking/tracking.page').then((m) => m.TrackingPage),
      },
      {
        path: 'weight',
        loadComponent: () => import('./weight/weight.page').then((m) => m.WeightPage),
      },
      {
        path: 'account',
        loadComponent: () => import('./account/account.page').then((m) => m.AccountPage),
      },
      {
        path: 'coaching/client/:id',
        loadComponent: () => import('./client-profile/client-profile.page').then((m) => m.ClientProfilePage),
      },
      {
        path: '',
        redirectTo: '/tabs/home',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: 'auth/callback',
    redirectTo: '/tabs/home',
    pathMatch: 'full',
  },
  {
    path: '',
    redirectTo: '/tabs/home',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: '/tabs/home',
  }
];

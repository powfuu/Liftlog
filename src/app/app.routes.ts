import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'tabs',
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.TabsPage),
    children: [
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
        path: 'statistics',
        loadComponent: () => import('./statistics/statistics.page').then((m) => m.StatisticsPage),
      },
      {
        path: '',
        redirectTo: '/tabs/home',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/home',
    pathMatch: 'full',
  },
];

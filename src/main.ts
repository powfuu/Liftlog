import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { CDK_DRAG_CONFIG } from '@angular/cdk/drag-drop';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { setAssetPath, addIcons } from 'ionicons';
import { chevronBack, chevronForward, chevronDown, close, calendar, barbell, statsChart, flame, list, body, peopleCircle, personCircle, globe, checkmark } from 'ionicons/icons';
setAssetPath(document.baseURI || (window.location.origin + '/'));
addIcons({
  'chevron-back': chevronBack,
  'chevron-forward': chevronForward,
  'chevron-down': chevronDown,
  close, calendar, barbell, statsChart, flame, list, body,
  'people-circle': peopleCircle,
  'person-circle': personCircle,
  globe, checkmark
});

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ swipeBackEnabled: false, mode: "ios", scrollAssist: false, scrollPadding: false }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    { provide: CDK_DRAG_CONFIG, useValue: { dragStartDelay: 0 } },
    provideAnimations(),
  ],
});

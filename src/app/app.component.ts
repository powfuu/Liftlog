import { Component, OnInit, inject } from '@angular/core';
import { IonApp, IonRouterOutlet, IonIcon } from '@ionic/angular/standalone';
import { StorageService } from './services/storage.service';
import { StoreService } from './services/store.service';
import { KeyboardService } from './services/keyboard.service';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { addIcons } from 'ionicons';
import { chevronDown } from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, IonIcon],
})
export class AppComponent implements OnInit {
  private storageService = inject(StorageService);
  private store = inject(StoreService);
  private keyboard = inject(KeyboardService);
  private router = inject(Router);
  async ngOnInit() {
    try {
      addIcons({ chevronDown });
      // Initialization is handled by StoreService
      // No direct database or data loading here to avoid duplication
      await this.keyboard.init();
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#000000' });
      }

      const done = await this.storageService.getOnboardingCompleted();
      if (!done) {
        this.router.navigate(['/onboarding']);
      }
    } catch (error) {
      console.error('Error initializing app:', error);
    }
  }

  private async loadInitialData() {}

  async closeKeyboard() {
    try {
      await Keyboard.hide();
    } catch {}
  }
}

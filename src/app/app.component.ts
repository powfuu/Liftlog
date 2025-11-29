import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { StorageService } from './services/storage.service';
import { StoreService } from './services/store.service';
import { KeyboardService } from './services/keyboard.service';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  constructor(
    private storageService: StorageService,
    private store: StoreService,
    private keyboard: KeyboardService
  ) {}

  async ngOnInit() {
    try {
      // Initialization is handled by StoreService
      // No direct database or data loading here to avoid duplication
      await this.keyboard.init();
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#000000' });
      }
      
      console.log('Liftlog app initialized successfully!');
    } catch (error) {
      console.error('Error initializing app:', error);
    }
  }

  private async loadInitialData() {}
}

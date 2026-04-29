import { Component, OnInit, inject, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonApp, IonRouterOutlet, IonIcon, IonToast, IonAlert } from '@ionic/angular/standalone';
import { GlobalLoaderComponent } from './components/global-loader/global-loader.component';
import { StorageService } from './services/storage.service';
import { LoaderService } from './services/loader.service';
import { SupabaseService } from './services/supabase.service';
import { StoreService } from './services/store.service';
import { KeyboardService } from './services/keyboard.service';
import { SwipeHintService } from './services/swipe-hint.service';
import { Keyboard } from '@capacitor/keyboard';
import { App } from '@capacitor/app';
import { addIcons } from 'ionicons';
import { chevronDown, chevronBack, chevronForward } from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { Router } from '@angular/router';
import { NotificationService } from './services/notification.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [IonApp, IonRouterOutlet, IonIcon, IonToast, IonAlert, GlobalLoaderComponent, CommonModule],
})
export class AppComponent implements OnInit, AfterViewInit {
  private storageService = inject(StorageService);
  private store = inject(StoreService);
  private keyboard = inject(KeyboardService);
  private router = inject(Router);
  private swipeHintService = inject(SwipeHintService);
  private supabase = inject(SupabaseService);
  private loader = inject(LoaderService);
  private notifications = inject(NotificationService);
  private themeService = inject(ThemeService);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  @ViewChild('swipeOverlay') swipeOverlay!: ElementRef<HTMLDivElement>;

  activeInputValue = '';
  isKeyboardOpen = false;

  ngAfterViewInit() {
    if (this.swipeOverlay) {
      this.swipeHintService.registerOverlay(this.swipeOverlay.nativeElement);
    }

    // Listen for keyboard open/close via body class
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          this.ngZone.run(() => {
            this.isKeyboardOpen = document.body.classList.contains('keyboard-open');
            this.cdr.detectChanges();
          });
        }
      });
    });
    observer.observe(document.body, { attributes: true });

    // Listen for input focus and changes
    window.addEventListener('focusin', this.handleFocusIn.bind(this));
    window.addEventListener('focusout', this.handleFocusOut.bind(this));
    window.addEventListener('input', this.handleInput.bind(this));
    window.addEventListener('ionInput', this.handleInput.bind(this)); // Handle Ionic inputs

    // visibilitychange fires synchronously with the repaint when the app resumes,
    // before the Capacitor bridge delivers appStateChange. Using it here catches
    // the iOS animation-restart bug (animations reset to opacity:0 on unfreeze)
    // as early as possible.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        document.body.classList.add('instant-resume');
        requestAnimationFrame(() => document.body.classList.remove('instant-resume'));
      }
    });
  }

  handleFocusIn(e: Event) {
    this.updateActiveValue(e);
  }

  handleFocusOut() {
    // We don't clear immediately to keep preview while keyboard closes
    // Logic can be added here if needed
  }

  handleInput(e: Event) {
    this.updateActiveValue(e);
  }

  private updateActiveValue(e: Event) {
    const target = e.target as any;
    let val = '';

    // Check custom event detail (Ionic)
    if (e instanceof CustomEvent && e.detail && e.detail.value !== undefined) {
      val = e.detail.value;
    }
    // Check target value (Native or Ionic component property)
    else if (target && target.value !== undefined) {
      val = target.value;
    }
    // Fallback for contenteditable
    else if (target && target.textContent) {
       // val = target.textContent; // Maybe too much for now
    }

    this.ngZone.run(() => {
      this.activeInputValue = val || '';
      this.cdr.detectChanges();
    });
  }

  async ngOnInit() {
    try {
      addIcons({ chevronDown, chevronBack, chevronForward });
      // Initialization is handled by StoreService
      // No direct database or data loading here to avoid duplication
      await this.keyboard.init();
      await this.themeService.init();

      await this.decideStart();
      await this.notifications.init();

      if (Capacitor.isNativePlatform()) {
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            // iOS re-evaluates CSS animations on resume, restarting entrance
            // animations from opacity:0. Snap them to their final state for one frame.
            document.body.classList.add('instant-resume');
            requestAnimationFrame(() => document.body.classList.remove('instant-resume'));
            if (this.store.getState().hydrated) {
              this.ngZone.run(() => this.loader.hide());
            }
          }
        });
      }

      this.supabase.getClient().auth.onAuthStateChange(async (event, session) => {
        // Handle explicit auth changes if needed
        // But for route protection, Guards are better
        if (event === 'SIGNED_OUT') {
           this.router.navigate(['/onboarding'], { replaceUrl: true });
        }
      });

      // Ensure swipe overlay is hidden on any navigation
      this.router.events.subscribe(() => {
        try {
          this.swipeHintService.hide(true);
          document.body.classList.remove('tab-swipe-progressing');
        } catch {}
      });
    } catch (error) {
      console.error('Error initializing app:', error);
    }
  }

  private async loadInitialData() {}

  private async decideStart() {
    // Logic moved to AuthGuard for better routing control
    // This method can be kept for reacting to auth state changes if needed
    // or simply rely on the router guards.
    
    // However, if we are already on a page and auth changes (e.g. logout), 
    // we might want to redirect.
    // The onAuthStateChange subscription will handle that.
    
    // For initial load, the Guards will handle it.
  }

  async closeKeyboard() {
    try {
      await Keyboard.hide();
    } catch {}
  }

  async signInWithGoogle() {
    try { await this.supabase.signInWithGoogle(); } catch {}
  }
}

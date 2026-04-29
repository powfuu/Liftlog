import { Component, OnDestroy, AfterViewInit, inject, NgZone, ViewChild } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CommonModule } from '@angular/common';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { home, barbell, list, albums, fitness, body, personCircle, people } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { Router, NavigationEnd, NavigationStart } from '@angular/router';
import { SwipeHintService } from '../services/swipe-hint.service';
import { SupabaseService } from '../services/supabase.service';
import { CoachModeService } from '../services/coach-mode.service';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [CommonModule, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  standalone: true
})
export class TabsPage implements OnDestroy, AfterViewInit {
  navFirstLoad = true;
  private enableSwipe = true;
  avatarUrl: string = '';
  avatarInitials: string = '';
  isCoachMode = false;
  private orderedTabIds: string[] = [];

  @ViewChild(IonTabs) tabs!: IonTabs;

  private touchStartX = 0;
  private touchStartY = 0;
  private isSwiping = false;
  private activePage: HTMLElement | null = null;
  private overlayProgressing = false;
  private progressTimer: any = null;

  private zone = inject(NgZone);
  private router = inject(Router);
  private swipeHintService = inject(SwipeHintService);
  private supabase = inject(SupabaseService);
  private coachModeService = inject(CoachModeService);

  constructor() {
    addIcons({ home, barbell, list, albums, fitness, body, 'person-circle': personCircle, people });
  }

  private setupCoachMode() {
    this.coachModeService.coachModeState$.subscribe(state => {
      this.isCoachMode = state.isCoachMode;
      this.updateTabIndices();
    });
  }

  private updateTabIndices() {
    // Update tab indices based on coach mode
    // 0: Coaching (if coach mode) / Home (if personal mode)
    // 1: Home (if coach mode) / Programs (if personal mode)
    // 2: Programs (if coach mode) / Weight (if personal mode)
    // 3: Weight (if coach mode) / Tracking (if personal mode)
    // 4: Tracking (if coach mode) / Account (if personal mode)
    // 5: Account (if coach mode)

    if (this.isCoachMode) {
      this.orderedTabIds = ['coaching', 'home', 'programs', 'weight', 'tracking', 'account'];
      this.tabHistory = {
        0: '/tabs/coaching',
        1: '/tabs/home',
        2: '/tabs/programs',
        3: '/tabs/weight',
        4: '/tabs/tracking',
        5: '/tabs/account'
      };
    } else {
      this.orderedTabIds = ['home', 'programs', 'weight', 'tracking', 'account'];
      this.tabHistory = {
        0: '/tabs/home',
        1: '/tabs/programs',
        2: '/tabs/weight',
        3: '/tabs/tracking',
        4: '/tabs/account'
      };
    }
  }

  ngAfterViewInit() {
    this.navFirstLoad = false;

    // Initialize coach mode instantly from current state
    this.isCoachMode = this.coachModeService.isCoachMode;
    this.updateTabIndices();

    this.loadAvatar();
    this.setupCoachMode();
    try {
      this.supabase.getClient().auth.onAuthStateChange((_evt, _session) => {
        this.loadAvatar();
        this.setupCoachMode();
      });
    } catch {}

    this.initIndicatorAnimation();

    if (this.enableSwipe) {
      this.zone.runOutsideAngular(() => {
        document.addEventListener('touchstart', this.onStart, { passive: true });
        document.addEventListener('touchmove', this.onMove, { passive: true });
        document.addEventListener('touchend', this.onEnd, { passive: true });
        document.addEventListener('touchcancel', this.onCancel, { passive: true });
        document.addEventListener('mousedown', this.onStart as any);
        document.addEventListener('mousemove', this.onMove as any);
        document.addEventListener('mouseup', this.onEnd as any);
      });
    }

    this.router.events.subscribe(ev => {
      if (ev instanceof NavigationEnd) {
        this.updateTabHistory(this.router.url);
        this.swipeHintService.hide(true);
        document.body.classList.remove('tab-swipe-progressing');
        this.overlayProgressing = false;
        this.resetParallax();
        try {
          document.body.classList.remove('modal-open');
          document.body.classList.remove('keyboard-open');
          const ionicOverlays = Array.from(document.querySelectorAll('ion-modal, ion-popover, ion-toast')) as any[];
          ionicOverlays.forEach((el: any) => {
            try { if (typeof el.dismiss === 'function') el.dismiss(); else el.remove(); } catch {}
          });
          const overlays = Array.from(document.querySelectorAll('.dropdown-overlay, .loader-overlay.open')) as HTMLElement[];
          overlays.forEach(el => {
            if (el.classList.contains('loader-overlay')) el.classList.remove('open');
            else el.remove();
          });
          const pageEl = this.getActivePageEl();
          if (pageEl) {
            pageEl.style.transition = '';
            pageEl.style.transform = '';
            pageEl.style.willChange = '';
          }
        } catch {}
      }
      if (ev instanceof NavigationStart) {
        this.swipeHintService.hide(true);
        document.body.classList.remove('tab-swipe-progressing');
        this.overlayProgressing = false;
        this.resetParallax();
        try {
          const ionicOverlays = Array.from(document.querySelectorAll('ion-modal, ion-popover, ion-toast')) as any[];
          ionicOverlays.forEach((el: any) => {
            try { if (typeof el.dismiss === 'function') el.dismiss(); else el.remove(); } catch {}
          });
        } catch {}
      }
    });
  }

  private async loadAvatar() {
    try {
      const { data } = await this.supabase.getClient().auth.getUser();
      const user = data.user;
      const meta = (user?.user_metadata as any) || {};
      const name = meta.full_name || meta['name'] || '';
      const email = user?.email || '';
      const pic = await this.supabase.getUserAvatarUrl();
      this.zone.run(() => {
        const bust = pic ? pic + (pic.includes('?') ? '&' : '?') + 'v=' + Date.now() : '';
        this.avatarUrl = bust;
        const display = name || (email ? email.split('@')[0] : '');
        this.avatarInitials = (display || email || 'U').split(/\s|@|\./).filter(Boolean).slice(0,2).map((s: any) => (s && s[0] ? String(s[0]).toUpperCase() : '')).join('');
      });
    } catch (error) {
      console.error('Error loading avatar:', error);
      this.zone.run(() => {
        this.avatarUrl = '';
        this.avatarInitials = 'U';
      });
    }
  }

  private initIndicatorAnimation() {
    const updateOrigin = (btn: HTMLElement) => {
      const rect = btn.getBoundingClientRect();
      const cx = Math.round(rect.width / 2);
      btn.style.setProperty('--indicator-origin-x', `${cx}px`);
    };
    const btns = Array.from(document.querySelectorAll('ion-tab-bar ion-tab-button')) as HTMLElement[];
    btns.forEach((btn) => {
      btn.addEventListener('click', () => updateOrigin(btn), { passive: true });
    });
    const selected = document.querySelector('ion-tab-bar ion-tab-button.tab-selected') as HTMLElement | null;
    if (selected) updateOrigin(selected);
  }

  private animateActiveTab() {}

  ngOnDestroy() {
    if (this.enableSwipe) {
      document.removeEventListener('touchstart', this.onStart as any);
      document.removeEventListener('touchmove', this.onMove as any);
      document.removeEventListener('touchend', this.onEnd as any);
      document.removeEventListener('touchcancel', this.onCancel as any);
      document.removeEventListener('mousedown', this.onStart as any);
      document.removeEventListener('mousemove', this.onMove as any);
      document.removeEventListener('mouseup', this.onEnd as any);
    }
  }

  private getActivePageEl(): HTMLElement | null {
    const outlet = document.querySelector('ion-tabs ion-router-outlet');
    if (!outlet) return null;
    const pages = Array.from(outlet.children) as HTMLElement[];
    for (const p of pages) {
      if (!p.classList.contains('ion-page-hidden')) return p;
    }
    return null;
  }

  private touchStartTime = 0;
  private startedAtEdge = false;
  private inScrollable = false;
  private androidSafeStart = false;
  private startedAtBottom = false;

  private detectScrollable(target: EventTarget | null): boolean {
    let el = target as HTMLElement | null;
    let depth = 0;
    while (el && depth < 12) {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY || style.overflow;
      const isScrollable = ((overflowY === 'auto' || overflowY === 'scroll') && (el.scrollHeight > el.clientHeight));
      if (isScrollable) return true;
      el = el.parentElement;
      depth++;
    }
    return false;
  }

  private isInTabBar(target: EventTarget | null): boolean {
    let el = target as HTMLElement | null;
    let depth = 0;
    while (el && depth < 12) {
      if (el.tagName && el.tagName.toLowerCase() === 'ion-tab-bar') return true;
      if (el.classList && el.classList.contains('glass-nav-container')) return true;
      el = el.parentElement;
      depth++;
    }
    return false;
  }

  private isInNoSwipeZone(target: EventTarget | null): boolean {
    let el = target as HTMLElement | null;
    let depth = 0;
    while (el && depth < 12) {
      const cl = el.classList || { contains: () => false };
      const noSwipeAttr = el.getAttribute && el.getAttribute('data-no-tab-swipe');
      const isCopyChip = cl.contains('code-chip') || cl.contains('copy-btn');
      const isButton = el.tagName && el.tagName.toLowerCase() === 'button';
      if (noSwipeAttr === 'true' || isCopyChip || isButton && cl.contains('copy-btn')) return true;
      el = el.parentElement;
      depth++;
    }
    return false;
  }

  private onStart = (ev: TouchEvent | MouseEvent) => {
    const t = (ev instanceof TouchEvent) ? ev.changedTouches[0] : ev;
    this.touchStartX = t.clientX;
    this.touchStartY = t.clientY;
    this.touchStartTime = Date.now();
    this.isSwiping = false;
    this.activePage = this.getActivePageEl();

    if (this.isInTabBar((ev instanceof TouchEvent) ? ev.target : (ev as MouseEvent).target as any)) {
      this.overlayProgressing = false;
      this.swipeHintService.hide(true);
      return;
    }
    if (this.isInNoSwipeZone((ev instanceof TouchEvent) ? ev.target : (ev as MouseEvent).target as any)) {
      this.overlayProgressing = false;
      this.swipeHintService.hide(true);
      return;
    }

    const edgeZone = 20;
    const w = window.innerWidth || 375;
    const isAndroid = Capacitor.getPlatform() === 'android';
    this.startedAtEdge = (!isAndroid) && ((this.touchStartX <= edgeZone) || (this.touchStartX >= (w - edgeZone)));
    const safeZone = 36;
    this.androidSafeStart = isAndroid && (this.touchStartX >= safeZone) && (this.touchStartX <= (w - safeZone));
    const h = window.innerHeight || 800;
    const bottomZone = 100;
    this.startedAtBottom = this.touchStartY >= (h - bottomZone);
    this.inScrollable = this.detectScrollable((ev instanceof TouchEvent) ? ev.target : (ev as MouseEvent).target as any);

    if (this.activePage) {
      this.activePage.style.willChange = '';
    }

    // Reset overlay state
    if (!this.overlayProgressing) {
      this.swipeHintService.hide();
    }
  };

  private onMove = (ev: TouchEvent | MouseEvent) => {
    if (this.overlayProgressing || !this.activePage) return;
    if (this.isInTabBar((ev instanceof TouchEvent) ? ev.target : (ev as MouseEvent).target as any)) return;
    const isAndroid = Capacitor.getPlatform() === 'android';
    if (!isAndroid && !this.startedAtEdge) return;
    if (isAndroid && !this.androidSafeStart) return;
    if (this.startedAtBottom) return;

    // For mouse, ensure button is pressed
    if (ev instanceof MouseEvent && ev.buttons !== 1) return;

    const t = (ev instanceof TouchEvent) ? ev.changedTouches[0] : ev;
    const dx = t.clientX - this.touchStartX;
    const dy = t.clientY - this.touchStartY;

    // Check gesture direction
    if (!this.isSwiping) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        this.isSwiping = true;
        if (this.activePage) this.activePage.style.willChange = 'transform';
      } else {
        return;
      }
    }

    // Handle Swipe
    if (this.isSwiping) {
      const allowLeftGesture = this.canSwipeRight(); // Drag Left -> Go Right
      const allowRightGesture = this.canSwipeLeft(); // Drag Right -> Go Left

      let validSwipe = false;
      let dir: 'left' | 'right' = 'left';

      const strongHorizontal = Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.2;
      if (dx < 0 && allowLeftGesture && strongHorizontal) {
        validSwipe = true;
        dir = 'left';
      } else if (dx > 0 && allowRightGesture && strongHorizontal) {
        validSwipe = true;
        dir = 'right';
      }

      if (validSwipe) {
        this.swipeHintService.show(dir);
      } else {
        // Do not manipulate page transform on invalid swipes to preserve vertical scroll
        this.swipeHintService.hide();
      }
    }
  };

  private onEnd = (ev: TouchEvent | MouseEvent) => {
    if (this.isInTabBar((ev instanceof TouchEvent) ? ev.target : (ev as MouseEvent).target as any)) {
      this.swipeHintService.hide(true);
      this.overlayProgressing = false;
      this.resetParallax();
      this.isSwiping = false;
      return;
    }
    if (this.startedAtBottom) {
      this.swipeHintService.hide(true);
      document.body.classList.remove('tab-swipe-progressing');
      this.overlayProgressing = false;
      this.resetParallax();
      this.isSwiping = false;
      return;
    }
    if (!this.isSwiping || this.overlayProgressing || !this.activePage) {
      this.swipeHintService.hide(true);
      document.body.classList.remove('tab-swipe-progressing');
      this.overlayProgressing = false;
      this.resetParallax();
      this.isSwiping = false;
      return;
    }

    const t = (ev instanceof TouchEvent) ? ev.changedTouches[0] : ev;
    const dx = t.clientX - this.touchStartX;
    const dy = t.clientY - this.touchStartY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const dt = Date.now() - this.touchStartTime;
    const velocity = adx / (dt || 1); // px/ms

    const allowLeftGesture = this.canSwipeRight();
    const allowRightGesture = this.canSwipeLeft();

    let triggerNav = false;
    let dir: 'left'|'right' = 'left';

    // Thresholds
    // 1. Minimum distance if dragging slowly: 120px (about 1/3 of screen width on many phones)
    // 2. Minimum distance if flicking: 40px
    // 3. Minimum velocity for flick: 0.4 px/ms
    const minDragDist = 120;
    const minFlickDist = 40;
    const minFlickVel = 0.4;

    const isFlick = dt < 300 && velocity > minFlickVel && adx > minFlickDist;
    const isDrag = adx > minDragDist;

    if ((isFlick || isDrag) && adx > ady) {
      if (dx < 0 && allowLeftGesture) {
        triggerNav = true;
        dir = 'left';
      } else if (dx > 0 && allowRightGesture) {
        triggerNav = true;
        dir = 'right';
      }
    }

    if (triggerNav) {
      this.startProgress(dir);
    } else {
      this.swipeHintService.hide(true);
      this.resetParallax();
    }
    this.isSwiping = false;
  };

  private onCancel = (_ev: TouchEvent) => {
    this.swipeHintService.hide(true);
    document.body.classList.remove('tab-swipe-progressing');
    this.overlayProgressing = false;
    this.resetParallax();
    this.isSwiping = false;
  };

  // 0: Home Tab -> /tabs/home
  // 1: Programs Tab -> /tabs/programs (can have children like /tabs/programs/routines)
  // 2: Weight Tab -> /tabs/weight
  // 3: Tracking Tab -> /tabs/tracking
  // 4: Account Tab -> /tabs/account

  // Store last visited child route for each tab index
  private tabHistory: {[key: number]: string} = {
    0: '/tabs/home',
    1: '/tabs/programs',
    2: '/tabs/weight',
    3: '/tabs/tracking',
    4: '/tabs/account'
  };

  private updateTabHistory(url: string) {
      if (url.includes('/tabs/tracking')) this.tabHistory[this.isCoachMode ? 4 : 3] = url;
      else if (url.includes('/tabs/programs') || url.includes('/tabs/programs/routines')) this.tabHistory[this.isCoachMode ? 2 : 1] = url;
      else if (url.includes('/tabs/weight')) this.tabHistory[this.isCoachMode ? 3 : 2] = url;
      else if (url.includes('/tabs/home')) this.tabHistory[this.isCoachMode ? 1 : 0] = url;
      else if (url.includes('/tabs/account')) this.tabHistory[this.isCoachMode ? 5 : 4] = url;
      else if (url.includes('/tabs/coaching')) this.tabHistory[0] = url;
  }

  private currentIndex(): number {
    const url = this.router.url || '';
    if (this.isCoachMode) {
      if (url.includes('/tabs/account')) return 5;
      if (url.includes('/tabs/tracking')) return 4;
      if (url.includes('/tabs/weight')) return 3;
      if (url.includes('/tabs/programs')) return 2;
      if (url.includes('/tabs/home')) return 1;
      if (url.includes('/tabs/coaching')) return 0;
      return 0; // Default to coaching
    } else {
      if (url.includes('/tabs/account')) return 4;
      if (url.includes('/tabs/tracking')) return 3;
      if (url.includes('/tabs/weight')) return 2;
      if (url.includes('/tabs/programs')) return 1;
      return 0; // Default to Home
    }
  }

  private isSwipeDisabled(): boolean {
    return false;
  }
  private canSwipeLeft(): boolean {
    return !this.isSwipeDisabled() && this.currentIndex() > 0;
  }
  private canSwipeRight(): boolean {
    return !this.isSwipeDisabled() && this.currentIndex() < (this.isCoachMode ? 5 : 4);
  }

  private navigateLeft() {
    const urlNow = this.router.url || '';
    if (urlNow.includes('/tabs/programs/routines')) {
      this.zone.run(() => {
        this.router.navigateByUrl('/tabs/programs');
      });
      return;
    }
    const i = this.currentIndex();
    if (i === 0) return;

    const nextIndex = i - 1;
    const targetTab = this.orderedTabIds[nextIndex];

    this.zone.run(() => {
        const btn = document.querySelector(`ion-tab-button[tab="${targetTab}"]`) as HTMLElement;
        if (btn) {
          btn.click();
        } else {
          if (this.tabs) this.tabs.select(targetTab);
        }
    });
  }

  private navigateRight() {
    const i = this.currentIndex();
    if (i === (this.isCoachMode ? 5 : 4)) return;
    const nextIndex = i + 1;
    const targetTab = this.orderedTabIds[nextIndex];

    this.zone.run(() => {
        const btn = document.querySelector(`ion-tab-button[tab="${targetTab}"]`) as HTMLElement;
        if (btn) {
          btn.click();
        } else {
          if (this.tabs) this.tabs.select(targetTab);
        }
    });
  }

  private resetParallax() {
    if (!this.activePage) return;
    const el = this.activePage;
    el.style.transition = 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transform = 'translateX(0) scale(1)';
    setTimeout(() => {
      el.style.transition = '';
      el.style.willChange = '';
      el.style.transform = '';
    }, 180);
  }

  onAvatarError() {
    this.zone.run(() => { this.avatarUrl = ''; });
  }

  private startProgress(dir: 'left'|'right') {
    this.overlayProgressing = true;
    document.body.classList.add('tab-swipe-progressing');

    // 1. Force overlay to be visible and correctly oriented immediately
    this.swipeHintService.show(dir);

    // 2. Animate current page snap/rebound
    if (this.activePage) {
      this.activePage.style.transition = 'transform 300ms cubic-bezier(0.2, 1, 0.3, 1)';
      this.activePage.style.transform = 'translate3d(0, 0, 0) scale(1)';
    }

    if (this.progressTimer) clearTimeout(this.progressTimer);

    // 3. Define the Fixed Duration Sequence

    // Step A: Wait for the "Lock-in" phase (gray -> red animation start)
    // Navigate immediately for responsiveness
    this.zone.run(() => {
      if (dir === 'left') this.navigateRight(); else this.navigateLeft();
    });
    this.swipeHintService.hide(true);
    this.overlayProgressing = false;
    document.body.classList.remove('tab-swipe-progressing');
    if (this.activePage) {
      this.activePage.style.transition = '';
      this.activePage.style.transform = '';
      this.activePage.style.willChange = '';
    }

    // Clear any lingering timer since we handled cleanup above
    if (this.progressTimer) clearTimeout(this.progressTimer);
  }

  onTabPress(tabId: string, ev: Event) {
    try {
      ev.preventDefault();
      ev.stopPropagation();
    } catch {}
    if (!this.tabs) return;
    this.zone.run(() => {
      this.tabs.select(tabId);
    });
  }
}

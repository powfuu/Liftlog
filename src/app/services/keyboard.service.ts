import { Injectable } from '@angular/core';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

@Injectable({ providedIn: 'root' })
export class KeyboardService {
  private listeners: Array<{ remove: () => void }> = [];
  private isOpen = false;

  async init() {
    if (!Capacitor.isNativePlatform()) {
      this.attachImmediateFallbacks();
      return;
    }
    try {
      await Keyboard.setResizeMode({ mode: KeyboardResize.None });
    } catch {}
    await this.attachListeners();
    this.attachImmediateFallbacks();
  }

  private async attachListeners() {
    const l1 = await Keyboard.addListener('keyboardWillShow', (info: any) => {
      const h = Math.max(0, Math.round((info && info.keyboardHeight) || 0));
      if (h > 0) this.setKeyboardHeight(h);
      this.markOpen(true);
    });
    const l2 = await Keyboard.addListener('keyboardDidShow', (info: any) => {
      const h = Math.max(0, Math.round((info && info.keyboardHeight) || 0));
      if (h > 0) this.setKeyboardHeight(h);
      this.markOpen(true);
    });
    const l3 = await Keyboard.addListener('keyboardWillHide', () => {
      this.setKeyboardHeight(0);
      this.markOpen(false);
    });
    const l4 = await Keyboard.addListener('keyboardDidHide', () => {
      this.setKeyboardHeight(0);
      this.markOpen(false);
    });
    this.listeners.push(l1, l2, l3, l4);
  }

  private async runWithTimeout(label: string, fn: () => Promise<void> | void, timeoutMs: number) {
    await Promise.resolve(fn());
  }

  private markOpen(open: boolean) {
    this.isOpen = open;
    const cls = 'keyboard-open';
    const body = document.body;
    if (!body) return;
    if (open) {
      if (!body.classList.contains(cls)) body.classList.add(cls);
    } else {
      body.classList.remove(cls);
    }
  }

  private attachImmediateFallbacks() {
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (vv) {
      const onVV = () => {
        const heightDelta = Math.max(0, window.innerHeight - vv.height);
        this.setKeyboardHeight(heightDelta);
        if (heightDelta > 100 || (vv as any).offsetTop > 0) this.markOpen(true);
      };
      vv.addEventListener('resize', onVV as any, { passive: true } as any);
    }
    const onFocusIn = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const editable = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
      if (editable) {
        if (!vv) this.setKeyboardHeight(240);
        this.markOpen(true);
      }
    };
    const onFocusOut = () => {
      setTimeout(() => {
        const ae = document.activeElement as HTMLElement | null;
        const stillEditable = !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
        if (!stillEditable) {
          this.setKeyboardHeight(0);
          this.markOpen(false);
        }
      }, 50);
    };
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
  }

  private kbRaf: number | null = null;
  private kbTarget = 0;
  private setKeyboardHeight(px: number) {
    const val = Math.max(0, Math.round(px));
    if (val === this.kbTarget) return;
    this.kbTarget = val;
    if (this.kbRaf != null) return;
    this.kbRaf = requestAnimationFrame(() => {
      this.kbRaf = null;
      try {
        document.documentElement.style.setProperty('--kb-height', `${this.kbTarget}px`);
      } catch {}
    });
  }

  destroy() {
    for (const l of this.listeners) {
      try { l.remove(); } catch {}
    }
    this.listeners = [];
  }
}

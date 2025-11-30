import { Injectable } from '@angular/core';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

@Injectable({ providedIn: 'root' })
export class KeyboardService {
  private listeners: Array<{ remove: () => void }> = [];
  private isOpen = false;

  async init() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
    } catch {}
    await this.attachListeners();
  }

  private async attachListeners() {
    const l1 = await Keyboard.addListener('keyboardWillShow', async (info) => {
      await this.runWithTimeout('keyboardWillShow', async () => {
        this.markOpen(true);
      }, 800);
    });
    const l2 = await Keyboard.addListener('keyboardDidShow', async (info) => {
      await this.runWithTimeout('keyboardDidShow', async () => {
        this.markOpen(true);
      }, 800);
    });
    const l3 = await Keyboard.addListener('keyboardWillHide', async () => {
      await this.runWithTimeout('keyboardWillHide', async () => {
        this.markOpen(false);
      }, 800);
    });
    const l4 = await Keyboard.addListener('keyboardDidHide', async () => {
      await this.runWithTimeout('keyboardDidHide', async () => {
        this.markOpen(false);
      }, 800);
    });
    this.listeners.push(l1, l2, l3, l4);
  }

  private async runWithTimeout(label: string, fn: () => Promise<void> | void, timeoutMs: number) {
    const start = Date.now();
    const stack = new Error().stack || '';
    let timedOut = false;
    const timeout = new Promise<void>((resolve) => {
      const id = setTimeout(() => {
        timedOut = true;
        console.error('[KeyboardTimeout]', { label, duration: Date.now() - start, stack });
        resolve();
      }, timeoutMs);
      Promise.resolve()
        .then(fn)
        .then(() => {
          clearTimeout(id);
          if (timedOut) return;
          console.log('[KeyboardEvent]', { label, duration: Date.now() - start });
          resolve();
        })
        .catch((e) => {
          clearTimeout(id);
          console.error('[KeyboardError]', { label, error: e, stack });
          resolve();
        });
    });
    await timeout;
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

  destroy() {
    for (const l of this.listeners) {
      try { l.remove(); } catch {}
    }
    this.listeners = [];
  }
}

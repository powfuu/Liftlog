import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SwipeHintService {
  private overlayEl: HTMLElement | null = null;

  registerOverlay(el: HTMLElement) {
    this.overlayEl = el;
  }

  private getOverlay(): HTMLElement | null {
    // If we have a registered element, check if it's still in the DOM
    if (this.overlayEl && this.overlayEl.isConnected) {
      return this.overlayEl;
    }
    // If not, clear the reference
    this.overlayEl = null;

    // Fallback: try to find it in DOM if not registered yet
    const el = document.querySelector('.tab-swipe-overlay') as HTMLElement;
    if (el) {
      this.overlayEl = el;
      return el;
    }
    return null;
  }

  show(direction: 'left' | 'right') {
    const el = this.getOverlay();
    if (!el) return;
    
    const cl = el.classList;
    // Ensure we start fresh if switching directions rapidly
    if (direction === 'left') {
      if (!cl.contains('left')) {
        cl.add('left');
        cl.remove('right');
      }
    } else {
      if (!cl.contains('right')) {
        cl.add('right');
        cl.remove('left');
      }
    }
    
    // Ensure element is visible before animating
    el.style.display = 'flex';
    // Use requestAnimationFrame to ensure style application
    requestAnimationFrame(() => {
      if (!cl.contains('visible')) cl.add('visible');
    });
  }

  hide(immediate = false) {
    const el = this.getOverlay();
    if (!el) return;
    
    if (immediate) {
      el.classList.remove('visible', 'left', 'right');
      el.style.display = 'none';
    } else {
      el.classList.remove('visible');
      // Delay removing direction classes to allow fade out with correct icon
      setTimeout(() => {
         if (!el.classList.contains('visible')) {
           el.classList.remove('left', 'right');
           el.style.display = 'none';
         }
      }, 300);
    }
  }

  hideDelayed(delayMs: number) {
    setTimeout(() => {
      this.hide();
    }, delayMs);
  }
}

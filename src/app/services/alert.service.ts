import { Injectable, inject } from '@angular/core';
import { ToastController, AlertController } from '@ionic/angular/standalone';
import { TranslationService } from './translation.service';


@Injectable({ providedIn: 'root' })
export class AlertService {
  private toastController = inject(ToastController);
  private alertController = inject(AlertController)
  private translationService = inject(TranslationService);

  async show(message: string, color: 'danger' | 'success' | 'warning' | 'medium' = 'danger') {
    try {
      try {
        const container = document.querySelector('.ion-overlay-container') as HTMLElement | null;
        if (container) container.style.zIndex = '1000000';
      } catch {}
      const toast = await this.toastController.create({
        message,
        duration: 2500,
        position: 'bottom',
        color,
        mode: 'ios',
        animated: true,
        cssClass: 'liftlog-toast'
      });
      await toast.present();
    } catch {
      this.nativeBanner(message, color);
    }
  }

  async error(message: string) { return this.show(message, 'danger'); }
  async success(message: string) { return this.show(message, 'success'); }

  async confirm(options: { header?: string; message: string; confirmText?: string; cancelText?: string; cssClass?: string; }): Promise<boolean> {
    try {
      const container = document.querySelector('.ion-overlay-container') as HTMLElement | null;
      if (container) container.style.zIndex = '1000000';
    } catch {}
    const alert = await this.alertController.create({
      header: options.header ?? this.translationService.translate('common.confirm'),
      message: options.message,
      mode: 'ios',
      cssClass: options.cssClass,
      buttons: [
        {
          text: options.cancelText ?? this.translationService.translate('common.cancel'),
          role: 'cancel'
        },
        {
          text: options.confirmText ?? this.translationService.translate('common.confirm'),
          role: 'confirm'
        }
      ],
    });
    await alert.present();
    const result = await alert.onDidDismiss();
    return result.role === 'confirm';
  }

  private nativeBanner(message: string, color: 'danger' | 'success' | 'warning' | 'medium') {
    try {
      const host = document.body;
      const el = document.createElement('div');
      el.className = 'liftlog-toast-banner';
      el.textContent = message;
      const palette: Record<string, string> = {
        danger: '#dc2626',
        success: '#10b981',
        warning: '#f59e0b',
        medium: '#6b7280'
      };
      el.style.background = '#111111';
      el.style.color = '#ffffff';
      el.style.border = `1px solid ${palette[color] || '#dc2626'}`;
      el.style.boxShadow = '0 10px 24px rgba(0,0,0,0.35)';
      el.style.padding = '10px 14px';
      el.style.borderRadius = '12px';
      el.style.position = 'fixed';
      el.style.top = 'calc(env(safe-area-inset-top) + 8px)';
      el.style.left = '50%';
      el.style.transform = 'translateX(-50%)';
      el.style.zIndex = '1000001';
      el.style.maxWidth = '86vw';
      el.style.fontSize = '14px';
      host.appendChild(el);
      setTimeout(() => {
        try { host.removeChild(el); } catch {}
      }, 2500);
    } catch {}
  }
}

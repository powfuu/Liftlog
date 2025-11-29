import { Injectable } from '@angular/core';
import { ToastController, AlertController } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class AlertService {
  constructor(private toastController: ToastController, private alertController: AlertController) {}

  async show(message: string, color: 'danger' | 'success' | 'warning' | 'medium' = 'danger') {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      position: 'bottom',
      color,
      cssClass: 'liftlog-toast'
    });
    await toast.present();
  }

  async error(message: string) { return this.show(message, 'danger'); }
  async success(message: string) { return this.show(message, 'success'); }

  async confirm(options: { header?: string; message: string; confirmText?: string; cancelText?: string; }): Promise<boolean> {
    const alert = await this.alertController.create({
      header: options.header ?? 'Confirm',
      message: options.message,
      buttons: [
        {
          text: options.cancelText ?? 'Cancel',
          role: 'cancel'
        },
        {
          text: options.confirmText ?? 'Delete',
          role: 'confirm'
        }
      ],
      cssClass: 'liftlog-alert'
    });
    await alert.present();
    const result = await alert.onDidDismiss();
    return result.role === 'confirm';
  }
}
import { Component, OnInit, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController, AlertController, createAnimation } from '@ionic/angular';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { StorageService } from '../services/storage.service';
import { NotchHeaderComponent } from '../shared/notch-header/notch-header.component';
import { CoachModeService } from '../services/coach-mode.service';
import { CoachService, CoachClient } from '../services/coach.service';
import { SupabaseService } from '../services/supabase.service';
import { Subscription } from 'rxjs';
import { addIcons } from 'ionicons';
import { people, add, trash, person, search } from 'ionicons/icons';
import { Router } from '@angular/router';
import { LoaderService } from '../services/loader.service';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { LocaleDatePipe } from '../pipes/locale-date.pipe';

@Component({
  selector: 'app-coaching',
  templateUrl: './coaching.page.html',
  styleUrls: ['./coaching.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, NotchHeaderComponent, DragDropModule, TranslatePipe, LocaleDatePipe]
})
export class CoachingPage implements OnInit, OnDestroy {
  private alertController = inject(AlertController);
  private router = inject(Router);
  private loader = inject(LoaderService);
  private translationService = inject(TranslationService);

  clients: CoachClient[] = [];
  filteredClients: CoachClient[] = [];
  loading = true;
  private subscription = new Subscription();
  private coachSvc = inject(CoachService);
  private storage = inject(StorageService);
  private supabase = inject(SupabaseService);
  showAddModal = false;
  newClientId: string = '';
  saving = false;
  modalError: string = '';
  toastOpen = false;
  toastMsg = '';
  avatarBust = Date.now();
  searchTerm: string = '';
  isTyping = false;
  private typingTimer: any = null;
  draggingId: string | null = null;
  hoverIndex: number = -1;
  imageLoadingStates: { [key: string]: boolean } = {};

  enterAnimation = (baseEl: HTMLElement) => {
    const root = baseEl.shadowRoot;

    const backdropAnimation = createAnimation()
      .addElement(root?.querySelector('ion-backdrop')!)
      .fromTo('opacity', '0.01', 'var(--backdrop-opacity)');

    const wrapperAnimation = createAnimation()
      .addElement(root?.querySelector('.modal-wrapper')!)
      .keyframes([
        { offset: 0, opacity: '0', transform: 'scale(0.95)' },
        { offset: 1, opacity: '1', transform: 'scale(1)' }
      ]);

    return createAnimation()
      .addElement(baseEl)
      .easing('cubic-bezier(0.16, 1, 0.3, 1)')
      .duration(280)
      .addAnimation([backdropAnimation, wrapperAnimation]);
  };

  leaveAnimation = (baseEl: HTMLElement) => {
    return this.enterAnimation(baseEl).direction('reverse');
  };

  getClientBadgeKey(): string {
    return this.clients.length === 1 ? 'coaching.client_singular' : 'coaching.title';
  }

  constructor() {
    addIcons({ people, add, trash, person, search });
  }

  async ngOnInit() {
  }

  ionViewWillEnter() {
    this.loadClients();
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  async loadClients() {
    this.loading = true;
    try { this.loader.show(this.translationService.translate('loader.loading_clients')); } catch {}
    try {
      this.supabase.invalidateMemo('coach:clients');
      this.clients = await this.coachSvc.getAssignedClients();
      // Apply local order if saved
      try {
        const order: string[] = await (this.storage as any).getCoachClientsOrder();
        if (Array.isArray(order) && order.length > 0) {
          const idx = (id: string) => { const i = order.indexOf(id); return i >= 0 ? i : Number.MAX_SAFE_INTEGER; };
          this.clients = [...this.clients].sort((a, b) => idx(a.client_id) - idx(b.client_id));
        }
      } catch {}
      this.filteredClients = this.clients;
      this.clients.forEach(c => {
        if (c.avatar_url) this.imageLoadingStates[c.client_id] = true;
      });
      this.avatarBust = Date.now();
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      this.loading = false;
      try { this.loader.hide(); } catch {}
    }
  }

  openAddClient() { this.showAddModal = true; this.newClientId = ''; this.modalError = ''; }
  closeAddClient() { this.showAddModal = false; this.newClientId = ''; this.modalError = ''; this.saving = false; }
  onClientIdInput(ev: any) {
    let val = '';
    if (ev?.target) {
      val = ev.target.value;
    } else if (ev?.detail) {
      val = ev.detail.value;
    }
    this.newClientId = val.replace(/\D/g, '').slice(0, 7);
    if (ev.target && ev.target.value !== this.newClientId) {
        ev.target.value = this.newClientId;
    }
    this.modalError = '';
    this.isTyping = true;
    try { clearTimeout(this.typingTimer); } catch {}
    this.typingTimer = setTimeout(() => { this.isTyping = false; }, 600);
  }
  async confirmAddClient() {
    const id = (this.newClientId || '').trim();
    if (!id || id.length !== 7) { this.modalError = this.translationService.translate('coaching.id_length_error'); return; }
    this.saving = true;
    try {
      await this.coachSvc.addClientById(id);
      await this.loadClients();
      this.closeAddClient();
      this.toastMsg = this.translationService.translate('coaching.client_added_success');
      this.toastOpen = true;
    } catch (error: any) {
      if (error?.message === 'user_not_found') {
        this.modalError = this.translationService.translate('coaching.user_not_found');
      } else {
        this.modalError = error?.message || this.translationService.translate('coaching.add_client_error');
      }
      this.saving = false;
    }
  }

  onClientAvatarError(client: CoachClient) {
    this.imageLoadingStates[client.client_id] = false;
    try { (client as any).avatar_url = null; } catch {}
  }

  onImageLoad(id: string) {
    this.imageLoadingStates[id] = false;
  }

  onSearchChange(event: any) {
    const term = (event?.target?.value || '').toLowerCase().trim();
    this.searchTerm = term;

    if (!term) {
      this.filteredClients = this.clients;
      return;
    }

    this.filteredClients = this.clients.filter(client => {
      const id7 = String((client as any).user_id_7digit || '').toLowerCase();
      return client.name.toLowerCase().includes(term) || id7.includes(term);
    });
  }

  clearSearch() {
    this.searchTerm = '';
    this.filteredClients = this.clients;
  }

  dropClients(event: CdkDragDrop<CoachClient[]>) {
    moveItemInArray(this.filteredClients, event.previousIndex, event.currentIndex);
    // Reflect on base clients order as well by mapping ids
    const order = this.filteredClients.map(c => c.client_id);
    this.clients = [...this.filteredClients];
    try { (this.storage as any).saveCoachClientsOrder(order); } catch {}
  }
  onDragStarted(id: string) { this.draggingId = id; }
  onDragEnded() { this.draggingId = null; this.hoverIndex = -1; }
  onDragEntered(i: number) { this.hoverIndex = i; }
  onDragExited(_i: number) { /* noop */ }

  async removeClient(client: CoachClient) {
    const alert = await this.alertController.create({
      header: this.translationService.translate('common.confirm'),
      mode: 'ios',
      message: this.translationService.translate('coaching.remove_client_confirm', { name: client.name }),
      buttons: [
        {
          text: this.translationService.translate('common.cancel'),
          role: 'cancel'
        },
        {
          text: this.translationService.translate('common.delete'),
          role: 'destructive',
          handler: async () => {
            try {
              await this.coachSvc.removeClient(client.id);
              await this.loadClients();
            } catch (error) {
              this.showAlert(this.translationService.translate('common.error'), this.translationService.translate('coaching.remove_client_error'));
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async viewClientProfile(client: CoachClient) {
    this.router.navigate(['/tabs/coaching/client', client.client_id]);
  }

  private async showAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: [this.translationService.translate('common.ok')]
    });
    await alert.present();
  }
}

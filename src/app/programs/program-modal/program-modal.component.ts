import { Component, OnInit, inject, Input } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon, ModalController, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, save, albums, create, download, chevronBack, chevronForward } from 'ionicons/icons';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { StorageService } from '../../services/storage.service';
import { StoreService } from '../../services/store.service';
import { LoaderService } from '../../services/loader.service';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-program-modal',
  templateUrl: './program-modal.component.html',
  styleUrls: ['./program-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, TranslatePipe],
  animations: [
    trigger('panelAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(8px) scale(0.98)' }),
        animate('220ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
      ]),
      transition(':leave', [
        animate('1ms', style({ opacity: 0 }))
      ])
    ])
  ]
})
export class ProgramModalComponent implements OnInit {
  programName = '';
  programDescription = '';
  animationState: 'entering' | 'entered' | 'exiting' = 'entering';
  @Input() mode: 'choice' | 'manual' | 'import' = 'choice';
  modeReady: 'choice' | 'manual' | 'import' | null = 'choice';
  @Input() initialName?: string;
  @Input() initialDescription?: string;
  @Input() editing: boolean = false;
  @Input() externalSave: boolean = false;
  private prevMode: 'choice' | 'manual' | 'import' = 'choice';
  modeTransition: 'left' | 'right' | 'down' | null = null;
  private modalController = inject(ModalController);
  private iconsInit = addIcons({ close, save, albums, create, download, chevronBack, chevronForward });
  importCode = '';
  private storage = inject(StorageService);
  private store = inject(StoreService);
  private loader = inject(LoaderService);
  private toastCtrl = inject(ToastController);
  private translationService = inject(TranslationService);

  ngOnInit() {
    setTimeout(() => { this.animationState = 'entered'; }, 0);
    this.modeReady = this.mode;
    if (typeof this.initialName === 'string') this.programName = this.initialName || '';
    if (typeof this.initialDescription === 'string') this.programDescription = this.initialDescription || '';
  }

  dismiss(data?: any) {
    this.animationState = 'exiting';
    this.modalController.dismiss(data);
  }

  save() {
    const name = this.programName.trim();
    if (!name) return;
    if (this.externalSave) {
      this.dismiss({ name, description: this.programDescription.trim() });
      return;
    }
    this.dismiss({ name, description: this.programDescription.trim() });
  }
  async importByCode() {
    const code = String(this.importCode || '').trim();
    if (!code) {
      const lang = this.translationService.getCurrentLang?.() || 'es';
      const msg = lang === 'es' ? 'Ingresa un ID de programa' : 'Enter a program ID';
      await this.toastCtrl.create({ message: msg, duration: 1400, color: 'danger', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
      return;
    }
    if (this.externalSave) {
      this.dismiss({ importCode: code });
      return;
    }
    try {
      this.loader.show('Importing program');
      const importedName = await this.storage.importProgramByCode(code);
      if (!importedName) {
        this.loader.hide();
        const lang = this.translationService.getCurrentLang?.() || 'es';
        const msg = lang === 'es' ? 'Código de programa inválido' : 'Invalid program code';
        await this.toastCtrl.create({ message: msg, duration: 1600, color: 'danger', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
        return;
      }
      const latestPrograms = await this.storage.getPrograms();
      const latestRoutines = await this.storage.getRoutines();
      this.store.setState({ programs: latestPrograms, routines: latestRoutines });
      const lang = this.translationService.getCurrentLang?.() || 'es';
      const ok = lang === 'es' ? `Programa ${importedName} importado` : `Program ${importedName} imported`;
      await this.toastCtrl.create({ message: ok, duration: 1200, color: 'success', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
      this.loader.hide();
      this.dismiss();
    } catch {
      this.loader.hide();
      const lang = this.translationService.getCurrentLang?.() || 'es';
      const msg = lang === 'es' ? 'Error al importar programa' : 'Failed to import program';
      await this.toastCtrl.create({ message: msg, duration: 1600, color: 'danger', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
    }
  }
  onImportInput(ev: any) {
    const target = ev.target as HTMLInputElement;
    const val = target.value;
    const clean = val.replace(/[^0-9]/g, '').slice(0, 7);
    if (val !== clean) {
      target.value = clean;
      this.importCode = clean;
    } else {
      this.importCode = val;
    }
  }

  setMode(next: 'choice' | 'manual' | 'import') {
    const from = this.mode;
    if (from === 'manual' && next === 'import') this.modeTransition = 'right';
    else if (from === 'import' && next === 'manual') this.modeTransition = 'left';
    else this.modeTransition = 'down';
    this.prevMode = from;
    this.modeReady = null; // hide immediately
    this.mode = next;
    setTimeout(() => { this.modeReady = next; }, 0);
  }
}

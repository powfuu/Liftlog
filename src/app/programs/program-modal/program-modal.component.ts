import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, save, albums } from 'ionicons/icons';

@Component({
  selector: 'app-program-modal',
  templateUrl: './program-modal.component.html',
  styleUrls: ['./program-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon]
})
export class ProgramModalComponent implements OnInit {
  programName = '';
  programDescription = '';
  animationState: 'entering' | 'entered' | 'exiting' = 'entering';

  constructor(private modalController: ModalController) {
    addIcons({ close, save, albums });
  }

  ngOnInit() {
    setTimeout(() => { this.animationState = 'entered'; }, 0);
  }

  dismiss(data?: any) {
    this.animationState = 'exiting';
    setTimeout(() => this.modalController.dismiss(data), 300);
  }

  save() {
    const name = this.programName.trim();
    if (!name) return;
    this.dismiss({ name, description: this.programDescription.trim() });
  }
}

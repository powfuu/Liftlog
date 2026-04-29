import { Component, Input, Output, EventEmitter } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { barbell, list, statsChart, flame, calendar, informationCircle, add, chevronBack, close } from 'ionicons/icons';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-notch-header',
  templateUrl: './notch-header.component.html',
  styleUrls: ['./notch-header.component.scss'],
  standalone: true,
  imports: [CommonModule, IonIcon, TranslatePipe],
  animations: [
    trigger('actionReveal', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-6px) scale(0.96)' }),
        animate('180ms cubic-bezier(0.22, 1, 0.36, 1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
      ]),
      transition(':leave', [
        animate('160ms cubic-bezier(0.55, 0.085, 0.68, 0.53)', style({ opacity: 0, transform: 'translateY(-6px) scale(0.96)' }))
      ])
    ])
  ]
})
export class NotchHeaderComponent {
  @Input() title = '';
  @Input() icon?: string;
  @Input() items: { icon?: string; text: string }[] = [];
  @Input() brandRed?: string;
  @Input() brandWhite?: string;
  @Input() subtitleLabel?: string;
  @Input() showTodayMark: boolean = false;
  @Input() centerChip?: string;
  @Input() actionIcon?: string;
  @Output() action = new EventEmitter<void>();
  @Input() secondaryActionIcon?: string;
  @Output() secondaryAction = new EventEmitter<void>();
  @Input() leadingActionIcon?: string;
  @Output() leadingAction = new EventEmitter<void>();

  constructor() {
    addIcons({ barbell, list, statsChart, flame, calendar, informationCircle, add, chevronBack, close });
  }

}

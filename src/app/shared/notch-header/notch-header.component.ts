import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { barbell, list, statsChart, flame, calendar, informationCircle, add, chevronBack } from 'ionicons/icons';

@Component({
  selector: 'app-notch-header',
  templateUrl: './notch-header.component.html',
  styleUrls: ['./notch-header.component.scss'],
  standalone: true,
  imports: [CommonModule, IonIcon]
})
export class NotchHeaderComponent {
  @Input() title = '';
  @Input() icon?: string;
  @Input() items: { icon?: string; text: string }[] = [];
  @Input() brandRed?: string;
  @Input() brandWhite?: string;
  @Input() subtitleLabel?: string;
  @Input() showTodayMark: boolean = false;
  @Input() actionIcon?: string;
  @Output() action = new EventEmitter<void>();
  @Input() secondaryActionIcon?: string;
  @Output() secondaryAction = new EventEmitter<void>();
  @Input() leadingActionIcon?: string;
  @Output() leadingAction = new EventEmitter<void>();

  constructor() {
    addIcons({ barbell, list, statsChart, flame, calendar, informationCircle, add, chevronBack });
  }
}

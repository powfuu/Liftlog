import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { LoaderService } from '../../services/loader.service';

@Component({
  selector: 'app-global-loader',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './global-loader.component.html',
  styleUrls: ['./global-loader.component.scss']
})
export class GlobalLoaderComponent {
  private loader = inject(LoaderService);
  state$ = this.loader.state$;
}


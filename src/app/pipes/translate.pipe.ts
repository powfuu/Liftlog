import { Pipe, PipeTransform, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { TranslationService } from '../services/translation.service';
import { Subscription } from 'rxjs';

@Pipe({
  name: 'translate',
  pure: false, // Impure pipe to update on language change
  standalone: true
})
export class TranslatePipe implements PipeTransform, OnDestroy {
  private translationService = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);
  private langSub: Subscription = this.translationService.lang$.subscribe(() => { this.cdr.markForCheck(); });
  private lastValue: string = '';

  transform(key: string, params?: any): string {
    const value = this.translationService.translate(key, params);
    this.lastValue = value;
    return value;
  }

  ngOnDestroy() {
    if (this.langSub) {
      this.langSub.unsubscribe();
    }
  }
}

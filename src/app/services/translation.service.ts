import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { StoreService } from './store.service';
import { TRANSLATIONS } from './translations.data';

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private currentLang: 'en' | 'es' | 'de' | 'ko' = 'es';
  private translations: any = TRANSLATIONS;
  lang$ = new BehaviorSubject<'en' | 'es' | 'de' | 'ko'>('es');

  private store = inject(StoreService);
  private sub = this.store.select(state => state.userPreferences.language).subscribe(lang => { if (lang) { this.setLanguage(lang as any); } });

  setLanguage(lang: 'en' | 'es' | 'de' | 'ko') {
    this.currentLang = lang;
    this.lang$.next(lang);
  }

  getCurrentLang() {
    return this.currentLang;
  }

  translate(key: string, params?: any): string {
    const keys = key.split('.');
    let value = this.translations[this.currentLang] || this.translations['en'];

    for (const k of keys) {
      if (value && value[k]) {
        value = value[k];
      } else {
        return key; // Return key if translation not found
      }
    }

    if (params) {
      Object.keys(params).forEach(param => {
        value = value.replace(new RegExp(`{{${param}}}`, 'g'), params[param]);
      });
    }

    return value;
  }
}

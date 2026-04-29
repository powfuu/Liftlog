import { Pipe, PipeTransform, inject } from '@angular/core'
import { TranslationService } from '../services/translation.service'

@Pipe({
  name: 'localeDate',
  standalone: true
})
export class LocaleDatePipe implements PipeTransform {
  private t = inject(TranslationService)
  transform(value: any, style: 'short'|'medium'|'long' = 'short'): string {
    if (!value) return ''
    const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value as Date
    const lang = this.t.getCurrentLang?.() || 'en'
    const locale = lang === 'es' ? 'es-ES' : (lang === 'de' ? 'de-DE' : (lang === 'ko' ? 'ko-KR' : 'en-US'))
    const opts: Intl.DateTimeFormatOptions = style === 'short' ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } : style === 'medium' ? { year: 'numeric', month: 'long', day: 'numeric' } : { dateStyle: 'full', timeStyle: 'short' } as any
    return new Intl.DateTimeFormat(locale, opts).format(d)
  }
}

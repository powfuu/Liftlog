import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef, inject } from '@angular/core';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonSegment, IonSegmentButton, IonLabel, IonIcon, IonInput, IonButton } from '@ionic/angular/standalone';
import { ToastController } from '@ionic/angular/standalone';
import { NotchHeaderComponent } from '../shared/notch-header/notch-header.component';
import { StoreService } from '../services/store.service';
import { UtilService } from '../services/util.service';
import { StorageService } from '../services/storage.service';
import { UserWeightLog } from '../models/weight.model';
import { Chart, registerables } from 'chart.js';
import { addIcons } from 'ionicons';
import { statsChart, barbell, fitness, addCircle, trash, trendingUp, trendingDown, body, list, removeOutline } from 'ionicons/icons';
import { TranslatePipe } from '../pipes/translate.pipe';
import { LocaleDatePipe } from '../pipes/locale-date.pipe';
import { TranslationService } from '../services/translation.service';

Chart.register(...registerables);

@Component({
  selector: 'app-weight',
  templateUrl: './weight.page.html',
  styleUrls: ['../statistics/statistics.page.scss', './weight.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonSegment, IonSegmentButton, IonLabel, IonIcon, IonInput, IonButton, NotchHeaderComponent, TranslatePipe, LocaleDatePipe]
  ,
  animations: [
    trigger('sectionEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(12px)' }),
        animate('450ms cubic-bezier(0.2, 0.8, 0.2, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0, transform: 'translateY(8px)' }))
      ])
    ]),
    trigger('gridEnter', [
      transition(':enter', [
        query('.metric-card, .chart-card, .weight-chart-card', [
          style({ opacity: 0, transform: 'translateY(12px)' }),
          stagger(80, [
            animate('500ms cubic-bezier(0.2, 0.8, 0.2, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ]),
    trigger('chartEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px)' }),
        animate('450ms cubic-bezier(0.2, 0.8, 0.2, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class WeightPage implements OnInit, OnDestroy, AfterViewInit {
  logs: UserWeightLog[] = [];
  selectedUnit: 'kg' | 'lb' = 'kg';
  currentWeight: number = 0;
  inputWeight: number | null = 0;
  animateEnter = true;
  private chart: Chart | null = null;
  @ViewChild('weightChartCanvas') weightChartCanvas!: ElementRef<HTMLCanvasElement>;
  weightHistoryData: { date: string; weight: number }[] = [];
  weightLast: number = 0;
  weightChange: number = 0;

  private store = inject(StoreService);
  private util = inject(UtilService);
  private storage = inject(StorageService);
  private cdr = inject(ChangeDetectorRef);
  private toastCtrl = inject(ToastController);
  private translationService = inject(TranslationService);
  private iconsInit = addIcons({ removeOutline, statsChart, barbell, fitness, addCircle, trash, 'trending-up': trendingUp, 'trending-down': trendingDown, body, list });

  ngOnInit() {
    this.store.select(s => s.userWeightLogs).subscribe(list => {
      this.logs = list;
      this.updateCurrent();
      this.setInputDefault();
      this.prepareWeightHistory();
      this.updateChart();
    });
  }

  ngAfterViewInit() {
    this.updateChart();
  }

  ngOnDestroy() {
    if (this.chart) this.chart.destroy();
  }

  onUnitChange(ev: any) {
    this.selectedUnit = ev.detail.value;
    this.updateCurrent();
    this.setInputDefault();
    this.prepareWeightHistory();
    this.updateChart();
  }

  async saveWeight() {
    try {
      if (this.inputWeight == null || isNaN(this.inputWeight) || this.inputWeight <= 0 || this.inputWeight > 500) {
        await this.toastCtrl.create({ message: this.translationService.translate('weight.invalid_weight'), duration: 1500, color: 'danger', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
        return;
      }
      const unit = this.selectedUnit;
      const date = new Date();
      const created = await this.storage.saveUserWeightLog({ date, weight: this.inputWeight, unit });
      this.store.addUserWeightLog(created);
      this.inputWeight = created.weight;
      this.updateCurrent();
      await this.toastCtrl.create({ message: this.translationService.translate('weight.weight_logged_msg', { value: created.weight, unit: (created.unit || unit).toUpperCase() }), duration: 1200, color: 'success', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
    } catch {
      await this.toastCtrl.create({ message: this.translationService.translate('common.error'), duration: 1200, color: 'danger', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
    }
  }

  async deleteLog(id: string) {
    try {
      await this.storage.deleteUserWeightLog(id);
      this.store.removeUserWeightLog(id);
      await this.toastCtrl.create({ message: this.translationService.translate('weight.log_deleted'), duration: 1000, color: 'success', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
      this.updateCurrent();
      this.setInputDefault();
    } catch {
      await this.toastCtrl.create({ message: this.translationService.translate('weight.delete_error'), duration: 1200, color: 'danger', position: 'bottom', cssClass: 'liftlog-toast', mode: 'ios' }).then(t => t.present());
    }
  }

  private updateCurrent() {
    if (this.logs.length === 0) { this.currentWeight = 0; return; }
    const latest = [...this.logs].sort((a,b)=> new Date(a.date).getTime() - new Date(b.date).getTime()).pop()!;
    this.currentWeight = this.convert(latest.weight, latest.unit, this.selectedUnit);
  }

  private setInputDefault() {
    this.inputWeight = this.currentWeight || 0;
  }

  get displayedLogs(): UserWeightLog[] {
    return [...this.logs].sort((a,b)=> new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  convert(v: number, from: 'kg'|'lb', to: 'kg'|'lb') { return this.util.convertWeight(v, from, to); }

  private prepareWeightHistory() {
    const arr = (this.logs || []).slice().sort((a,b)=> new Date(a.date).getTime() - new Date(b.date).getTime());
    const normalized = (arr.length ? arr : this.placeholderLogs()).map(l => ({
      date: new Date(l.date).toLocaleDateString(),
      weight: this.convert(l.weight, l.unit, this.selectedUnit)
    }));
    this.weightHistoryData = normalized;
    if (normalized.length) {
      const last = normalized[normalized.length - 1];
      this.weightLast = last.weight;
      const now = new Date();
      const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const windowFirst = arr.find(l => new Date(l.date) >= windowStart);
      const baseline = windowFirst ? this.convert(windowFirst.weight, windowFirst.unit, this.selectedUnit) : normalized[0].weight;
      this.weightChange = Math.round((this.weightLast - baseline) * 10) / 10;
    } else {
      this.weightLast = 0;
      this.weightChange = 0;
    }
  }

  private updateChart() {
    this.cdr.detectChanges();
    if (!this.weightChartCanvas) { requestAnimationFrame(() => this.updateChart()); return; }

    const hasData = this.logs.length > 0;
    // Chart needs chronological order (oldest to newest)
    const dataLogs = hasData
      ? [...this.logs].sort((a,b)=> new Date(a.date).getTime() - new Date(b.date).getTime())
      : this.placeholderLogs();

    const labels = dataLogs.map(l => new Date(l.date).toLocaleDateString(this.translationService.getCurrentLang() === 'es' ? 'es-ES' : 'en-US', {month:'short',day:'numeric'}));
    const data = dataLogs.map(l => this.convert(l.weight, l.unit, this.selectedUnit));

    if (this.chart) { this.chart.destroy(); this.chart = null; }

    const isLight = document.documentElement.classList.contains('theme-light');
    this.chart = new Chart(this.weightChartCanvas.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: '#EF4444',
          backgroundColor: (ctx) => {
            const ctx2 = ctx.chart.ctx;
            const grad = ctx2.createLinearGradient(0,0,0,200);
            grad.addColorStop(0, 'rgba(239,68,68,0.35)');
            grad.addColorStop(1, 'rgba(239,68,68,0)');
            return grad;
          },
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#EF4444',
          pointBorderColor: isLight ? '#0b0b0c' : '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 8, bottom: 0, left: 0, right: 0 } },
        plugins: { legend: { display: false }, decimation: { enabled: true, algorithm: 'lttb', samples: 50 } },
        animation: { duration: 400, easing: 'easeOutQuart' },
        transitions: {
          show: {
            animations: {
              x: { type: 'number', from: NaN, duration: 400, easing: 'easeOutQuart' },
              y: { type: 'number', from: NaN, duration: 400, easing: 'easeOutQuart' }
            }
          },
          hide: {
            animations: {
              x: { type: 'number', duration: 200 },
              y: { type: 'number', duration: 200 }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: isLight ? '#374151' : '#9ca3af', font: { weight: 'bold', size: 10 } } },
          y: {
            grid: { color: isLight ? 'rgba(17,24,39,0.08)' : 'rgba(255,255,255,0.06)' },
            border: { dash: [4,4] },
            ticks: { display: false },
            min: hasData ? undefined : 0,
            max: hasData ? undefined : 100
          }
        }
      }
    });
  }

  private placeholderLogs(): UserWeightLog[] {
    const base = [0,0,0,0,0];
    const today = new Date();
    return base.map((v,i) => ({ id: 'p'+i, date: new Date(today.getTime() + i*86400000), weight: v, unit: 'kg', createdAt: today }));
  }

  // Options removed

  onIonViewWillEnter() { this.updateChart(); }
  onIonViewDidEnter() { this.updateChart(); }

}
export default WeightPage;

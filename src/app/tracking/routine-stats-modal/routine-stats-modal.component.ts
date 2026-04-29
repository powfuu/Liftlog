import { Component, Input, ChangeDetectionStrategy, inject, AfterViewInit, ViewChildren, QueryList, ElementRef } from '@angular/core'
import { CommonModule } from '@angular/common'
import { IonIcon } from '@ionic/angular/standalone'
import { Routine } from '../../models/routine.model'
import { TranslatePipe } from '../../pipes/translate.pipe'
import { ModalController, GestureController } from '@ionic/angular'
import { TranslationService } from '../../services/translation.service'
import { NotchHeaderComponent } from '../../shared/notch-header/notch-header.component'
import { Chart, registerables } from 'chart.js'

@Component({
  selector: 'app-routine-stats-modal',
  standalone: true,
  imports: [CommonModule, IonIcon, TranslatePipe, NotchHeaderComponent],
  templateUrl: './routine-stats-modal.component.html',
  styleUrls: ['./routine-stats-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ModalController, GestureController]
})
export class RoutineStatsModalComponent implements AfterViewInit {
  @Input() routine?: Routine | null
  @Input() programName?: string | null
  @Input() metrics: Array<{ exerciseId: string; name: string; lastMaxKg: number; totalReps: number; avgVolumePerSetKg: number; totalVolumeKg: number; workoutsCount: number; avgVolumePerWorkoutKg: number; best1rmKg: number; totalSets?: number; plannedSets?: number; plannedTotalReps?: number; plannedTotalVolumeKg?: number; allTimeTotalSets?: number; allTimeTotalReps?: number; allTimeTotalVolumeKg?: number; sparklineData?: number[]; plannedWeightKg?: number }> = []
  @Input() timeRange: string = 'month'
  private modalController = inject(ModalController)
  private gestureCtrl = inject(GestureController)
  private el = inject(ElementRef)
  private translationService = inject(TranslationService)

  @ViewChildren('sparkCanvas') sparkCanvases!: QueryList<ElementRef<HTMLCanvasElement>>
  private charts = new Map<string, Chart>()

  expandedIds: Set<string> = new Set()

  constructor() {
    Chart.register(...registerables)
  }

  ngOnInit() {
    // Expand all by default
    if (this.metrics) {
      this.metrics.forEach(m => this.expandedIds.add(m.exerciseId))
    }
  }

  ngAfterViewInit() {
    setTimeout(() => this.renderSparklines(), 200)

    const gesture = this.gestureCtrl.create({
      el: this.el.nativeElement,
      gestureName: 'swipe-to-close',
      direction: 'y',
      passive: false,
      threshold: 5,
      onMove: (ev) => {
        if (ev.startY > 120) return;
        if (ev.deltaY > 0) {
          this.el.nativeElement.style.transform = `translateY(${ev.deltaY}px)`;
        }
      },
      onEnd: (ev) => {
        if (ev.startY > 120) return;
        if (ev.deltaY > 150) {
          this.close();
        } else {
          this.el.nativeElement.style.transform = '';
          this.el.nativeElement.style.transition = 'transform 0.3s ease-out';
          setTimeout(() => {
            this.el.nativeElement.style.transition = '';
          }, 300);
        }
      }
    });
    gesture.enable();
  }

  renderSparklines() {
    if (!this.sparkCanvases) return

    this.sparkCanvases.forEach(ref => {
      const el = ref.nativeElement
      const id = el.getAttribute('data-exercise-id')
      if (!id) return

      const m = this.metrics.find(x => x.exerciseId === id)
      if (!m || !m.sparklineData || m.sparklineData.length < 2) return

      const ctx = el.getContext('2d')
      if (!ctx) return

      if (this.charts.has(id)) {
        this.charts.get(id)?.destroy()
      }

      const grad = ctx.createLinearGradient(0, 0, el.width, 0)
      grad.addColorStop(0, '#DC2626')
      grad.addColorStop(1, 'rgba(220,38,38,0.1)')

      const chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: m.sparklineData.map((_, i) => i),
          datasets: [{
            data: m.sparklineData,
            borderColor: '#DC2626',
            backgroundColor: grad,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 600, easing: 'easeOutQuart' },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x: { display: false },
            y: { display: false, min: Math.min(...m.sparklineData) * 0.9 }
          },
          elements: {
            point: { radius: 0 }
          }
        }
      })
      this.charts.set(id, chart)
    })
  }

  close() { this.modalController.dismiss().catch(() => {}) }

  toggleAccordion(id: string) {
    if (this.expandedIds.has(id)) {
      this.expandedIds.delete(id)
    } else {
      this.expandedIds.add(id)
    }
  }

  get timeRangeLabel(): string {
    const m = (this.timeRange || '').toLowerCase()
    if (m === 'week') return this.translationService.translate('tracking.week')
    if (m === 'month') return this.translationService.translate('tracking.month')
    if (m === '3months') return this.translationService.translate('tracking.3_months')
    if (m === '6months') return this.translationService.translate('tracking.6_months')
    if (m === 'year') return this.translationService.translate('tracking.year')
    return m || '-'
  }
  get headerItems() {
    const items = []
    if (this.programName) items.push({ icon: 'albums', text: this.programName })
    if (this.timeRangeLabel) items.push({ icon: 'calendar', text: this.timeRangeLabel })
    if (this.metrics && this.metrics.length > 0) {
      const count = this.metrics.length
      const txt = this.translationService.translate('common.exercises')
      items.push({ icon: 'barbell', text: `${count} ${txt}`, color: 'orange' })
    }
    return items
  }

  get summary() {
    const totalWorkouts = (this.metrics || []).reduce((a, b) => a + (b.workoutsCount || 0), 0)
    const totalVolumeKg = (this.metrics || []).reduce((a, b) => a + (b.totalVolumeKg || 0), 0)
    const totalReps = (this.metrics || []).reduce((a, b) => a + (b.totalReps || 0), 0)
    const best1rmKg = (this.metrics || []).reduce((max, b) => Math.max(max, b.best1rmKg || 0), 0)
    const avgVolPerWorkoutKg = totalWorkouts ? Math.round((totalVolumeKg / totalWorkouts) * 10) / 10 : 0
    const lastMaxKg = (this.metrics || []).reduce((max, b) => Math.max(max, b.lastMaxKg || 0), 0)
    return { totalWorkouts, totalVolumeKg: Math.round(totalVolumeKg), totalReps, best1rmKg, avgVolPerWorkoutKg, lastMaxKg }
  }
}

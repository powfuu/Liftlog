import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonSegment, IonSegmentButton, IonLabel, IonBackButton, IonButtons, IonSelect, IonSelectOption, IonIcon } from '@ionic/angular/standalone';
import { NotchHeaderComponent } from '../shared/notch-header/notch-header.component';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { StoreService } from '../services/store.service';
import { ExerciseLog } from '../models/exercise.model';
import { ProgressData } from '../models/routine.model';
import { UtilService } from '../services/util.service';
import { Chart, registerables } from 'chart.js';
import { addIcons } from 'ionicons';
import { trophy } from 'ionicons/icons';

Chart.register(...registerables);

@Component({
  selector: 'app-statistics',
  templateUrl: './statistics.page.html',
  styleUrls: ['./statistics.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonBackButton, IonButtons,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonSegment, IonSegmentButton, IonLabel, IonSelect, IonSelectOption, IonIcon,
    NotchHeaderComponent
  ],
})
export class StatisticsPage implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  private charts: { 
    progress: Chart | null;
    volume: Chart | null;
    frequency: Chart | null;
  } = {
    progress: null,
    volume: null,
    frequency: null
  };
  
  exerciseLogs$: Observable<ExerciseLog[]>;
  selectedTimeRange = 'week';
  selectedExercise = 'all';
  progressData: ProgressData | null = null;

  constructor(
    private store: StoreService,
    private utilService: UtilService
  ) {
    this.exerciseLogs$ = this.store.select(state => state.exerciseLogs);
    addIcons({ trophy });
  }

  ngOnInit() {
    this.loadProgressData();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.createCharts();
    }, 100);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    
    // Destroy all charts
    Object.values(this.charts).forEach(chart => {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    });
  }

  private loadProgressData() {
    // Generate mock progress data
    this.progressData = this.generateMockProgressData();
  }

  private generateMockProgressData(): ProgressData {
    const dateRange = this.utilService.getDateRange(this.selectedTimeRange as any);
    const dataPoints = [];
    
    // Generate data points for the time range
    const days = Math.ceil((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    for (let i = 0; i <= days; i++) {
      const date = new Date(dateRange.startDate);
      date.setDate(date.getDate() + i);
      
      dataPoints.push({
        date,
        maxWeight: 100 + Math.random() * 50 + i * 2, // Progressive increase
        totalVolume: 1000 + Math.random() * 500 + i * 20,
        setCount: 3 + Math.floor(Math.random() * 3)
      });
    }

    return {
      exerciseId: 'bench_press',
      exerciseName: 'Bench Press',
      timeRange: dateRange,
      dataPoints,
      personalRecord: {
        weight: 180,
        unit: 'lbs',
        date: new Date(),
        exerciseName: 'Bench Press'
      },
      volumeTrend: {
        averageVolume: 2500,
        trendDirection: 'up',
        percentageChange: 12.5
      }
    };
  }

  private createCharts() {
    this.createProgressChart();
    this.createVolumeChart();
    this.createFrequencyChart();
  }

  private createProgressChart() {
    const ctx = document.getElementById('progressChart') as HTMLCanvasElement;
    if (!ctx) return;

    if (this.charts.progress) {
      this.charts.progress.destroy();
    }

    const data = this.progressData?.dataPoints || [];
    
    this.charts.progress = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => d.date.toLocaleDateString()),
        datasets: [{
          label: 'Max Weight (lbs)',
          data: data.map(d => d.maxWeight),
          borderColor: '#DC2626',
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#DC2626',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#ffffff',
              font: {
                size: 14,
                weight: 'bold'
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#9ca3af'
            },
            grid: {
              color: 'rgba(156, 163, 175, 0.1)'
            }
          },
          y: {
            ticks: {
              color: '#9ca3af'
            },
            grid: {
              color: 'rgba(156, 163, 175, 0.1)'
            }
          }
        }
      }
    });
  }

  private createVolumeChart() {
    const ctx = document.getElementById('volumeChart') as HTMLCanvasElement;
    if (!ctx) return;

    if (this.charts.volume) {
      this.charts.volume.destroy();
    }

    const data = this.progressData?.dataPoints || [];
    
    this.charts.volume = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.date.toLocaleDateString()),
        datasets: [{
          label: 'Total Volume',
          data: data.map(d => d.totalVolume),
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderColor: '#EF4444',
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#ffffff',
              font: {
                size: 14,
                weight: 'bold'
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#9ca3af'
            },
            grid: {
              color: 'rgba(156, 163, 175, 0.1)'
            }
          },
          y: {
            ticks: {
              color: '#9ca3af'
            },
            grid: {
              color: 'rgba(156, 163, 175, 0.1)'
            }
          }
        }
      }
    });
  }

  private createFrequencyChart() {
    const ctx = document.getElementById('frequencyChart') as HTMLCanvasElement;
    if (!ctx) return;

    if (this.charts.frequency) {
      this.charts.frequency.destroy();
    }

    // Mock frequency data by day of week
    const frequencyData = [
      { day: 'Mon', workouts: 5 },
      { day: 'Tue', workouts: 3 },
      { day: 'Wed', workouts: 4 },
      { day: 'Thu', workouts: 6 },
      { day: 'Fri', workouts: 2 },
      { day: 'Sat', workouts: 4 },
      { day: 'Sun', workouts: 1 }
    ];
    
    this.charts.frequency = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: frequencyData.map(d => d.day),
        datasets: [{
          data: frequencyData.map(d => d.workouts),
          backgroundColor: [
            '#DC2626',
            '#EF4444',
            '#F87171',
            '#FCA5A5',
            '#FECACA',
            '#FEE2E2',
            '#ffffff'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#ffffff',
              font: {
                size: 12
              },
              padding: 20
            }
          }
        }
      }
    });
  }

  onTimeRangeChange(event: any) {
    this.selectedTimeRange = event.detail.value;
    this.loadProgressData();
    setTimeout(() => {
      this.createCharts();
    }, 100);
  }

  onExerciseChange(event: any) {
    this.selectedExercise = event.detail.value;
    this.loadProgressData();
    setTimeout(() => {
      this.createCharts();
    }, 100);
  }
}

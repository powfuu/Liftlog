import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';

@Injectable({
  providedIn: 'root'
})
export class UtilService {

  constructor() {
    const saved = localStorage.getItem('liftlog_sim_offset');
    if (saved) this.simulatedDayOffset = parseInt(saved, 10) || 0;
  }

  private simulatedDayOffset = 0;

  getToday(): Date {
    const d = new Date();
    if (this.simulatedDayOffset !== 0) {
      d.setDate(d.getDate() + this.simulatedDayOffset);
    }
    return d;
  }

  simulateDayOffset(delta: number) {
    this.simulatedDayOffset += delta;
    localStorage.setItem('liftlog_sim_offset', this.simulatedDayOffset.toString());
    window.location.reload();
  }

  /**
   * Generate unique ID
   */
  generateId(): string {
    return uuidv4();
  }

  /**
   * Convert weight between lbs and kg
   */
  convertWeight(weight: number, fromUnit: 'lb' | 'kg', toUnit: 'lb' | 'kg'): number {
    if (fromUnit === toUnit) {
      return weight;
    }

    if (fromUnit === 'lb' && toUnit === 'kg') {
      return Math.round(weight * 0.453592 * 100) / 100; // Convert to kg, round to 2 decimals
    }

    if (fromUnit === 'kg' && toUnit === 'lb') {
      return Math.round(weight * 2.20462 * 100) / 100; // Convert to lbs, round to 2 decimals
    }

    return weight;
  }

  /**
   * Calculate total volume from sets
   */
  calculateTotalVolume(sets: Array<{reps: number, weight: number}>): number {
    return sets.reduce((total, set) => total + (set.reps * set.weight), 0);
  }

  /**
   * Find max weight from sets
   */
  findMaxWeight(sets: Array<{weight: number}>): number {
    return Math.max(...sets.map(set => set.weight), 0);
  }

  /**
   * Format date for display
   */
  formatDate(date: Date, format: string = 'MM/DD/YYYY'): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();

    switch (format) {
      case 'MM/DD/YYYY':
        return `${month}/${day}/${year}`;
      case 'DD/MM/YYYY':
        return `${day}/${month}/${year}`;
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      default:
        return `${month}/${day}/${year}`;
    }
  }

  /**
   * Get start and end dates for time ranges
   */
  getDateRange(range: 'week' | 'month' | '3months' | '6months' | 'year' | 'all'): {startDate: Date, endDate: Date, label: string} {
    const now = this.getToday();
    // Set end date to the very end of today to ensure we catch all logs from today
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date(now);
    // Default start to beginning of day to avoid partial day weirdness
    startDate.setHours(0, 0, 0, 0);

    switch (range) {
      case 'week': {
        const d = new Date(now);
        d.setHours(0,0,0,0);
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        return { startDate: startOfWeek, endDate, label: 'This Week' };
      }
      case 'month': {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return { startDate: startOfMonth, endDate, label: 'This Month' };
      }
      case '3months': {
        const base = new Date(now.getFullYear(), now.getMonth(), 1);
        base.setMonth(base.getMonth() - 2);
        return { startDate: base, endDate, label: 'Last 3 Months (TD)' };
      }
      case '6months': {
        const base = new Date(now.getFullYear(), now.getMonth(), 1);
        base.setMonth(base.getMonth() - 5);
        return { startDate: base, endDate, label: 'Last 6 Months (TD)' };
      }
      case 'year': {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        return { startDate: startOfYear, endDate, label: 'This Year' };
      }
      case 'all': {
        const veryOld = new Date(now.getFullYear() - 10, 0, 1);
        return { startDate: veryOld, endDate, label: 'All Time' };
      }
      default:
        return { startDate, endDate, label: 'Custom Range' };
    }
  }

  /**
   * Round number to specified decimals
   */
  roundToDecimals(value: number, decimals: number = 2): number {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  /**
   * Generate random color for charts
   */
  generateColor(index: number): string {
    const colors = [
      '#DC2626', // Red
      '#EF4444', // Light red
      '#F87171', // Lighter red
      '#FCA5A5', // Pink
      '#FECACA', // Light pink
      '#FEE2E2', // Very light pink
    ];
    return colors[index % colors.length];
  }

  /**
   * Debounce function calls
   */
  debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }
}

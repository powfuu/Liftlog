import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';

@Injectable({
  providedIn: 'root'
})
export class UtilService {

  constructor() { }

  /**
   * Generate unique ID
   */
  generateId(): string {
    return uuidv4();
  }

  /**
   * Convert weight between lbs and kg
   */
  convertWeight(weight: number, fromUnit: 'lbs' | 'kg', toUnit: 'lbs' | 'kg'): number {
    if (fromUnit === toUnit) {
      return weight;
    }
    
    if (fromUnit === 'lbs' && toUnit === 'kg') {
      return Math.round(weight * 0.453592 * 100) / 100; // Convert to kg, round to 2 decimals
    }
    
    if (fromUnit === 'kg' && toUnit === 'lbs') {
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
  getDateRange(range: 'week' | 'month' | '3months' | 'year' | 'all'): {startDate: Date, endDate: Date, label: string} {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (range) {
      case 'week':
        startDate.setDate(endDate.getDate() - 7);
        return { startDate, endDate, label: 'Last 7 Days' };
      case 'month':
        startDate.setMonth(endDate.getMonth() - 1);
        return { startDate, endDate, label: 'Last Month' };
      case '3months':
        startDate.setMonth(endDate.getMonth() - 3);
        return { startDate, endDate, label: 'Last 3 Months' };
      case 'year':
        startDate.setFullYear(endDate.getFullYear() - 1);
        return { startDate, endDate, label: 'Last Year' };
      case 'all':
        startDate.setFullYear(endDate.getFullYear() - 10);
        return { startDate, endDate, label: 'All Time' };
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
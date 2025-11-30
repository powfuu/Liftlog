export interface Routine {
  id: string;
  name: string;
  programName?: string;
  description?: string;
  exercises: RoutineExercise[];
  frequency: 'daily' | 'weekly' | 'custom';
  days?: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutineExercise {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  weightUnit: 'lbs' | 'kg';
  targetSets: number;
  targetReps: number;
  reserveReps?: number;
  notes?: string;
  order: number;
}

export interface UserPreferences {
  weightUnit: 'lbs' | 'kg';
  theme: 'dark' | 'light';
  dateFormat: string;
  notificationsEnabled: boolean;
  userName?: string;
  userEmail?: string;
  dateOfBirth?: Date;
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced';
}

export interface ProgressData {
  exerciseId: string;
  exerciseName: string;
  timeRange: DateRange;
  dataPoints: ProgressPoint[];
  personalRecord: PersonalRecord;
  volumeTrend: VolumeTrend;
}

export interface ProgressPoint {
  date: Date;
  maxWeight: number;
  totalVolume: number;
  setCount: number;
}

export interface PersonalRecord {
  weight: number;
  unit: 'lbs' | 'kg';
  date: Date;
  exerciseName: string;
}

export interface VolumeTrend {
  averageVolume: number;
  trendDirection: 'up' | 'down' | 'stable';
  percentageChange: number;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
  label: string;
}

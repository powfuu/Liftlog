export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: EquipmentType;
  description?: string;
  isCustom: boolean;
  defaultWeightUnit: 'lb' | 'kg';
  createdAt: Date;
  updatedAt: Date;
}

export interface ExerciseLog {
  id: string;
  exerciseId: string;
  routineId?: string;
  sets: ExerciseSet[];
  notes?: string;
  date: Date;
  totalVolume: number;
  maxWeight: number;
  createdAt: Date;
}

export interface ExerciseSet {
  reps: number;
  weight: number;
  weightUnit: 'lb' | 'kg';
  isPersonalRecord: boolean;
}

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'legs'
  | 'core'
  | 'full_body';

export type EquipmentType =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'bodyweight'
  | 'cable'
  | 'kettlebell'
  | 'other';

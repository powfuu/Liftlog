export interface UserWeightLog {
  id: string;
  date: Date;
  weight: number;
  unit: 'kg' | 'lb';
  createdAt: Date;
}

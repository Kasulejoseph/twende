export interface ScheduleBoundaryCase {
  readonly id: string;
  readonly offsetMinutes: number;
  readonly valid: boolean;
}

export const scheduleBoundaryCases: readonly ScheduleBoundaryCase[] = [
  { id: 'too-soon', offsetMinutes: 29, valid: false },
  { id: 'min-window', offsetMinutes: 30, valid: true },
  { id: 'max-window', offsetMinutes: 7 * 24 * 60, valid: true },
  { id: 'past-max', offsetMinutes: 7 * 24 * 60 + 1, valid: false },
  { id: 'past', offsetMinutes: -1, valid: false },
];

export const scheduledTripLeadMinutes = 120;

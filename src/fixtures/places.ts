import type { Point } from '../types/api';

export interface KnownPlace {
  readonly id: string;
  readonly name: string;
  readonly area: string;
  readonly point: Point;
}

export const acacia: KnownPlace = {
  id: 'plc_acacia',
  name: 'Acacia Mall',
  area: 'Acacia',
  point: { lat: 0.33495, lng: 32.59352, label: 'Acacia Mall' },
};

export const ntinda: KnownPlace = {
  id: 'plc_ntinda',
  name: 'Ntinda Shopping Complex',
  area: 'Ntinda',
  point: { lat: 0.35402, lng: 32.61498, label: 'Ntinda Shopping Complex' },
};

export const entebbe = {
  point: { lat: 0.04236, lng: 32.44351, label: 'Entebbe' },
} as const;

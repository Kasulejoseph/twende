import { expect } from '@playwright/test';

import type { Controllers } from '../../src/controllers';
import { isRecord } from '../../src/helpers/guards';
import { nonEmptyString } from '../support/common';

const acacia = { lat: 0.33495, lng: 32.59352 } as const;
const ntinda = { lat: 0.35402, lng: 32.61498 } as const;

export interface EstimateView {
  readonly id: string;
  readonly distanceKm: number;
  readonly etaMinutes: number;
  readonly fareAmount: number;
  readonly currency: unknown;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export const fareAmount = (value: unknown, failureMessage: string): number => {
  const fare = fareRecord(value, failureMessage);
  expect(typeof fare.amount, failureMessage).toBe('number');
  return typeof fare.amount === 'number' ? fare.amount : 0;
};

export const fareCurrency = (value: unknown, failureMessage: string): unknown =>
  fareRecord(value, failureMessage).currency;

export const estimateView = (body: unknown, failureMessage: string): EstimateView => {
  expect(isRecord(body), failureMessage).toBe(true);
  const record = isRecord(body) ? body : {};
  expect(typeof record.distance_km, failureMessage).toBe('number');
  expect(typeof record.eta_minutes, failureMessage).toBe('number');
  expect(nonEmptyString(record.id), failureMessage).toBe(true);
  expect(nonEmptyString(record.created_at), failureMessage).toBe(true);
  expect(nonEmptyString(record.expires_at), failureMessage).toBe(true);
  const createdAt = Date.parse(typeof record.created_at === 'string' ? record.created_at : '');
  const expiresAt = Date.parse(typeof record.expires_at === 'string' ? record.expires_at : '');
  expect(Number.isNaN(createdAt), failureMessage).toBe(false);
  expect(Number.isNaN(expiresAt), failureMessage).toBe(false);

  return {
    id: typeof record.id === 'string' ? record.id : '',
    distanceKm: typeof record.distance_km === 'number' ? record.distance_km : 0,
    etaMinutes: typeof record.eta_minutes === 'number' ? record.eta_minutes : 0,
    fareAmount: fareAmount(record, failureMessage),
    currency: fareCurrency(record, failureMessage),
    createdAt,
    expiresAt,
  };
};

export const freshBodaEstimate = async (controllers: Controllers, token: string): Promise<EstimateView> => {
  const result = await controllers.estimates.create({
    auth: { token },
    body: { pickup: acacia, dropoff: ntinda, service_type: 'boda' },
  });
  expect(result.status, result.failureMessage).toBe(201);
  return estimateView(result.body, result.failureMessage);
};

const fareRecord = (value: unknown, failureMessage: string): Record<string, unknown> => {
  expect(isRecord(value), failureMessage).toBe(true);
  const record = isRecord(value) ? value : {};
  if (isRecord(record.fare)) {
    return record.fare;
  }
  return record;
};

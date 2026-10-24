import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';

import type { ApiResult } from '../../src/client/api-client';
import type { Controllers } from '../../src/controllers';
import { isRecord } from '../../src/helpers/guards';
import { assertErrorBody, errorCode, recordId } from '../support/common';
import { freshBodaEstimate } from './estimate';

export const expectTripError = (result: ApiResult, status: number, code: string): void => {
  expect(result.status, result.failureMessage).toBe(status);
  assertErrorBody(result.body, result.failureMessage);
  expect(errorCode(result.body), result.failureMessage).toBe(code);
};

export const tripRecord = (body: unknown, failureMessage: string): Record<string, unknown> => {
  expect(isRecord(body), failureMessage).toBe(true);
  return isRecord(body) ? body : {};
};

export const assignedDriver = (trip: Record<string, unknown>, failureMessage: string): Record<string, unknown> => {
  expect(isRecord(trip.driver), failureMessage).toBe(true);
  return isRecord(trip.driver) ? trip.driver : {};
};

export const storedRating = (body: unknown, failureMessage: string): Record<string, unknown> => {
  const rating = tripRecord(body, failureMessage).rating;
  expect(isRecord(rating), failureMessage).toBe(true);
  return isRecord(rating) ? rating : {};
};

const driverActions = ['accept', 'arrive', 'start', 'complete'] as const;
export type DriverAction = (typeof driverActions)[number];

export const advance = async (
  controllers: Controllers,
  tripId: string,
  driverToken: string,
  through: DriverAction,
): Promise<void> => {
  const auth = { token: driverToken };
  const calls = [
    () => controllers.driver.accept(tripId, auth),
    () => controllers.driver.arrive(tripId, auth),
    () => controllers.driver.start(tripId, auth),
    () => controllers.driver.complete(tripId, auth),
  ];
  const last = driverActions.indexOf(through);
  for (const call of calls.slice(0, last + 1)) {
    const result = await call();
    expect(result.status, result.failureMessage).toBe(200);
  }
};

export const bookCash = async (controllers: Controllers, token: string): Promise<ApiResult> => {
  const estimate = await freshBodaEstimate(controllers, token);
  const result = await controllers.trips.create({
    auth: { token },
    idempotencyKey: randomUUID(),
    body: { estimate_id: estimate.id, payment_method: 'cash' },
  });
  expect(result.status, result.failureMessage).toBe(201);
  return result;
};

export const requestedTripId = async (controllers: Controllers, token: string): Promise<string> => {
  const created = await bookCash(controllers, token);
  return recordId(created.body, created.failureMessage);
};

export const expectStatus = async (
  controllers: Controllers,
  token: string,
  tripId: string,
  status: string,
): Promise<void> => {
  const current = await controllers.trips.get(tripId, { token });
  expect(current.status, current.failureMessage).toBe(200);
  expect(tripRecord(current.body, current.failureMessage).status, current.failureMessage).toBe(status);
};

import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';

import type { ApiResult } from '../../src/client/api-client';
import type { Controllers } from '../../src/controllers';
import type { AuthOverride } from '../../src/controllers/auth';
import { isRecord } from '../../src/helpers/guards';
import type { FareEstimateRequest, PaymentMethod, RatingRequest, ServiceType } from '../../src/types/api';
import { acacia, ntinda } from '../../data/places';
import { assertErrorBody, dataList, errorCode, recordId } from '../../support/common';
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

export const fiveMinutesMs = 5 * 60 * 1000;

export const expiryToleranceMs = 5_000;

export const expiryBufferMs = 15_000;

export const sarahAuth = (token: string): AuthOverride => ({ token });

export const quote = (service: ServiceType, promoCode?: string): FareEstimateRequest => ({
  pickup: acacia,
  dropoff: ntinda,
  service_type: service,
  ...(promoCode === undefined ? {} : { promo_code: promoCode }),
});

export const dropoff = (body: unknown, failureMessage: string): Record<string, unknown> => {
  expect(isRecord(body), failureMessage).toBe(true);
  const record = isRecord(body) ? body : {};
  expect(isRecord(record.dropoff), failureMessage).toBe(true);
  return isRecord(record.dropoff) ? record.dropoff : {};
};

export const expectEstimateError = expectTripError;

export interface Booking {
  readonly estimateId: string;
  readonly paymentMethod: PaymentMethod;
  readonly scheduledFor?: string;
  readonly idempotencyKey?: string;
  readonly auth?: AuthOverride;
}

export const book = (
  controllers: Controllers,
  token: string,
  booking: Booking,
): Promise<ApiResult> => controllers.trips.create({
  auth: booking.auth ?? { token },
  idempotencyKey: booking.idempotencyKey ?? randomUUID(),
  body: {
    estimate_id: booking.estimateId,
    payment_method: booking.paymentMethod,
    ...(booking.scheduledFor === undefined ? {} : { scheduled_for: booking.scheduledFor }),
  },
});

export const plus0300 = (instant: Date): string => {
  const shifted = new Date(instant.getTime() + 3 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, -1)}+03:00`;
};

export const listTotal = async (controllers: Controllers, token: string): Promise<number> => {
  const listed = await controllers.trips.list({ auth: { token } });
  expect(listed.status, listed.failureMessage).toBe(200);
  expect(isRecord(listed.body), listed.failureMessage).toBe(true);
  const body = isRecord(listed.body) ? listed.body : {};
  expect(typeof body.total, listed.failureMessage).toBe('number');
  return typeof body.total === 'number' ? body.total : 0;
};

export const statusOrder = ['requested', 'accepted', 'arrived', 'in_progress', 'completed'] as const;

export const statusNames = (history: unknown, failureMessage: string): readonly string[] => {
  expect(Array.isArray(history), failureMessage).toBe(true);
  const rows = Array.isArray(history) ? history : [];
  return rows.map((row) => {
    expect(isRecord(row), failureMessage).toBe(true);
    const record = isRecord(row) ? row : {};
    expect(typeof record.status, failureMessage).toBe('string');
    return typeof record.status === 'string' ? record.status : '';
  });
};

export interface TripPage {
  readonly page: unknown;
  readonly pageSize: unknown;
  readonly total: number;
  readonly rows: readonly Record<string, unknown>[];
}

export const tripPage = (body: unknown, failureMessage: string): TripPage => {
  expect(isRecord(body), failureMessage).toBe(true);
  const record = isRecord(body) ? body : {};
  expect(typeof record.total, failureMessage).toBe('number');
  return {
    page: record.page,
    pageSize: record.page_size,
    total: typeof record.total === 'number' ? record.total : 0,
    rows: dataList(body, failureMessage),
  };
};

export const listedIds = (body: unknown, failureMessage: string): readonly unknown[] =>
  dataList(body, failureMessage).map((row) => row.id);

export const completedTripId = async (
  controllers: Controllers,
  riderToken: string,
  driverToken: string,
): Promise<string> => {
  const created = await bookCash(controllers, riderToken);
  const tripId = recordId(created.body, created.failureMessage);
  await advance(controllers, tripId, driverToken, 'complete');
  return tripId;
};

export const rate = (
  controllers: Controllers,
  tripId: string,
  token: string,
  body: RatingRequest | { readonly comment?: string },
): Promise<ApiResult> => controllers.trips.rate(tripId, { auth: { token }, body });

export interface FundedTrip {
  readonly tripId: string;
  readonly fare: number;
}

export const walletTrip = async (
  controllers: Controllers,
  token: string,
  openingBalance: number,
): Promise<FundedTrip> => {
  const estimate = await freshBodaEstimate(controllers, token);
  expect(estimate.fareAmount, 'estimate fare must fit the rider wallet').toBeLessThanOrEqual(openingBalance);
  const booked = await controllers.trips.create({
    auth: { token },
    idempotencyKey: randomUUID(),
    body: { estimate_id: estimate.id, payment_method: 'wallet' },
  });
  expect(booked.status, booked.failureMessage).toBe(201);
  return { tripId: recordId(booked.body, booked.failureMessage), fare: estimate.fareAmount };
};

export const cancel = (
  controllers: Controllers,
  tripId: string,
  token: string,
  body: { readonly reason?: string } = {},
): Promise<ApiResult> => controllers.trips.cancel(tripId, { auth: { token }, body });

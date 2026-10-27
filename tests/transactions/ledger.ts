import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';

import type { Controllers } from '../../src/controllers';
import { isRecord } from '../../src/helpers/guards';
import { acacia, ntinda } from '../../data/places';
import { dataList, recordId } from '../../support/common';
import { fareAmount } from '../trips/estimate';

export interface LedgerView {
  readonly openingBalance: number;
  readonly balance: number;
  readonly rows: readonly Record<string, unknown>[];
  readonly signedSum: number;
}

export const ledgerView = (body: unknown, failureMessage: string): LedgerView => {
  expect(isRecord(body), failureMessage).toBe(true);
  const record = isRecord(body) ? body : {};
  expect(typeof record.opening_balance, failureMessage).toBe('number');
  expect(typeof record.balance, failureMessage).toBe('number');
  const rows = dataList(body, failureMessage);
  const signedSum = rows.reduce((sum, row) => {
    expect(typeof row.amount, failureMessage).toBe('number');
    return sum + (typeof row.amount === 'number' ? row.amount : 0);
  }, 0);

  return {
    openingBalance: typeof record.opening_balance === 'number' ? record.opening_balance : 0,
    balance: typeof record.balance === 'number' ? record.balance : 0,
    rows,
    signedSum,
  };
};

export interface CompletedWalletTrip {
  readonly tripId: string;
  readonly fare: number;
}

export const completedWalletTrip = async (
  controllers: Controllers,
  sarahToken: string,
  josephToken: string,
): Promise<CompletedWalletTrip> => {
  const estimate = await controllers.estimates.create({
    auth: { token: sarahToken },
    body: { pickup: acacia, dropoff: ntinda, service_type: 'boda' },
  });
  expect(estimate.status, estimate.failureMessage).toBe(201);
  const fare = fareAmount(estimate.body, estimate.failureMessage);
  expect(fare, estimate.failureMessage).toBeGreaterThan(0);

  const booked = await controllers.trips.create({
    auth: { token: sarahToken },
    idempotencyKey: randomUUID(),
    body: { estimate_id: recordId(estimate.body, estimate.failureMessage), payment_method: 'wallet' },
  });
  expect(booked.status, booked.failureMessage).toBe(201);
  const tripId = recordId(booked.body, booked.failureMessage);
  const driver = { token: josephToken };

  const accepted = await controllers.driver.accept(tripId, driver);
  expect(accepted.status, accepted.failureMessage).toBe(200);
  const arrived = await controllers.driver.arrive(tripId, driver);
  expect(arrived.status, arrived.failureMessage).toBe(200);
  const started = await controllers.driver.start(tripId, driver);
  expect(started.status, started.failureMessage).toBe(200);
  const completed = await controllers.driver.complete(tripId, driver);
  expect(completed.status, completed.failureMessage).toBe(200);

  return { tripId, fare };
};

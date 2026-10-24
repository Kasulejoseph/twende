import { randomUUID } from 'node:crypto';

import type { Controllers } from '../../src/controllers';
import { isRecord } from '../../src/helpers/guards';
import { assertErrorBody, balanceOf, dataList, errorBody, recordId, sarahWallet } from '../support/common';
import { expect, lane, resetTest, test } from '../support/fixtures';
import { freshBodaEstimate } from './estimate';
import { expectStatus, expectTripError, requestedTripId, tripRecord } from './trip';

resetTest('TC-CMP-01 completing a cash trip does not change the rider\'s wallet or add a trip charge', {
  tag: [lane.stateful, lane.smoke, lane.billing, lane.trips, lane.driver, lane.complete],
}, async ({ actors, controllers }) => {
  const rider = actors.sarah.token;
  const driver = { token: actors.joseph.token };
  const tripId = await requestedTripId(controllers, rider);
  // The driver accepts, arrives, and starts a cash trip.
  await reachInProgress(controllers, tripId, driver.token);
  const before = await balanceOf(controllers, rider);

  const result = await controllers.driver.complete(tripId, driver);
  expect(result.status, result.failureMessage).toBe(200);
  expect(tripRecord(result.body, result.failureMessage).status, result.failureMessage).toBe('completed');
  expect(await balanceOf(controllers, rider), result.failureMessage).toBe(before);
  expect(await tripCharges(controllers, rider, tripId), result.failureMessage).toEqual([]);
});

resetTest('TC-CMP-02 completing a wallet trip charges the fare once and the ledger matches the balance', {
  tag: [lane.stateful, lane.billing, lane.trips, lane.driver, lane.complete],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const driver = { token: actors.joseph.token };
  const funded = await walletTrip(controllers, sarah.token, sarah.openingBalance);
  // The driver accepts, arrives, and starts.
  await reachInProgress(controllers, funded.tripId, driver.token);
  const before = await balanceOf(controllers, sarah.token);

  const result = await controllers.driver.complete(funded.tripId, driver);
  expect(result.status, result.failureMessage).toBe(200);
  expect(tripRecord(result.body, result.failureMessage).status, result.failureMessage).toBe('completed');
  expect(await balanceOf(controllers, sarah.token), result.failureMessage).toBe(before - funded.fare);

  const ledger = await controllers.wallet.transactions({ token: sarah.token });
  expect(ledger.status, ledger.failureMessage).toBe(200);
  expectLedgerIdentity(ledger.body, ledger.failureMessage);
  const charges = dataList(ledger.body, ledger.failureMessage).filter((row) =>
    row.type === 'trip_charge' && row.reference === funded.tripId);
  expect(charges, ledger.failureMessage).toHaveLength(1);
  expect(charges[0]?.amount, ledger.failureMessage).toBe(-funded.fare);
});

resetTest('TC-CMP-03 a driver who is not assigned cannot complete the trip, and the rider\'s balance stays unchanged', {
  tag: [lane.stateful, lane.negative, lane.security, lane.trips, lane.driver, lane.complete],
}, async ({ actors, controllers }) => {
  const rider = actors.sarah.token;
  const tripId = await requestedTripId(controllers, rider);
  // The assigned driver gets the trip to in progress. Another driver tries to complete it.
  await reachInProgress(controllers, tripId, actors.joseph.token);
  const before = await balanceOf(controllers, rider);

  const result = await controllers.driver.complete(tripId, { token: actors.grace.token });
  expectTripError(result, 403, 'NOT_ASSIGNED_DRIVER');
  expect(await balanceOf(controllers, rider), result.failureMessage).toBe(before);
});

resetTest('TC-CMP-04 the assigned driver cannot complete a trip that is not in progress, and no trip charge is added', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.driver, lane.complete],
}, async ({ actors, controllers }) => {
  const rider = actors.sarah.token;
  const driver = { token: actors.joseph.token };
  const tripId = await requestedTripId(controllers, rider);

  await test.step('accepted', async () => {
    const accepted = await controllers.driver.accept(tripId, driver);
    expect(accepted.status, accepted.failureMessage).toBe(200);
    const result = await controllers.driver.complete(tripId, driver);
    expectTripError(result, 409, 'INVALID_TRANSITION');
    await expectStatus(controllers, rider, tripId, 'accepted');
    expect(await tripCharges(controllers, rider, tripId), result.failureMessage).toEqual([]);
  });

  await test.step('arrived', async () => {
    const arrived = await controllers.driver.arrive(tripId, driver);
    expect(arrived.status, arrived.failureMessage).toBe(200);
    const result = await controllers.driver.complete(tripId, driver);
    expectTripError(result, 409, 'INVALID_TRANSITION');
    await expectStatus(controllers, rider, tripId, 'arrived');
    expect(await tripCharges(controllers, rider, tripId), result.failureMessage).toEqual([]);
  });

  await test.step('requested', async () => {
    // Cancel the active trip so the driver is free, then try a new request.
    const cancelled = await controllers.trips.cancel(tripId, { auth: { token: rider }, body: {} });
    expect(cancelled.status, cancelled.failureMessage).toBe(200);
    const requestedId = await requestedTripId(controllers, rider);
    const result = await controllers.driver.complete(requestedId, driver);
    expectTripError(result, 403, 'NOT_ASSIGNED_DRIVER');
    const error = errorBody(result.body, result.failureMessage);
    expect(error.message, result.failureMessage).toMatch(/You are not the driver on this trip/i);
    await expectStatus(controllers, rider, requestedId, 'requested');
    expect(await tripCharges(controllers, rider, requestedId), result.failureMessage).toEqual([]);
  });
});

resetTest('TC-CMP-05 completing a wallet trip a second time does not charge the rider again', {
  tag: [lane.stateful, lane.negative, lane.billing, lane.trips, lane.driver, lane.complete],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const driver = { token: actors.joseph.token };
  const funded = await walletTrip(controllers, sarah.token, sarah.openingBalance);
  // The driver completes the trip once.
  await reachInProgress(controllers, funded.tripId, driver.token);
  const first = await controllers.driver.complete(funded.tripId, driver);
  expect(first.status, first.failureMessage).toBe(200);
  const afterFirst = await balanceOf(controllers, sarah.token);

  const second = await controllers.driver.complete(funded.tripId, driver);
  expectTripError(second, 409, 'INVALID_TRANSITION');
  expect(await balanceOf(controllers, sarah.token), second.failureMessage).toBe(afterFirst);
  expect(await tripCharges(controllers, sarah.token, funded.tripId), second.failureMessage).toHaveLength(1);
});

test('TC-CMP-06 completing an unknown trip returns not found, and an invalid key is rejected', {
  tag: [lane.stateless, lane.negative, lane.security, lane.trips, lane.driver, lane.complete],
}, async ({ actors, controllers }) => {
  await test.step('unknown id', async () => {
    const result = await controllers.driver.complete('trp_DOESNOTEXIST', { token: actors.joseph.token });
    expectTripError(result, 404, 'TRIP_NOT_FOUND');
  });

  await test.step('invalid key', async () => {
    const result = await controllers.driver.complete('trp_DOESNOTEXIST', {
      token: actors.joseph.token,
      candidateKey: 'invalid',
    });
    expect(result.status, result.failureMessage).toBe(401);
    assertErrorBody(result.body, result.failureMessage);
  });
});

const reachInProgress = async (controllers: Controllers, tripId: string, driverToken: string): Promise<void> => {
  const driver = { token: driverToken };
  const accepted = await controllers.driver.accept(tripId, driver);
  expect(accepted.status, accepted.failureMessage).toBe(200);
  const arrived = await controllers.driver.arrive(tripId, driver);
  expect(arrived.status, arrived.failureMessage).toBe(200);
  const started = await controllers.driver.start(tripId, driver);
  expect(started.status, started.failureMessage).toBe(200);
};

interface FundedTrip {
  readonly tripId: string;
  readonly fare: number;
}

const walletTrip = async (
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

const tripCharges = async (
  controllers: Controllers,
  token: string,
  tripId: string,
): Promise<readonly Record<string, unknown>[]> => {
  const ledger = await controllers.wallet.transactions({ token });
  expect(ledger.status, ledger.failureMessage).toBe(200);
  return dataList(ledger.body, ledger.failureMessage).filter((row) =>
    row.type === 'trip_charge' && row.reference === tripId);
};

const expectLedgerIdentity = (body: unknown, failureMessage: string): void => {
  expect(isRecord(body), failureMessage).toBe(true);
  const record = isRecord(body) ? body : {};
  expect(typeof record.opening_balance, failureMessage).toBe('number');
  expect(typeof record.balance, failureMessage).toBe('number');
  const signedSum = dataList(body, failureMessage).reduce((sum, row) => {
    expect(typeof row.amount, failureMessage).toBe('number');
    return sum + (typeof row.amount === 'number' ? row.amount : 0);
  }, 0);
  const opening = typeof record.opening_balance === 'number' ? record.opening_balance : 0;
  const balance = typeof record.balance === 'number' ? record.balance : 0;
  expect(opening + signedSum, failureMessage).toBe(balance);
};

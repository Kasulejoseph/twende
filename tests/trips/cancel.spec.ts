import { randomUUID } from 'node:crypto';

import type { ApiResult } from '../../src/client/api-client';
import type { Controllers } from '../../src/controllers';
import { assertErrorBody, balanceOf, dataList, recordId, sarahWallet } from '../support/common';
import { expect, lane, resetTest, test } from '../support/fixtures';
import { freshBodaEstimate } from './estimate';
import { bookCash, expectTripError, tripRecord } from './trip';

const driverActions = ['accept', 'arrive', 'start', 'complete'] as const;
type DriverAction = (typeof driverActions)[number];

const reasonTooLong = 'a'.repeat(201);

test('TC-CAN-01 cancel a requested trip with a reason', {
  tag: [lane.stateful, lane.smoke, lane.trips, lane.rider, lane.cancel],
}, async ({ actors, controllers }) => {
  // Book a requested cash trip, then cancel it.
  const tripId = await cashTripId(controllers, actors.sarah.token);
  const result = await cancel(controllers, tripId, actors.sarah.token, { reason: 'Changed plans' });
  expect(result.status, result.failureMessage).toBe(200);
  const trip = tripRecord(result.body, result.failureMessage);
  expect(trip.status, result.failureMessage).toBe('cancelled');
  expect(trip.cancel_reason, result.failureMessage).toBe('Changed plans');
  expect(trip.status_history, result.failureMessage).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: 'cancelled' }),
  ]));
});

resetTest('TC-CAN-02 cancel an accepted or arrived trip without a reason', {
  tag: [lane.stateful, lane.trips, lane.rider, lane.cancel],
}, async ({ actors, controllers }) => {
  const stages: readonly { readonly name: string; readonly through: DriverAction }[] = [
    { name: 'accepted', through: 'accept' },
    { name: 'arrived', through: 'arrive' },
  ];

  for (const stage of stages) {
    await test.step(stage.name, async () => {
      const tripId = await cashTripId(controllers, actors.sarah.token);
      // Joseph moves the trip to this stage. Sarah cancels with an empty body.
      await advance(controllers, tripId, actors.joseph.token, stage.through);
      const result = await cancel(controllers, tripId, actors.sarah.token);
      expect(result.status, result.failureMessage).toBe(200);
      expect(tripRecord(result.body, result.failureMessage).status, result.failureMessage).toBe('cancelled');
    });
  }
});

resetTest('TC-CAN-03 cannot cancel a trip in progress', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.rider, lane.cancel],
}, async ({ actors, controllers }) => {
  const tripId = await cashTripId(controllers, actors.sarah.token);
  // Joseph accepts, arrives, and starts.
  await advance(controllers, tripId, actors.joseph.token, 'start');

  const result = await cancel(controllers, tripId, actors.sarah.token);
  expectTripError(result, 409, 'TRIP_IN_PROGRESS');

  const current = await controllers.trips.get(tripId, { token: actors.sarah.token });
  expect(current.status, current.failureMessage).toBe(200);
  expect(tripRecord(current.body, current.failureMessage).status, current.failureMessage).toBe('in_progress');
});

test('TC-CAN-04 cannot cancel a trip twice', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.rider, lane.cancel],
}, async ({ actors, controllers }) => {
  const tripId = await cashTripId(controllers, actors.sarah.token);
  const first = await cancel(controllers, tripId, actors.sarah.token);
  expect(first.status, first.failureMessage).toBe(200);

  const second = await cancel(controllers, tripId, actors.sarah.token);
  expectTripError(second, 409, 'ALREADY_CANCELLED');
});

resetTest.fixme('TC-CAN-05 cannot cancel a completed trip', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.rider, lane.cancel, lane.bug],
}, async ({ actors, controllers }) => {
  const tripId = await cashTripId(controllers, actors.sarah.token);
  // Joseph accepts, arrives, starts, and completes.
  await advance(controllers, tripId, actors.joseph.token, 'complete');

  const result = await cancel(controllers, tripId, actors.sarah.token);
  expectTripError(result, 409, 'TRIP_COMPLETED');
});

test('TC-CAN-06 unknown id or invalid key', {
  tag: [lane.stateless, lane.negative, lane.security, lane.trips, lane.rider, lane.cancel],
}, async ({ actors, controllers }) => {
  await test.step('unknown id', async () => {
    const result = await cancel(controllers, 'trp_DOESNOTEXIST', actors.sarah.token);
    expectTripError(result, 404, 'TRIP_NOT_FOUND');
  });

  await test.step('invalid key', async () => {
    const result = await controllers.trips.cancel('trp_DOESNOTEXIST', {
      auth: { token: actors.sarah.token, candidateKey: 'invalid' },
      body: {},
    });
    expect(result.status, result.failureMessage).toBe(401);
    assertErrorBody(result.body, result.failureMessage);
  });
});

resetTest('TC-CAN-07 cancelled wallet trip is not charged', {
  tag: [lane.stateful, lane.billing, lane.wallet, lane.rider, lane.cancel],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const estimate = await freshBodaEstimate(controllers, sarah.token);
  expect(estimate.fareAmount, 'estimate fare must fit Sarah\'s wallet').toBeLessThanOrEqual(sarah.openingBalance);

  // Book on the wallet, then cancel before a driver accepts.
  const booked = await controllers.trips.create({
    auth: { token: sarah.token },
    idempotencyKey: randomUUID(),
    body: { estimate_id: estimate.id, payment_method: 'wallet' },
  });
  expect(booked.status, booked.failureMessage).toBe(201);
  const tripId = recordId(booked.body, booked.failureMessage);
  const result = await cancel(controllers, tripId, sarah.token);
  expect(result.status, result.failureMessage).toBe(200);
  expect(tripRecord(result.body, result.failureMessage).status, result.failureMessage).toBe('cancelled');

  const balance = await balanceOf(controllers, sarah.token);
  expect(balance, result.failureMessage).toBe(sarah.openingBalance);

  const ledger = await controllers.wallet.transactions({ token: sarah.token });
  expect(ledger.status, ledger.failureMessage).toBe(200);
  const charges = dataList(ledger.body, ledger.failureMessage).filter((row) =>
    row.type === 'trip_charge' && row.reference === tripId);
  expect(charges, ledger.failureMessage).toEqual([]);
});

const cashTripId = async (controllers: Controllers, token: string): Promise<string> => {
  const created = await bookCash(controllers, token);
  return recordId(created.body, created.failureMessage);
};

const cancel = (
  controllers: Controllers,
  tripId: string,
  token: string,
  body: { readonly reason?: string } = {},
): Promise<ApiResult> => controllers.trips.cancel(tripId, { auth: { token }, body });

const advance = async (
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

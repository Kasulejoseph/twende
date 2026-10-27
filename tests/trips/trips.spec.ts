import { randomUUID } from 'node:crypto';

import type { AuthOverride } from '../../src/controllers/auth';
import { scheduleBoundaryCases, scheduledTripLeadMinutes } from '../../data/schedules';
import { assertErrorBody, balanceOf, recordId, sarahWallet } from '../../support/common';
import { expect, lane, resetTest, test } from '../../support/fixtures';
import { fareAmount, fareCurrency, freshBodaEstimate } from './estimate';
import { book, expiryBufferMs, expectTripError, listTotal, plus0300, tripRecord } from './trip';

test('TC-TRP-01 a rider books an immediate cash boda and the trip is requested with no driver', {
  tag: [lane.stateful, lane.smoke, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  // Quote Acacia to Ntinda, then book it for cash.
  const estimate = await freshBodaEstimate(controllers, actors.sarah.token);
  const result = await book(controllers, actors.sarah.token, {
    estimateId: estimate.id,
    paymentMethod: 'cash',
  });
  expect(result.status, result.failureMessage).toBe(201);

  const trip = tripRecord(result.body, result.failureMessage);
  expect(trip.status, result.failureMessage).toBe('requested');
  expect(trip.payment_method, result.failureMessage).toBe('cash');
  expect(trip.driver, result.failureMessage).toBeNull();
  expect(fareAmount(trip.fare, result.failureMessage), result.failureMessage).toBe(estimate.fareAmount);
  expect(fareCurrency(trip.fare, result.failureMessage), result.failureMessage).toBe(estimate.currency);
  expect(trip.status_history, result.failureMessage).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: 'requested' }),
  ]));
});

resetTest('TC-TRP-02 a rider books a wallet trip they can afford and the wallet is not charged yet', {
  tag: [lane.stateful, lane.billing, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const estimate = await freshBodaEstimate(controllers, sarah.token);
  expect(estimate.fareAmount, 'estimate fare must fit Sarah\'s wallet').toBeLessThanOrEqual(sarah.openingBalance);

  // Book the quote on the wallet. The wallet is charged on completion.
  const result = await book(controllers, sarah.token, {
    estimateId: estimate.id,
    paymentMethod: 'wallet',
  });
  expect(result.status, result.failureMessage).toBe(201);
  expect(tripRecord(result.body, result.failureMessage).payment_method, result.failureMessage).toBe('wallet');

  const balance = await balanceOf(controllers, sarah.token);
  expect(balance, result.failureMessage).toBe(sarah.openingBalance);
});

test.fixme('TC-TRP-03 a scheduled departure sent with a local offset is stored as that same UTC instant', {
  tag: [lane.stateful, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  const estimate = await freshBodaEstimate(controllers, actors.sarah.token);
  // Book two hours ahead and send that instant as +03:00.
  const departure = new Date(Date.now() + scheduledTripLeadMinutes * 60 * 1000);
  const result = await book(controllers, actors.sarah.token, {
    estimateId: estimate.id,
    paymentMethod: 'cash',
    scheduledFor: plus0300(departure),
  });
  expect(result.status, result.failureMessage).toBe(201);

  const trip = tripRecord(result.body, result.failureMessage);
  expect(trip.status, result.failureMessage).toBe('requested');
  expect(typeof trip.scheduled_for === 'string' && /(?:Z|\+00:00)$/.test(trip.scheduled_for), result.failureMessage).toBe(true);
  expect(Date.parse(typeof trip.scheduled_for === 'string' ? trip.scheduled_for : ''), result.failureMessage).toBe(departure.getTime());
});

test('TC-TRP-04 a departure inside the allowed schedule window is accepted, and times outside that window are rejected', {
  tag: [lane.stateful, lane.negative, lane.boundary, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  for (const row of scheduleBoundaryCases) {
    await test.step(row.id, async () => {
      const estimate = await freshBodaEstimate(controllers, actors.sarah.token);
      // The 30-minute edge is measured when the request arrives.
      const arrivalPadMs = row.offsetMinutes === 30 ? 15_000 : 0;
      const result = await book(controllers, actors.sarah.token, {
        estimateId: estimate.id,
        paymentMethod: 'cash',
        scheduledFor: new Date(Date.now() + row.offsetMinutes * 60 * 1000 + arrivalPadMs).toISOString(),
      });
      if (row.valid) {
        expect(result.status, result.failureMessage).toBe(201);
        return;
      }
      expectTripError(result, 422, 'INVALID_SCHEDULE');
    });
  }
});

resetTest('TC-TRP-05 a rider cannot book a wallet trip that costs more than their balance', {
  tag: [lane.stateful, lane.negative, lane.billing],
}, async ({ actors, controllers }) => {
  const brian = actors.brian;
  expect(brian.openingBalance, 'Brian opening balance').toBe(3_000);
  const estimate = await freshBodaEstimate(controllers, brian.token);
  expect(estimate.fareAmount, 'estimate fare must exceed Brian\'s wallet').toBeGreaterThan(3_000);
  const before = await listTotal(controllers, brian.token);

  // Brian tries to book a fare his wallet cannot cover.
  const result = await book(controllers, brian.token, {
    estimateId: estimate.id,
    paymentMethod: 'wallet',
  });
  expectTripError(result, 402, 'INSUFFICIENT_BALANCE');
  expect(await listTotal(controllers, brian.token), result.failureMessage).toBe(before);

  const balance = await balanceOf(controllers, brian.token);
  expect(balance, result.failureMessage).toBe(brian.openingBalance);
});

test('TC-TRP-06 booking an estimate id that was never issued is rejected', {
  tag: [lane.stateless, lane.negative, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  // Book an estimate id that was never issued.
  const result = await book(controllers, actors.sarah.token, {
    estimateId: 'est_DOESNOTEXIST',
    paymentMethod: 'cash',
  });
  expectTripError(result, 404, 'ESTIMATE_NOT_FOUND');
});

test('TC-TRP-07 booking the same estimate again with a new key is rejected', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  const before = await listTotal(controllers, actors.sarah.token);
  const estimate = await freshBodaEstimate(controllers, actors.sarah.token);
  const created = await book(controllers, actors.sarah.token, {
    estimateId: estimate.id,
    paymentMethod: 'cash',
  });
  expect(created.status, created.failureMessage).toBe(201);

  // Same quote again, with a new idempotency key.
  const reused = await book(controllers, actors.sarah.token, {
    estimateId: estimate.id,
    paymentMethod: 'cash',
  });
  expectTripError(reused, 409, 'ESTIMATE_ALREADY_USED');
  expect(await listTotal(controllers, actors.sarah.token), reused.failureMessage).toBe(before + 1);
});

test('TC-TRP-08 replaying a booking with the same key and body returns the original trip', {
  tag: [lane.stateful, lane.idempotency, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  const before = await listTotal(controllers, actors.sarah.token);
  const estimate = await freshBodaEstimate(controllers, actors.sarah.token);
  const idempotencyKey = randomUUID();
  const booking = {
    estimateId: estimate.id,
    paymentMethod: 'cash' as const,
    idempotencyKey,
  };
  const created = await book(controllers, actors.sarah.token, booking);
  expect(created.status, created.failureMessage).toBe(201);
  const tripId = recordId(created.body, created.failureMessage);

  // Replay the same key and the same body.
  const replay = await book(controllers, actors.sarah.token, booking);
  expect(replay.status, replay.failureMessage).toBe(200);
  expect(recordId(replay.body, replay.failureMessage), replay.failureMessage).toBe(tripId);
  expect(await listTotal(controllers, actors.sarah.token), replay.failureMessage).toBe(before + 1);
});

test('TC-TRP-09 reusing a booking key with a different estimate does not create a second trip', {
  tag: [lane.stateful, lane.idempotency, lane.negative, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  const before = await listTotal(controllers, actors.sarah.token);
  const firstEstimate = await freshBodaEstimate(controllers, actors.sarah.token);
  const secondEstimate = await freshBodaEstimate(controllers, actors.sarah.token);
  const idempotencyKey = randomUUID();
  const created = await book(controllers, actors.sarah.token, {
    estimateId: firstEstimate.id,
    paymentMethod: 'cash',
    idempotencyKey,
  });
  expect(created.status, created.failureMessage).toBe(201);
  const tripId = recordId(created.body, created.failureMessage);

  // Same key, but a second unused quote.
  const reused = await book(controllers, actors.sarah.token, {
    estimateId: secondEstimate.id,
    paymentMethod: 'cash',
    idempotencyKey,
  });
  if (reused.status === 200) {
    expect(recordId(reused.body, reused.failureMessage), reused.failureMessage).toBe(tripId);
  } else {
    expectTripError(reused, 422, 'IDEMPOTENCY_KEY_REUSED');
  }
  expect(await listTotal(controllers, actors.sarah.token), reused.failureMessage).toBe(before + 1);
});

test.skip('TC-TRP-10 booking an estimate after it has expired is rejected', {
  tag: [lane.slow, lane.negative, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  const estimate = await freshBodaEstimate(controllers, actors.sarah.token);
  // Quotes last 5 minutes. Book once this one has expired.
  const waitMs = estimate.expiresAt - Date.now() + expiryBufferMs;
  await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 0)));

  const result = await book(controllers, actors.sarah.token, {
    estimateId: estimate.id,
    paymentMethod: 'cash',
  });
  expectTripError(result, 410, 'ESTIMATE_EXPIRED');
});

test('TC-TRP-11 a booking with an invalid candidate key or no bearer token is rejected', {
  tag: [lane.stateless, lane.negative, lane.security],
}, async ({ actors, controllers }) => {
  const rows: readonly { readonly name: string; readonly auth: AuthOverride }[] = [
    { name: 'invalid key', auth: { token: actors.sarah.token, candidateKey: 'invalid' } },
    { name: 'missing bearer', auth: { sendAuthorization: false } },
  ];

  for (const row of rows) {
    await test.step(row.name, async () => {
      // Fresh quote, then book it without valid auth.
      const estimate = await freshBodaEstimate(controllers, actors.sarah.token);
      const result = await book(controllers, actors.sarah.token, {
        estimateId: estimate.id,
        paymentMethod: 'cash',
        auth: row.auth,
      });
      expect(result.status, result.failureMessage).toBe(401);
      assertErrorBody(result.body, result.failureMessage);
    });
  }
});

test('TC-TRP-12 a booking with payment method card is rejected', {
  tag: [lane.stateless, lane.negative, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  const estimate = await freshBodaEstimate(controllers, actors.sarah.token);
  // payment_method card is outside cash and wallet.
  const result = await controllers.trips.create({
    auth: { token: actors.sarah.token },
    idempotencyKey: randomUUID(),
    rawBody: JSON.stringify({ estimate_id: estimate.id, payment_method: 'card' }),
  });
  expectTripError(result, 422, 'VALIDATION_ERROR');
});

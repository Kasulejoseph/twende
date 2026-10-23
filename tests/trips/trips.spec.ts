import { randomUUID } from 'node:crypto';

import type { Controllers } from '../../src/controllers';
import type { AuthOverride } from '../../src/controllers/auth';
import type { ApiResult } from '../../src/client/api-client';
import { isRecord } from '../../src/helpers/guards';
import type { PaymentMethod } from '../../src/types/api';
import { scheduleBoundaryCases, scheduledTripLeadMinutes } from '../data/schedules';
import { assertErrorBody, balanceOf, errorCode, nonEmptyString, sarahWallet } from '../support/common';
import { expect, lane, resetTest, test } from '../support/fixtures';
import { fareAmount, fareCurrency, freshBodaEstimate } from './estimate';

const expiryBufferMs = 15_000;

test('TC-TRP-01 book immediate cash trip', {
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

resetTest('TC-TRP-02 book wallet trip when funded', {
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

test.fixme('TC-TRP-03 scheduled trip is returned in UTC', {
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

test('TC-TRP-04 scheduled time boundaries', {
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

resetTest('TC-TRP-05 insufficient wallet balance', {
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

test('TC-TRP-06 unknown estimate', {
  tag: [lane.stateless, lane.negative, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  // Book an estimate id that was never issued.
  const result = await book(controllers, actors.sarah.token, {
    estimateId: 'est_DOESNOTEXIST',
    paymentMethod: 'cash',
  });
  expectTripError(result, 404, 'ESTIMATE_NOT_FOUND');
});

test('TC-TRP-07 reused estimate', {
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

test('TC-TRP-08 idempotency replay returns the first trip', {
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

test('TC-TRP-09 same key with a different estimate', {
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

test.skip('TC-TRP-10 expired estimate', {
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

test('TC-TRP-11 invalid key or missing bearer', {
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

test('TC-TRP-12 invalid payment method', {
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

interface Booking {
  readonly estimateId: string;
  readonly paymentMethod: PaymentMethod;
  readonly scheduledFor?: string;
  readonly idempotencyKey?: string;
  readonly auth?: AuthOverride;
}

const book = (
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

const plus0300 = (instant: Date): string => {
  const shifted = new Date(instant.getTime() + 3 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, -1)}+03:00`;
};

const tripRecord = (body: unknown, failureMessage: string): Record<string, unknown> => {
  expect(isRecord(body), failureMessage).toBe(true);
  return isRecord(body) ? body : {};
};

const recordId = (body: unknown, failureMessage: string): string => {
  const trip = tripRecord(body, failureMessage);
  expect(nonEmptyString(trip.id), failureMessage).toBe(true);
  return typeof trip.id === 'string' ? trip.id : '';
};

const listTotal = async (controllers: Controllers, token: string): Promise<number> => {
  const listed = await controllers.trips.list({ auth: { token } });
  expect(listed.status, listed.failureMessage).toBe(200);
  expect(isRecord(listed.body), listed.failureMessage).toBe(true);
  const body = isRecord(listed.body) ? listed.body : {};
  expect(typeof body.total, listed.failureMessage).toBe('number');
  return typeof body.total === 'number' ? body.total : 0;
};

const expectTripError = (result: ApiResult, status: number, code: string): void => {
  expect(result.status, result.failureMessage).toBe(status);
  assertErrorBody(result.body, result.failureMessage);
  expect(errorCode(result.body), result.failureMessage).toBe(code);
};

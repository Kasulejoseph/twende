import type { ApiResult } from '../../src/client/api-client';
import type { Controllers } from '../../src/controllers';
import { isRecord } from '../../src/helpers/guards';
import type { RatingRequest } from '../../src/types/api';
import { starBoundaryCases } from '../data/ratings';
import { recordId } from '../support/common';
import { expect, lane, resetTest, test } from '../support/fixtures';
import { advance, bookCash, expectTripError, tripRecord } from './trip';

resetTest('TC-RAT-01 rate a completed trip', {
  tag: [lane.stateful, lane.smoke, lane.trips, lane.rider, lane.rating],
}, async ({ actors, controllers }) => {
  // Joseph completes the trip. Sarah rates it.
  const tripId = await completedTripId(controllers, actors.sarah.token, actors.joseph.token);
  const result = await rate(controllers, tripId, actors.sarah.token, {
    stars: 5,
    comment: 'Safe ride',
  });
  expect(result.status, result.failureMessage).toBe(201);
  const saved = tripRecord(result.body, result.failureMessage);
  expect(saved.stars, result.failureMessage).toBe(5);
  expect(saved.comment, result.failureMessage).toBe('Safe ride');

  const current = await controllers.trips.get(tripId, { token: actors.sarah.token });
  expect(current.status, current.failureMessage).toBe(200);
  expect(storedRating(current.body, current.failureMessage).stars, current.failureMessage).toBe(5);
});

resetTest('TC-RAT-02 rate without a comment', {
  tag: [lane.stateful, lane.trips, lane.rider, lane.rating],
}, async ({ actors, controllers }) => {
  const tripId = await completedTripId(controllers, actors.sarah.token, actors.joseph.token);
  const result = await rate(controllers, tripId, actors.sarah.token, { stars: 4 });
  expect(result.status, result.failureMessage).toBe(201);
  const saved = tripRecord(result.body, result.failureMessage);
  expect(saved.stars, result.failureMessage).toBe(4);
  expect(saved.comment ?? null, result.failureMessage).toBeNull();
});

resetTest('TC-RAT-03 missing stars', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.rider, lane.rating],
}, async ({ actors, controllers }) => {
  const tripId = await completedTripId(controllers, actors.sarah.token, actors.joseph.token);
  const bodies: readonly { readonly name: string; readonly body: { readonly comment?: string } }[] = [
    { name: 'comment only', body: { comment: 'ok' } },
    { name: 'empty', body: {} },
  ];

  for (const row of bodies) {
    await test.step(row.name, async () => {
      const result = await rate(controllers, tripId, actors.sarah.token, row.body);
      expectTripError(result, 422, 'VALIDATION_ERROR');
    });
  }

  const current = await controllers.trips.get(tripId, { token: actors.sarah.token });
  expect(current.status, current.failureMessage).toBe(200);
  expect(tripRecord(current.body, current.failureMessage).rating, current.failureMessage).toBeNull();
});

resetTest('TC-RAT-04 star boundaries', {
  tag: [lane.stateful, lane.boundary, lane.negative, lane.trips, lane.rider, lane.rating],
}, async ({ actors, controllers }) => {
  let tripId = '';

  for (const row of starBoundaryCases) {
    await test.step(`stars ${row.stars}`, async () => {
      if (tripId.length === 0) {
        // A failed rating leaves the trip unrated, so the next row can reuse it.
        tripId = await completedTripId(controllers, actors.sarah.token, actors.joseph.token);
      }
      const result = await rate(controllers, tripId, actors.sarah.token, { stars: row.stars });
      if (row.expectedStatus === 422) {
        expectTripError(result, 422, 'VALIDATION_ERROR');
        return;
      }
      expect(result.status, result.failureMessage).toBe(201);
      expect(tripRecord(result.body, result.failureMessage).stars, result.failureMessage).toBe(row.stars);
      tripId = '';
    });
  }
});

resetTest('TC-RAT-05 second rating is rejected', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.rider, lane.rating],
}, async ({ actors, controllers }) => {
  const tripId = await completedTripId(controllers, actors.sarah.token, actors.joseph.token);
  const first = await rate(controllers, tripId, actors.sarah.token, { stars: 3 });
  expect(first.status, first.failureMessage).toBe(201);

  const second = await rate(controllers, tripId, actors.sarah.token, { stars: 1 });
  expectTripError(second, 409, 'ALREADY_RATED');

  const current = await controllers.trips.get(tripId, { token: actors.sarah.token });
  expect(current.status, current.failureMessage).toBe(200);
  expect(storedRating(current.body, current.failureMessage).stars, current.failureMessage).toBe(3);
});

resetTest.fixme('TC-RAT-06 cannot rate a trip that is not completed', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.rider, lane.rating, lane.bug],
}, async ({ actors, controllers }) => {
  await test.step('requested', async () => {
    const created = await bookCash(controllers, actors.sarah.token);
    const tripId = recordId(created.body, created.failureMessage);
    const result = await rate(controllers, tripId, actors.sarah.token, { stars: 5 });
    expectTripError(result, 409, 'TRIP_NOT_COMPLETED');
  });

  await test.step('in progress', async () => {
    const created = await bookCash(controllers, actors.sarah.token);
    const tripId = recordId(created.body, created.failureMessage);
    // Joseph accepts, arrives, and starts.
    await advance(controllers, tripId, actors.joseph.token, 'start');
    const result = await rate(controllers, tripId, actors.sarah.token, { stars: 5 });
    expectTripError(result, 409, 'TRIP_NOT_COMPLETED');
  });
});

test('TC-RAT-07 invalid trip id', {
  tag: [lane.stateless, lane.negative, lane.trips, lane.rider, lane.rating],
}, async ({ actors, controllers }) => {
  const result = await rate(controllers, 'trp_DOESNOTEXIST', actors.sarah.token, { stars: 5 });
  expectTripError(result, 404, 'TRIP_NOT_FOUND');
});

const completedTripId = async (
  controllers: Controllers,
  riderToken: string,
  driverToken: string,
): Promise<string> => {
  const created = await bookCash(controllers, riderToken);
  const tripId = recordId(created.body, created.failureMessage);
  // Joseph accepts, arrives, starts, and completes.
  await advance(controllers, tripId, driverToken, 'complete');
  return tripId;
};

const rate = (
  controllers: Controllers,
  tripId: string,
  token: string,
  body: RatingRequest | { readonly comment?: string },
): Promise<ApiResult> => controllers.trips.rate(tripId, { auth: { token }, body });

const storedRating = (body: unknown, failureMessage: string): Record<string, unknown> => {
  const rating = tripRecord(body, failureMessage).rating;
  expect(isRecord(rating), failureMessage).toBe(true);
  return isRecord(rating) ? rating : {};
};

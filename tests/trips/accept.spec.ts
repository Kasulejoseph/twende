import type { ApiResult } from '../../src/client/api-client';
import type { Controllers } from '../../src/controllers';
import { isRecord } from '../../src/helpers/guards';
import { assertErrorBody, recordId } from '../support/common';
import { expect, lane, resetTest, test } from '../support/fixtures';
import { bookCash, expectTripError, tripRecord } from './trip';

resetTest('TC-ACC-01 assigned driver accepts a requested trip', {
  tag: [lane.stateful, lane.smoke, lane.trips, lane.driver],
}, async ({ actors, controllers }) => {
  const joseph = actors.joseph;
  // Sarah books a boda. Joseph accepts it.
  const tripId = await requestedTripId(controllers, actors.sarah.token);
  const result = await controllers.driver.accept(tripId, { token: joseph.token });
  expect(result.status, result.failureMessage).toBe(200);
  const accepted = tripRecord(result.body, result.failureMessage);
  const driver = assignedDriver(accepted, result.failureMessage);
  expect(accepted.status, result.failureMessage).toBe('accepted');
  expect(driver.name, result.failureMessage).toBe(joseph.name);
  expect(driver.plate, result.failureMessage).toBe(joseph.plate);
  expect(accepted.status_history, result.failureMessage).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: 'accepted' }),
  ]));

  const current = await controllers.trips.get(tripId, { token: actors.sarah.token });
  expect(current.status, current.failureMessage).toBe(200);
  const trip = tripRecord(current.body, current.failureMessage);
  expect(trip.status, current.failureMessage).toBe(accepted.status);
  expect(trip.driver, current.failureMessage).toEqual(accepted.driver);
});

resetTest('TC-ACC-02 second driver cannot take an accepted trip', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.driver],
}, async ({ actors, controllers }) => {
  const tripId = await requestedTripId(controllers, actors.sarah.token);
  // Joseph accepts. Grace tries the same trip.
  const accepted = await controllers.driver.accept(tripId, { token: actors.joseph.token });
  expect(accepted.status, accepted.failureMessage).toBe(200);
  const rejected = await controllers.driver.accept(tripId, { token: actors.grace.token });
  expectTripError(rejected, 409, 'TRIP_NOT_AVAILABLE');

  const current = await controllers.trips.get(tripId, { token: actors.sarah.token });
  expect(current.status, current.failureMessage).toBe(200);
  expect(assignedDriver(tripRecord(current.body, current.failureMessage), current.failureMessage).name, current.failureMessage)
    .toBe(actors.joseph.name);
});

resetTest.fixme('TC-ACC-03 concurrent double accept', {
  tag: [lane.stateful, lane.concurrency, lane.trips, lane.driver, lane.bug],
}, async ({ actors, controllers }) => {
  const tripId = await requestedTripId(controllers, actors.sarah.token);
  // Joseph and Grace accept the same trip at the same time.
  const [josephResult, graceResult] = await Promise.all([
    controllers.driver.accept(tripId, { token: actors.joseph.token }),
    controllers.driver.accept(tripId, { token: actors.grace.token }),
  ]);
  const failureMessage = `${josephResult.failureMessage}\n---\n${graceResult.failureMessage}`;
  const statuses = [josephResult.status, graceResult.status].sort((first, second) => first - second);
  expect(statuses, failureMessage).toEqual([200, 409]);
  const attempts = [
    { driver: actors.joseph, result: josephResult },
    { driver: actors.grace, result: graceResult },
  ];
  const winner = attempts.find((attempt) => attempt.result.status === 200);
  const loser = attempts.find((attempt) => attempt.result.status === 409);
  if (winner === undefined || loser === undefined) {
    return;
  }
  expectTripError(loser.result, 409, 'TRIP_NOT_AVAILABLE');

  const current = await controllers.trips.get(tripId, { token: actors.sarah.token });
  expect(current.status, current.failureMessage).toBe(200);
  expect(assignedDriver(tripRecord(current.body, current.failureMessage), current.failureMessage).name, current.failureMessage)
    .toBe(winner.driver.name);

  // The winner finishes the trip. The other driver cannot complete it.
  const arrived = await controllers.driver.arrive(tripId, { token: winner.driver.token });
  expect(arrived.status, arrived.failureMessage).toBe(200);
  const started = await controllers.driver.start(tripId, { token: winner.driver.token });
  expect(started.status, started.failureMessage).toBe(200);
  const completed = await controllers.driver.complete(tripId, { token: winner.driver.token });
  expect(completed.status, completed.failureMessage).toBe(200);
  const lost = await controllers.driver.complete(tripId, { token: loser.driver.token });
  expect(lost.status, lost.failureMessage).not.toBe(200);

  const finished = await controllers.trips.get(tripId, { token: actors.sarah.token });
  expect(finished.status, finished.failureMessage).toBe(200);
  const trip = tripRecord(finished.body, finished.failureMessage);
  expect(trip.status, finished.failureMessage).toBe('completed');
  expect(assignedDriver(trip, finished.failureMessage).name, finished.failureMessage).toBe(winner.driver.name);
});

resetTest('TC-ACC-04 driver already on an active trip', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.driver],
}, async ({ actors, controllers }) => {
  const joseph = actors.joseph;
  // Joseph takes trip A, then tries a second request from each active state.
  const activeTripId = await requestedTripId(controllers, actors.sarah.token);
  const accepted = await controllers.driver.accept(activeTripId, { token: joseph.token });
  expect(accepted.status, accepted.failureMessage).toBe(200);

  const stages: readonly { readonly name: string; readonly move: () => Promise<ApiResult> }[] = [
    { name: 'accepted', move: () => Promise.resolve(accepted) },
    { name: 'arrived', move: () => controllers.driver.arrive(activeTripId, { token: joseph.token }) },
    { name: 'in progress', move: () => controllers.driver.start(activeTripId, { token: joseph.token }) },
  ];

  for (const stage of stages) {
    await test.step(stage.name, async () => {
      const moved = await stage.move();
      expect(moved.status, moved.failureMessage).toBe(200);
      const requested = await bookCash(controllers, actors.sarah.token);
      const tripId = recordId(requested.body, requested.failureMessage);
      const result = await controllers.driver.accept(tripId, { token: joseph.token });
      expectTripError(result, 409, 'DRIVER_BUSY');

      const current = await controllers.trips.get(tripId, { token: actors.sarah.token });
      expect(current.status, current.failureMessage).toBe(200);
      expect(tripRecord(current.body, current.failureMessage).status, current.failureMessage).toBe('requested');
    });
  }
});

test('TC-ACC-05 car driver cannot accept a boda', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.driver],
}, async ({ actors, controllers }) => {
  const tripId = await requestedTripId(controllers, actors.sarah.token);
  // David drives cars.
  const result = await controllers.driver.accept(tripId, { token: actors.david.token });
  expectTripError(result, 403, 'SERVICE_MISMATCH');

  const current = await controllers.trips.get(tripId, { token: actors.sarah.token });
  expect(current.status, current.failureMessage).toBe(200);
  expect(tripRecord(current.body, current.failureMessage).status, current.failureMessage).toBe('requested');
});

resetTest('TC-ACC-06 cannot accept a cancelled trip', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.driver],
}, async ({ actors, controllers }) => {
  const tripId = await requestedTripId(controllers, actors.sarah.token);
  // Sarah cancels. Joseph tries to accept.
  const cancelled = await controllers.trips.cancel(tripId, {
    auth: { token: actors.sarah.token },
    body: {},
  });
  expect(cancelled.status, cancelled.failureMessage).toBe(200);
  const result = await controllers.driver.accept(tripId, { token: actors.joseph.token });
  expectTripError(result, 409, 'TRIP_NOT_AVAILABLE');
});

test('TC-ACC-07 unknown id, missing token, or invalid key', {
  tag: [lane.stateless, lane.negative, lane.security, lane.trips, lane.driver],
}, async ({ actors, controllers }) => {
  await test.step('unknown id', async () => {
    const result = await controllers.driver.accept('trp_DOESNOTEXIST', { token: actors.joseph.token });
    expectTripError(result, 404, 'TRIP_NOT_FOUND');
  });

  await test.step('missing token', async () => {
    const result = await controllers.driver.accept('trp_DOESNOTEXIST', { sendAuthorization: false });
    expect(result.status, result.failureMessage).toBe(401);
    assertErrorBody(result.body, result.failureMessage);
  });

  await test.step('invalid key', async () => {
    const result = await controllers.driver.accept('trp_DOESNOTEXIST', {
      token: actors.joseph.token,
      candidateKey: 'invalid',
    });
    expect(result.status, result.failureMessage).toBe(401);
    assertErrorBody(result.body, result.failureMessage);
  });
});

const requestedTripId = async (controllers: Controllers, token: string): Promise<string> => {
  const created = await bookCash(controllers, token);
  return recordId(created.body, created.failureMessage);
};

const assignedDriver = (trip: Record<string, unknown>, failureMessage: string): Record<string, unknown> => {
  expect(isRecord(trip.driver), failureMessage).toBe(true);
  return isRecord(trip.driver) ? trip.driver : {};
};

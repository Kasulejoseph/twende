import type { Controllers } from '../../src/controllers';
import { assertErrorBody } from '../support/common';
import { expect, lane, resetTest, test } from '../support/fixtures';
import { expectTripError, requestedTripId, tripRecord } from './trip';

resetTest('TC-ARR-01 the assigned driver marks an accepted trip as arrived and the status history records it', {
  tag: [lane.stateful, lane.smoke, lane.trips, lane.driver, lane.arrive],
}, async ({ actors, controllers }) => {
  const tripId = await requestedTripId(controllers, actors.sarah.token);
  // Joseph accepts, then arrives.
  const accepted = await controllers.driver.accept(tripId, { token: actors.joseph.token });
  expect(accepted.status, accepted.failureMessage).toBe(200);
  const result = await controllers.driver.arrive(tripId, { token: actors.joseph.token });
  expect(result.status, result.failureMessage).toBe(200);
  const trip = tripRecord(result.body, result.failureMessage);
  expect(trip.status, result.failureMessage).toBe('arrived');
  expect(trip.status_history, result.failureMessage).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: 'arrived' }),
  ]));
});

resetTest('TC-ARR-02 a driver cannot mark a trip as arrived when they are not assigned to it', {
  tag: [lane.stateful, lane.negative, lane.security, lane.trips, lane.driver, lane.arrive],
}, async ({ actors, controllers }) => {
  await test.step('requested', async () => {
    const tripId = await requestedTripId(controllers, actors.sarah.token);
    const result = await controllers.driver.arrive(tripId, { token: actors.grace.token });
    expectTripError(result, 403, 'NOT_ASSIGNED_DRIVER');
  });

  await test.step('accepted by Joseph', async () => {
    const tripId = await requestedTripId(controllers, actors.sarah.token);
    // Joseph accepts. Grace is not the assigned driver.
    const accepted = await controllers.driver.accept(tripId, { token: actors.joseph.token });
    expect(accepted.status, accepted.failureMessage).toBe(200);
    const result = await controllers.driver.arrive(tripId, { token: actors.grace.token });
    expectTripError(result, 403, 'NOT_ASSIGNED_DRIVER');
  });
});

resetTest('TC-ARR-03 the assigned driver cannot mark a trip as arrived unless it is accepted, and the status stays unchanged', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.driver, lane.arrive],
}, async ({ actors, controllers }) => {
  const joseph = { token: actors.joseph.token };
  const tripId = await requestedTripId(controllers, actors.sarah.token);

  await test.step('requested', async () => {
    const result = await controllers.driver.arrive(tripId, joseph);
    expectTripError(result, 403, 'NOT_ASSIGNED_DRIVER');
    await expectStatus(controllers, actors.sarah.token, tripId, 'requested');
  });

  await test.step('in progress', async () => {
    // Joseph accepts, arrives, and starts.
    const accepted = await controllers.driver.accept(tripId, joseph);
    expect(accepted.status, accepted.failureMessage).toBe(200);
    const arrived = await controllers.driver.arrive(tripId, joseph);
    expect(arrived.status, arrived.failureMessage).toBe(200);
    const started = await controllers.driver.start(tripId, joseph);
    expect(started.status, started.failureMessage).toBe(200);
    const result = await controllers.driver.arrive(tripId, joseph);
    expectTripError(result, 409, 'INVALID_TRANSITION');
    await expectStatus(controllers, actors.sarah.token, tripId, 'in_progress');
  });

  await test.step('completed', async () => {
    // Joseph completes the trip.
    const completed = await controllers.driver.complete(tripId, joseph);
    expect(completed.status, completed.failureMessage).toBe(200);
    const result = await controllers.driver.arrive(tripId, joseph);
    expectTripError(result, 409, 'INVALID_TRANSITION');
    await expectStatus(controllers, actors.sarah.token, tripId, 'completed');
  });
});

test('TC-ARR-04 arriving at an unknown trip returns not found, and an invalid key is rejected', {
  tag: [lane.stateless, lane.negative, lane.security, lane.trips, lane.driver, lane.arrive],
}, async ({ actors, controllers }) => {
  await test.step('unknown id', async () => {
    const result = await controllers.driver.arrive('trp_DOESNOTEXIST', { token: actors.joseph.token });
    expectTripError(result, 404, 'TRIP_NOT_FOUND');
  });

  await test.step('invalid key', async () => {
    const result = await controllers.driver.arrive('trp_DOESNOTEXIST', {
      token: actors.joseph.token,
      candidateKey: 'invalid',
    });
    expect(result.status, result.failureMessage).toBe(401);
    assertErrorBody(result.body, result.failureMessage);
  });
});

const expectStatus = async (
  controllers: Controllers,
  token: string,
  tripId: string,
  status: string,
): Promise<void> => {
  const current = await controllers.trips.get(tripId, { token });
  expect(current.status, current.failureMessage).toBe(200);
  expect(tripRecord(current.body, current.failureMessage).status, current.failureMessage).toBe(status);
};

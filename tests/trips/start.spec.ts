import { assertErrorBody, errorBody } from '../support/common';
import { expect, lane, resetTest, test } from '../support/fixtures';
import { expectStatus, expectTripError, requestedTripId, tripRecord } from './trip';

resetTest('TC-STA-01 the assigned driver starts an arrived trip and the status becomes in progress', {
  tag: [lane.stateful, lane.smoke, lane.trips, lane.driver, lane.start],
}, async ({ actors, controllers }) => {
  const driver = { token: actors.joseph.token };
  const tripId = await requestedTripId(controllers, actors.sarah.token);
  // The assigned driver accepts, then arrives.
  const accepted = await controllers.driver.accept(tripId, driver);
  expect(accepted.status, accepted.failureMessage).toBe(200);
  const arrived = await controllers.driver.arrive(tripId, driver);
  expect(arrived.status, arrived.failureMessage).toBe(200);

  const result = await controllers.driver.start(tripId, driver);
  expect(result.status, result.failureMessage).toBe(200);
  const trip = tripRecord(result.body, result.failureMessage);
  expect(trip.status, result.failureMessage).toBe('in_progress');
  expect(trip.status_history, result.failureMessage).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: 'in_progress' }),
  ]));
});

resetTest('TC-STA-02 a driver cannot start a trip they are not assigned to', {
  tag: [lane.stateful, lane.negative, lane.security, lane.trips, lane.driver, lane.start],
}, async ({ actors, controllers }) => {
  const tripId = await requestedTripId(controllers, actors.sarah.token);
  // The assigned driver accepts and arrives. Another driver tries to start.
  const accepted = await controllers.driver.accept(tripId, { token: actors.joseph.token });
  expect(accepted.status, accepted.failureMessage).toBe(200);
  const arrived = await controllers.driver.arrive(tripId, { token: actors.joseph.token });
  expect(arrived.status, arrived.failureMessage).toBe(200);

  const result = await controllers.driver.start(tripId, { token: actors.grace.token });
  expectTripError(result, 403, 'NOT_ASSIGNED_DRIVER');
  const error = errorBody(result.body, result.failureMessage);
  expect(error.message, result.failureMessage).toMatch(/You are not the driver on this trip/i);
});

resetTest('TC-STA-03 the assigned driver cannot start a trip before arriving, and the trip stays accepted', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.driver, lane.start],
}, async ({ actors, controllers }) => {
  const driver = { token: actors.joseph.token };
  const tripId = await requestedTripId(controllers, actors.sarah.token);
  // The assigned driver accepts and does not arrive.
  const accepted = await controllers.driver.accept(tripId, driver);
  expect(accepted.status, accepted.failureMessage).toBe(200);

  const result = await controllers.driver.start(tripId, driver);
  expectTripError(result, 409, 'INVALID_TRANSITION');
  await expectStatus(controllers, actors.sarah.token, tripId, 'accepted');
});

resetTest('TC-STA-04 starting a completed trip is rejected, an unknown trip returns not found, and an invalid key is rejected', {
  tag: [lane.stateful, lane.negative, lane.security, lane.trips, lane.driver, lane.start],
}, async ({ actors, controllers }) => {
  await test.step('completed', async () => {
    const driver = { token: actors.joseph.token };
    const tripId = await requestedTripId(controllers, actors.sarah.token);
    // The assigned driver accepts, arrives, starts, and completes.
    const accepted = await controllers.driver.accept(tripId, driver);
    expect(accepted.status, accepted.failureMessage).toBe(200);
    const arrived = await controllers.driver.arrive(tripId, driver);
    expect(arrived.status, arrived.failureMessage).toBe(200);
    const started = await controllers.driver.start(tripId, driver);
    expect(started.status, started.failureMessage).toBe(200);
    const completed = await controllers.driver.complete(tripId, driver);
    expect(completed.status, completed.failureMessage).toBe(200);

    const result = await controllers.driver.start(tripId, driver);
    expectTripError(result, 409, 'INVALID_TRANSITION');
  });

  await test.step('unknown id', async () => {
    const result = await controllers.driver.start('trp_DOESNOTEXIST', { token: actors.joseph.token });
    expectTripError(result, 404, 'TRIP_NOT_FOUND');
  });

  await test.step('invalid key', async () => {
    const result = await controllers.driver.start('trp_DOESNOTEXIST', {
      token: actors.joseph.token,
      candidateKey: 'invalid',
    });
    expect(result.status, result.failureMessage).toBe(401);
    assertErrorBody(result.body, result.failureMessage);
  });
});

test('TC-STA-05 a car driver cannot start a requested boda, and the trip stays requested', {
  tag: [lane.stateful, lane.negative, lane.trips, lane.driver],
}, async ({ actors, controllers }) => {
  const tripId = await requestedTripId(controllers, actors.sarah.token);
  const result = await controllers.driver.start(tripId, { token: actors.david.token });
  expectTripError(result, 403, 'NOT_ASSIGNED_DRIVER');
  const error = errorBody(result.body, result.failureMessage);
  expect(error.message, result.failureMessage).toMatch(/You are not the driver on this trip/i);
  await expectStatus(controllers, actors.sarah.token, tripId, 'requested');
});

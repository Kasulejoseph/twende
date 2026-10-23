import type { ApiResult } from '../../src/client/api-client';
import { assertErrorBody, errorCode, recordId } from '../support/common';
import { expect, lane, test } from '../support/fixtures';
import { bookCash, tripRecord } from './trip';

test('TC-GET-01 get own trip', {
  tag: [lane.stateful, lane.smoke, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  // Book a cash trip, then read it back.
  const created = await bookCash(controllers, actors.sarah.token);
  const booked = tripRecord(created.body, created.failureMessage);
  const tripId = recordId(booked, created.failureMessage);

  const result = await controllers.trips.get(tripId, { token: actors.sarah.token });
  expect(result.status, result.failureMessage).toBe(200);
  const trip = tripRecord(result.body, result.failureMessage);
  expect(trip.id, result.failureMessage).toBe(tripId);
  expect(trip.fare, result.failureMessage).toEqual(booked.fare);
  expect(trip.pickup, result.failureMessage).toEqual(booked.pickup);
  expect(trip.dropoff, result.failureMessage).toEqual(booked.dropoff);
  expect(trip.status, result.failureMessage).toEqual(booked.status);
});

test('TC-GET-02 unknown id', {
  tag: [lane.stateless, lane.negative, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  const result = await controllers.trips.get('trp_DOESNOTEXIST', { token: actors.sarah.token });
  expectTripError(result, 404, 'TRIP_NOT_FOUND');
});

test.fixme('TC-GET-03 other rider trip is not found', {
  tag: [lane.stateful, lane.security, lane.negative, lane.trips, lane.rider, lane.bug],
}, async ({ actors, controllers }) => {
  // Sarah books. Brian asks for that id.
  const created = await bookCash(controllers, actors.sarah.token);
  const tripId = recordId(created.body, created.failureMessage);

  const result = await controllers.trips.get(tripId, { token: actors.brian.token });
  expectTripError(result, 404, 'TRIP_NOT_FOUND');
});

const expectTripError = (result: ApiResult, status: number, code: string): void => {
  expect(result.status, result.failureMessage).toBe(status);
  assertErrorBody(result.body, result.failureMessage);
  expect(errorCode(result.body), result.failureMessage).toBe(code);
};

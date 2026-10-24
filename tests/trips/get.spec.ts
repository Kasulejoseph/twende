import { recordId } from '../support/common';
import { expect, lane, test } from '../support/fixtures';
import { bookCash, expectTripError, tripRecord } from './trip';

test('TC-GET-01 a rider can read a trip they booked, and the fare, places, and status match the booking', {
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

test('TC-GET-02 reading a trip id that does not exist returns trip not found', {
  tag: [lane.stateless, lane.negative, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  const result = await controllers.trips.get('trp_DOESNOTEXIST', { token: actors.sarah.token });
  expectTripError(result, 404, 'TRIP_NOT_FOUND');
});

test.fixme('TC-GET-03 one rider cannot read a trip that belongs to another rider', {
  tag: [lane.stateful, lane.security, lane.negative, lane.trips, lane.rider, lane.bug],
}, async ({ actors, controllers }) => {
  // Sarah books. Brian asks for that id.
  const created = await bookCash(controllers, actors.sarah.token);
  const tripId = recordId(created.body, created.failureMessage);

  const result = await controllers.trips.get(tripId, { token: actors.brian.token });
  expectTripError(result, 404, 'TRIP_NOT_FOUND');
});

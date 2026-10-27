import { randomUUID } from 'node:crypto';

import { balanceOf, expectLedgerIdentity, recordId, sarahWallet, tripCharges } from '../../support/common';
import { expect, lane, resetTest } from '../../support/fixtures';
import { freshBodaEstimate } from './estimate';
import { assignedDriver, statusNames, statusOrder, storedRating, tripRecord } from './trip';

resetTest('TC-E2E-01 a rider books a wallet trip, the driver completes it, and the rating and balance match the fare', {
  tag: [lane.stateful, lane.e2e, lane.billing],
}, async ({ actors, controllers }) => {
  const rider = sarahWallet(actors);
  const driver = actors.joseph;
  const estimate = await freshBodaEstimate(controllers, rider.token);
  expect(estimate.fareAmount, 'estimate fare must fit the rider wallet').toBeLessThanOrEqual(rider.openingBalance);

  // Book the quote on the wallet.
  const booked = await controllers.trips.create({
    auth: { token: rider.token },
    idempotencyKey: randomUUID(),
    body: { estimate_id: estimate.id, payment_method: 'wallet' },
  });
  expect(booked.status, booked.failureMessage).toBe(201);
  const tripId = recordId(booked.body, booked.failureMessage);
  expect(tripRecord(booked.body, booked.failureMessage).status, booked.failureMessage).toBe('requested');

  // The driver accepts, arrives, starts, and completes.
  const accepted = await controllers.driver.accept(tripId, { token: driver.token });
  expect(accepted.status, accepted.failureMessage).toBe(200);
  const acceptedTrip = tripRecord(accepted.body, accepted.failureMessage);
  const assigned = assignedDriver(acceptedTrip, accepted.failureMessage);
  expect(acceptedTrip.status, accepted.failureMessage).toBe('accepted');
  expect(assigned.name, accepted.failureMessage).toBe(driver.name);
  expect(assigned.plate, accepted.failureMessage).toBe(driver.plate);

  const arrived = await controllers.driver.arrive(tripId, { token: driver.token });
  expect(arrived.status, arrived.failureMessage).toBe(200);
  expect(tripRecord(arrived.body, arrived.failureMessage).status, arrived.failureMessage).toBe('arrived');

  const started = await controllers.driver.start(tripId, { token: driver.token });
  expect(started.status, started.failureMessage).toBe(200);
  expect(tripRecord(started.body, started.failureMessage).status, started.failureMessage).toBe('in_progress');

  const completed = await controllers.driver.complete(tripId, { token: driver.token });
  expect(completed.status, completed.failureMessage).toBe(200);
  const finished = tripRecord(completed.body, completed.failureMessage);
  expect(finished.status, completed.failureMessage).toBe('completed');
  expect(statusNames(finished.status_history, completed.failureMessage), completed.failureMessage).toEqual([...statusOrder]);

  // The rider rates the completed trip.
  const rated = await controllers.trips.rate(tripId, {
    auth: { token: rider.token },
    body: { stars: 5, comment: 'Safe ride, helmet ready' },
  });
  expect(rated.status, rated.failureMessage).toBe(201);
  expect(tripRecord(rated.body, rated.failureMessage).stars, rated.failureMessage).toBe(5);

  const current = await controllers.trips.get(tripId, { token: rider.token });
  expect(current.status, current.failureMessage).toBe(200);
  expect(storedRating(current.body, current.failureMessage).stars, current.failureMessage).toBe(5);

  expect(await balanceOf(controllers, rider.token), completed.failureMessage).toBe(rider.openingBalance - estimate.fareAmount);
  const ledger = await controllers.wallet.transactions({ token: rider.token });
  expect(ledger.status, ledger.failureMessage).toBe(200);
  expectLedgerIdentity(ledger.body, ledger.failureMessage);
});

resetTest('TC-E2E-02 a cash trip completed by the driver leaves the rider\'s wallet and ledger unchanged', {
  tag: [lane.stateful, lane.e2e, lane.billing],
}, async ({ actors, controllers }) => {
  const rider = sarahWallet(actors);
  const driver = { token: actors.joseph.token };
  const estimate = await freshBodaEstimate(controllers, rider.token);

  // Book the quote for cash, then the driver runs it through to complete.
  const booked = await controllers.trips.create({
    auth: { token: rider.token },
    idempotencyKey: randomUUID(),
    body: { estimate_id: estimate.id, payment_method: 'cash' },
  });
  expect(booked.status, booked.failureMessage).toBe(201);
  const tripId = recordId(booked.body, booked.failureMessage);

  const accepted = await controllers.driver.accept(tripId, driver);
  expect(accepted.status, accepted.failureMessage).toBe(200);
  const arrived = await controllers.driver.arrive(tripId, driver);
  expect(arrived.status, arrived.failureMessage).toBe(200);
  const started = await controllers.driver.start(tripId, driver);
  expect(started.status, started.failureMessage).toBe(200);
  const completed = await controllers.driver.complete(tripId, driver);
  expect(completed.status, completed.failureMessage).toBe(200);
  expect(tripRecord(completed.body, completed.failureMessage).status, completed.failureMessage).toBe('completed');

  expect(await balanceOf(controllers, rider.token), completed.failureMessage).toBe(rider.openingBalance);
  expect(await tripCharges(controllers, rider.token, tripId), completed.failureMessage).toEqual([]);
});

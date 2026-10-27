import { assertErrorBody, recordId } from '../../support/common';
import { expect, lane, resetTest, test } from '../../support/fixtures';
import { bookCash, listedIds } from './trip';

resetTest('TC-AVL-01 a boda driver sees a rider\'s requested boda in the available trips', {
  tag: [lane.stateful, lane.smoke, lane.trips, lane.driver],
}, async ({ actors, controllers }) => {
  // Sarah books a boda and leaves it requested.
  const created = await bookCash(controllers, actors.sarah.token);
  const tripId = recordId(created.body, created.failureMessage);

  const result = await controllers.driver.available({ token: actors.joseph.token });
  expect(result.status, result.failureMessage).toBe(200);
  expect(listedIds(result.body, result.failureMessage), result.failureMessage).toContain(tripId);
});

resetTest('TC-AVL-02 a car driver does not see a requested boda', {
  tag: [lane.stateful, lane.trips, lane.driver],
}, async ({ actors, controllers }) => {
  // The only open request is a boda. David drives cars.
  const created = await bookCash(controllers, actors.sarah.token);
  const tripId = recordId(created.body, created.failureMessage);

  const result = await controllers.driver.available({ token: actors.david.token });
  expect(result.status, result.failureMessage).toBe(200);
  expect(listedIds(result.body, result.failureMessage), result.failureMessage).not.toContain(tripId);
});

resetTest('TC-AVL-03 a trip the rider cancelled, or a trip another driver accepted, disappears from the available trips', {
  tag: [lane.stateful, lane.trips, lane.driver],
}, async ({ actors, controllers }) => {
  await test.step('cancelled', async () => {
    const created = await bookCash(controllers, actors.sarah.token);
    const tripId = recordId(created.body, created.failureMessage);
    // Sarah cancels before a driver accepts.
    const cancelled = await controllers.trips.cancel(tripId, {
      auth: { token: actors.sarah.token },
      body: { reason: 'Changed plans' },
    });
    expect(cancelled.status, cancelled.failureMessage).toBe(200);

    const result = await controllers.driver.available({ token: actors.joseph.token });
    expect(result.status, result.failureMessage).toBe(200);
    expect(listedIds(result.body, result.failureMessage), result.failureMessage).not.toContain(tripId);
  });

  await test.step('accepted', async () => {
    const created = await bookCash(controllers, actors.sarah.token);
    const tripId = recordId(created.body, created.failureMessage);
    // Grace takes the trip.
    const accepted = await controllers.driver.accept(tripId, { token: actors.grace.token });
    expect(accepted.status, accepted.failureMessage).toBe(200);

    const result = await controllers.driver.available({ token: actors.joseph.token });
    expect(result.status, result.failureMessage).toBe(200);
    expect(listedIds(result.body, result.failureMessage), result.failureMessage).not.toContain(tripId);
  });
});

test('TC-AVL-04 a missing key, an invalid key, or a rider token cannot list available trips', {
  tag: [lane.stateless, lane.negative, lane.security, lane.trips, lane.driver],
}, async ({ actors, controllers }) => {
  await test.step('missing key', async () => {
    const result = await controllers.driver.available({
      token: actors.joseph.token,
      sendCandidateKey: false,
    });
    expect(result.status, result.failureMessage).toBe(401);
    assertErrorBody(result.body, result.failureMessage);
  });

  await test.step('invalid key', async () => {
    const result = await controllers.driver.available({
      token: actors.joseph.token,
      candidateKey: 'invalid',
    });
    expect(result.status, result.failureMessage).toBe(401);
    assertErrorBody(result.body, result.failureMessage);
  });

  await test.step('rider token', async () => {
    const result = await controllers.driver.available({ token: actors.sarah.token });
    expect([401, 403], result.failureMessage).toContain(result.status);
    assertErrorBody(result.body, result.failureMessage);
  });
});

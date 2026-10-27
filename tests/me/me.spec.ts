import { riderProfileRows } from '../../data/auth';
import { riderView } from './profile';
import { assertErrorBody, errorCode } from '../../support/common';
import { expect, lane, resetTest, test } from '../../support/fixtures';

resetTest('TC-ME-01 a rider profile returns the rider\'s name and opening wallet balance after reset', {
  tag: [lane.stateful, lane.smoke, lane.billing, lane.rider],
}, async ({ actors, controllers }) => {
  const result = await controllers.rider.me({ token: actors.sarah.token });
  expect(result.status, result.failureMessage).toBe(200);

  const rider = riderView(result.body, result.failureMessage);
  expect(rider.name, result.failureMessage).toBe(actors.sarah.name);
  expect(rider.phone, result.failureMessage).toBe(actors.sarah.phone);
  expect(rider.balance, result.failureMessage).toBe(actors.sarah.openingBalance);
  expect(rider.currency, result.failureMessage).toBe('UGX');
});

resetTest('TC-ME-02 a second rider\'s profile returns that rider\'s opening wallet balance after reset', {
  tag: [lane.stateful, lane.billing, lane.rider],
}, async ({ actors, controllers }) => {
  const result = await controllers.rider.me({ token: actors.brian.token });
  expect(result.status, result.failureMessage).toBe(200);

  const rider = riderView(result.body, result.failureMessage);
  expect(rider.name, result.failureMessage).toBe(actors.brian.name);
  expect(rider.phone, result.failureMessage).toBe(actors.brian.phone);
  expect(rider.balance, result.failureMessage).toBe(actors.brian.openingBalance);
});

test('TC-ME-03 a missing candidate key, an invalid rider token, or a missing bearer token cannot read the rider profile', {
  tag: [lane.stateless, lane.negative, lane.security, lane.billing, lane.rider],
}, async ({ actors, controllers }) => {
  for (const row of riderProfileRows(actors.sarah.token)) {
    await test.step(row.name, async () => {
      const result = await controllers.rider.me(row.auth);
      expect(result.status, result.failureMessage).toBe(401);
      assertErrorBody(result.body, result.failureMessage);
    });
  }
});

test('TC-ME-04 a driver token cannot read the rider profile', {
  tag: [lane.stateless, lane.negative, lane.security, lane.billing, lane.driver],
}, async ({ actors, controllers }) => {
  const result = await controllers.rider.me({ token: actors.joseph.token });
  expect(result.status, result.failureMessage).toBe(403);
  assertErrorBody(result.body, result.failureMessage);
  expect(errorCode(result.body), result.failureMessage).toBe('FORBIDDEN');
});

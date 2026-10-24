import type { AuthOverride } from '../src/controllers/auth';
import { isRecord } from '../src/helpers/guards';
import { assertErrorBody, errorCode, walletBalance } from './support/common';
import { expect, lane, resetTest, test } from './support/fixtures';

const unauthorisedRows = (token: string): readonly { readonly name: string; readonly auth: AuthOverride }[] => [
  { name: 'missing key', auth: { token, sendCandidateKey: false } },
  { name: 'invalid token', auth: { token: 'invalid' } },
  { name: 'missing authorization', auth: { sendAuthorization: false } },
];

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
  for (const row of unauthorisedRows(actors.sarah.token)) {
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

interface RiderView {
  readonly name: unknown;
  readonly phone: unknown;
  readonly balance: unknown;
  readonly currency: unknown;
}

const riderView = (body: unknown, failureMessage: string): RiderView => {
  expect(isRecord(body), failureMessage).toBe(true);
  const profile = isRecord(body) ? body : {};
  const wallet = isRecord(profile.wallet) ? profile.wallet : {};

  return {
    name: profile.name,
    phone: profile.phone,
    balance: walletBalance(body, failureMessage),
    currency: wallet.currency,
  };
};

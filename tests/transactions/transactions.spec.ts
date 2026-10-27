import { randomUUID } from 'node:crypto';

import { ledgerKeyRows } from '../../data/auth';
import { standardTopUpAmount } from '../../data/top-up-amounts';
import { completedWalletTrip, ledgerView } from './ledger';
import { assertErrorBody, balanceOf, mtnBody, recordId, sarahWallet } from '../../support/common';
import { expect, lane, resetTest, test } from '../../support/fixtures';

resetTest('TC-TXN-01 the rider\'s ledger lists the top-up and the balance matches the row totals', {
  tag: [lane.stateful, lane.billing, lane.wallet, lane.transaction],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  // Seed one successful top-up for the ledger to list.
  const topUp = await controllers.wallet.topUp({
    auth: { token: sarah.token },
    idempotencyKey: randomUUID(),
    body: mtnBody(sarah.phone, standardTopUpAmount),
  });
  expect(topUp.status, topUp.failureMessage).toBe(201);
  const topUpId = recordId(topUp.body, topUp.failureMessage);

  const result = await controllers.wallet.transactions({ token: sarah.token });
  expect(result.status, result.failureMessage).toBe(200);

  // Verify the ledger contains the top-up.
  const ledger = ledgerView(result.body, result.failureMessage);
  expect(ledger.openingBalance, result.failureMessage).toBe(sarah.openingBalance);
  expect(ledger.balance, result.failureMessage).toBe(sarah.openingBalance + standardTopUpAmount);
  expect(ledger.rows, result.failureMessage).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'top_up', amount: standardTopUpAmount, reference: topUpId }),
  ]));
  expect(ledger.openingBalance + ledger.signedSum, result.failureMessage).toBe(ledger.balance);

  const balance = await balanceOf(controllers, sarah.token);
  expect(balance, result.failureMessage).toBe(ledger.balance);
});

test('TC-TXN-02 a missing or invalid candidate key cannot read the wallet ledger', {
  tag: [lane.stateless, lane.negative, lane.security, lane.wallet, lane.transaction],
}, async ({ actors, controllers }) => {
  for (const row of ledgerKeyRows(actors.sarah.token)) {
    await test.step(row.name, async () => {
      const result = await controllers.wallet.transactions(row.auth);
      expect(result.status, result.failureMessage).toBe(401);
      assertErrorBody(result.body, result.failureMessage);
    });
  }
});

resetTest('TC-TXN-03 completing a wallet trip adds one trip charge and reduces the rider\'s balance by the fare', {
  tag: [lane.stateful, lane.billing, lane.e2e, lane.wallet, lane.transaction],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const trip = await completedWalletTrip(controllers, sarah.token, actors.joseph.token);

  const result = await controllers.wallet.transactions({ token: sarah.token });
  expect(result.status, result.failureMessage).toBe(200);
  const ledger = ledgerView(result.body, result.failureMessage);
  const charge = ledger.rows.find((row) => row.type === 'trip_charge' && row.reference === trip.tripId);
  expect(charge, result.failureMessage).toEqual(expect.objectContaining({
    type: 'trip_charge',
    reference: trip.tripId,
    amount: -trip.fare,
  }));
  expect(ledger.openingBalance + ledger.signedSum, result.failureMessage).toBe(ledger.balance);

  const balance = await balanceOf(controllers, sarah.token);
  expect(balance, result.failureMessage).toBe(ledger.balance);
  expect(sarah.openingBalance - balance, result.failureMessage).toBe(trip.fare);
});

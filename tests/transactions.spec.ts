import { randomUUID } from 'node:crypto';

import type { Controllers } from '../src/controllers';
import type { AuthOverride } from '../src/controllers/auth';
import { isRecord } from '../src/helpers/guards';
import { assertErrorBody, balanceOf, dataList, mtnBody, recordId, sarahWallet } from './support/common';
import { expect, lane, resetTest, test } from './support/fixtures';

const acacia = { lat: 0.33495, lng: 32.59352 } as const;
const ntinda = { lat: 0.35402, lng: 32.61498 } as const;
const topUpAmount = 10_000;

const unauthorisedRows = (token: string): readonly { readonly name: string; readonly auth: AuthOverride }[] => [
  { name: 'missing key', auth: { token, sendCandidateKey: false } },
  { name: 'invalid key', auth: { token, candidateKey: 'invalid' } },
];

resetTest('TC-TXN-01 the rider\'s ledger lists the top-up and the balance matches the row totals', {
  tag: [lane.stateful, lane.billing, lane.wallet, lane.transaction],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  // Seed one successful top-up for the ledger to list.
  const topUp = await controllers.wallet.topUp({
    auth: { token: sarah.token },
    idempotencyKey: randomUUID(),
    body: mtnBody(sarah.phone, topUpAmount),
  });
  expect(topUp.status, topUp.failureMessage).toBe(201);
  const topUpId = recordId(topUp.body, topUp.failureMessage);

  const result = await controllers.wallet.transactions({ token: sarah.token });
  expect(result.status, result.failureMessage).toBe(200);

  // Verify the ledger contains the top-up.
  const ledger = ledgerView(result.body, result.failureMessage);
  expect(ledger.openingBalance, result.failureMessage).toBe(sarah.openingBalance);
  expect(ledger.balance, result.failureMessage).toBe(sarah.openingBalance + topUpAmount);
  expect(ledger.rows, result.failureMessage).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'top_up', amount: topUpAmount, reference: topUpId }),
  ]));
  expect(ledger.openingBalance + ledger.signedSum, result.failureMessage).toBe(ledger.balance);

  const balance = await balanceOf(controllers, sarah.token);
  expect(balance, result.failureMessage).toBe(ledger.balance);
});

test('TC-TXN-02 a missing or invalid candidate key cannot read the wallet ledger', {
  tag: [lane.stateless, lane.negative, lane.security, lane.wallet, lane.transaction],
}, async ({ actors, controllers }) => {
  for (const row of unauthorisedRows(actors.sarah.token)) {
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

interface LedgerView {
  readonly openingBalance: number;
  readonly balance: number;
  readonly rows: readonly Record<string, unknown>[];
  readonly signedSum: number;
}

const ledgerView = (body: unknown, failureMessage: string): LedgerView => {
  expect(isRecord(body), failureMessage).toBe(true);
  const record = isRecord(body) ? body : {};
  expect(typeof record.opening_balance, failureMessage).toBe('number');
  expect(typeof record.balance, failureMessage).toBe('number');
  const rows = dataList(body, failureMessage);
  const signedSum = rows.reduce((sum, row) => {
    expect(typeof row.amount, failureMessage).toBe('number');
    return sum + (typeof row.amount === 'number' ? row.amount : 0);
  }, 0);

  return {
    openingBalance: typeof record.opening_balance === 'number' ? record.opening_balance : 0,
    balance: typeof record.balance === 'number' ? record.balance : 0,
    rows,
    signedSum,
  };
};

const fareAmount = (body: unknown, failureMessage: string): number => {
  expect(isRecord(body), failureMessage).toBe(true);
  const record = isRecord(body) ? body : {};
  expect(isRecord(record.fare), failureMessage).toBe(true);
  const fare = isRecord(record.fare) ? record.fare : {};
  expect(typeof fare.amount, failureMessage).toBe('number');
  expect(typeof fare.amount === 'number' && fare.amount > 0, failureMessage).toBe(true);
  return typeof fare.amount === 'number' ? fare.amount : 0;
};

interface CompletedWalletTrip {
  readonly tripId: string;
  readonly fare: number;
}

const completedWalletTrip = async (
  controllers: Controllers,
  sarahToken: string,
  josephToken: string,
): Promise<CompletedWalletTrip> => {
  // Quote Acacia to Ntinda, boda.
  const estimate = await controllers.estimates.create({
    auth: { token: sarahToken },
    body: { pickup: acacia, dropoff: ntinda, service_type: 'boda' },
  });
  expect(estimate.status, estimate.failureMessage).toBe(201);
  const fare = fareAmount(estimate.body, estimate.failureMessage);

  // Book that quote and pay with the wallet.
  const booked = await controllers.trips.create({
    auth: { token: sarahToken },
    idempotencyKey: randomUUID(),
    body: { estimate_id: recordId(estimate.body, estimate.failureMessage), payment_method: 'wallet' },
  });
  expect(booked.status, booked.failureMessage).toBe(201);
  const tripId = recordId(booked.body, booked.failureMessage);
  const driver = { token: josephToken };

  // Joseph accepts, arrives, starts, and completes. Completion charges the wallet.
  const accepted = await controllers.driver.accept(tripId, driver);
  expect(accepted.status, accepted.failureMessage).toBe(200);
  const arrived = await controllers.driver.arrive(tripId, driver);
  expect(arrived.status, arrived.failureMessage).toBe(200);
  const started = await controllers.driver.start(tripId, driver);
  expect(started.status, started.failureMessage).toBe(200);
  const completed = await controllers.driver.complete(tripId, driver);
  expect(completed.status, completed.failureMessage).toBe(200);

  return { tripId, fare };
};

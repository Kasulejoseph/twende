import { randomUUID } from 'node:crypto';

import type { Controllers } from '../src/controllers';
import { isRecord } from '../src/helpers/guards';
import type { Actors } from '../src/types/actors';
import type { TopUpRequest } from '../src/types/api';
import { invalidPhones } from './data/phones';
import { topUpAmountCases } from './data/top-up-amounts';
import { assertErrorBody, dataList, errorCode, nonEmptyString, walletBalance } from './support/common';
import { expect, lane, resetTest, test } from './support/fixtures';

const topUpAmount = 10_000;

resetTest('TC-TOP-01 MTN MoMo top-up credits wallet', {
  tag: [lane.stateful, lane.smoke, lane.billing, lane.wallet, lane.topups],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const before = await balanceOf(controllers, sarah.token);
  expect(before, 'balance before top-up').toBe(sarah.openingBalance);

  const result = await controllers.wallet.topUp({
    auth: { token: sarah.token },
    idempotencyKey: randomUUID(),
    body: mtnBody(sarah.phone, topUpAmount),
  });
  expect(result.status, result.failureMessage).toBe(201);

  const topUp = topUpView(result.body, result.failureMessage);
  expect(topUp.status, result.failureMessage).toBe('successful');
  expect(topUp.amount, result.failureMessage).toBe(topUpAmount);
  expect(topUp.currency, result.failureMessage).toBe('UGX');
  expect(topUp.wallet_balance_after, result.failureMessage).toBe(before + topUpAmount);

  const after = await balanceOf(controllers, sarah.token);
  expect(after, result.failureMessage).toBe(topUp.wallet_balance_after);
});

resetTest('TC-TOP-02 Airtel Money top-up credits wallet', {
  tag: [lane.stateful, lane.billing, lane.wallet, lane.topups],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const amount = 5_000;
  const before = await balanceOf(controllers, sarah.token);

  const result = await controllers.wallet.topUp({
    auth: { token: sarah.token },
    idempotencyKey: randomUUID(),
    body: { amount, provider: 'airtel_money', phone: sarah.phone },
  });
  expect(result.status, result.failureMessage).toBe(201);
  expect(topUpView(result.body, result.failureMessage).provider, result.failureMessage).toBe('airtel_money');

  const after = await balanceOf(controllers, sarah.token);
  expect(after, result.failureMessage).toBe(before + amount);
});

resetTest('TC-TOP-03 invalid provider', {
  tag: [lane.stateful, lane.negative, lane.wallet, lane.topups],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const result = await controllers.wallet.topUp({
    auth: { token: sarah.token },
    idempotencyKey: randomUUID(),
    rawBody: JSON.stringify({ amount: topUpAmount, provider: 'paypal', phone: sarah.phone }),
  });
  expect(result.status, result.failureMessage).toBe(422);
  assertErrorBody(result.body, result.failureMessage);
  expect(errorCode(result.body), result.failureMessage).toBe('VALIDATION_ERROR');

  const after = await balanceOf(controllers, sarah.token);
  expect(after, result.failureMessage).toBe(sarah.openingBalance);
});

resetTest('TC-TOP-04 invalid phone', {
  tag: [lane.stateful, lane.negative, lane.boundary, lane.wallet, lane.topups],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const before = await balanceOf(controllers, sarah.token);

  for (const row of invalidPhones) {
    await test.step(row.id, async () => {
      const result = await controllers.wallet.topUp({
        auth: { token: sarah.token },
        idempotencyKey: randomUUID(),
        body: mtnBody(row.phone, topUpAmount),
      });
      expect(result.status, result.failureMessage).toBe(422);
      assertErrorBody(result.body, result.failureMessage);
      expect(errorCode(result.body), result.failureMessage).toBe('VALIDATION_ERROR');

      const after = await balanceOf(controllers, sarah.token);
      expect(after, result.failureMessage).toBe(before);
    });
  }
});

resetTest('TC-TOP-05 amount boundaries', {
  tag: [lane.stateful, lane.boundary, lane.billing, lane.wallet, lane.topups],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);

  for (const row of topUpAmountCases) {
    await test.step(String(row.amount), async () => {
      const before = await balanceOf(controllers, sarah.token);
      const result = await controllers.wallet.topUp({
        auth: { token: sarah.token },
        idempotencyKey: randomUUID(),
        body: mtnBody(sarah.phone, row.amount),
      });
      expect(result.status, result.failureMessage).toBe(row.expectedStatus);

      const after = await balanceOf(controllers, sarah.token);
      if (row.creditsWallet) {
        expect(after, result.failureMessage).toBe(before + row.amount);
        return;
      }

      assertErrorBody(result.body, result.failureMessage);
      expect(errorCode(result.body), result.failureMessage).toBe('VALIDATION_ERROR');
      expect(after, result.failureMessage).toBe(before);
    });
  }
});

resetTest('TC-TOP-06 missing Idempotency-Key', {
  tag: [lane.stateful, lane.negative, lane.idempotency, lane.wallet, lane.topups],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const before = await balanceOf(controllers, sarah.token);
  const result = await controllers.wallet.topUp({
    auth: { token: sarah.token },
    body: mtnBody(sarah.phone, 1_000),
  });
  expect(result.status, result.failureMessage).toBe(400);
  assertErrorBody(result.body, result.failureMessage);
  expect(errorCode(result.body), result.failureMessage).toBe('IDEMPOTENCY_KEY_REQUIRED');

  const after = await balanceOf(controllers, sarah.token);
  expect(after, result.failureMessage).toBe(before);
});

resetTest.fixme('TC-TOP-07 replay same key and body credits once', {
  tag: [lane.stateful, lane.billing, lane.idempotency, lane.wallet, lane.topups, lane.bug],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const before = await balanceOf(controllers, sarah.token);
  const idempotencyKey = randomUUID();
  const body = mtnBody(sarah.phone, topUpAmount);
  const created = await controllers.wallet.topUp({
    auth: { token: sarah.token },
    idempotencyKey,
    body,
  });
  expect(created.status, created.failureMessage).toBe(201);
  const createdTopUp = topUpView(created.body, created.failureMessage);
  expect(nonEmptyString(createdTopUp.id), created.failureMessage).toBe(true);

  const replay = await controllers.wallet.topUp({
    auth: { token: sarah.token },
    idempotencyKey,
    body,
  });
  expect(replay.status, replay.failureMessage).toBe(200);
  const replayTopUp = topUpView(replay.body, replay.failureMessage);
  expect(replayTopUp.id, replay.failureMessage).toBe(createdTopUp.id);
  expect(replayTopUp.wallet_balance_after, replay.failureMessage).toBe(createdTopUp.wallet_balance_after);

  const after = await balanceOf(controllers, sarah.token);
  expect(after, replay.failureMessage).toBe(before + topUpAmount);
  await expectOneTopUp(controllers, sarah.token, createdTopUp.id);
});

resetTest('TC-TOP-08 same key different body rejected', {
  tag: [lane.stateful, lane.negative, lane.idempotency, lane.wallet, lane.topups],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const before = await balanceOf(controllers, sarah.token);
  const idempotencyKey = randomUUID();
  const created = await controllers.wallet.topUp({
    auth: { token: sarah.token },
    idempotencyKey,
    body: mtnBody(sarah.phone, topUpAmount),
  });
  expect(created.status, created.failureMessage).toBe(201);

  const reused = await controllers.wallet.topUp({
    auth: { token: sarah.token },
    idempotencyKey,
    body: mtnBody(sarah.phone, 20_000),
  });
  expect(reused.status, reused.failureMessage).toBe(422);
  assertErrorBody(reused.body, reused.failureMessage);
  expect(errorCode(reused.body), reused.failureMessage).toBe('IDEMPOTENCY_KEY_REUSED');

  const after = await balanceOf(controllers, sarah.token);
  expect(after, reused.failureMessage).toBe(before + topUpAmount);
});

resetTest.fixme('TC-TOP-09 concurrent same-key top-ups credit once', {
  tag: [lane.stateful, lane.concurrency, lane.billing, lane.idempotency, lane.wallet, lane.topups, lane.bug],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const before = await balanceOf(controllers, sarah.token);
  expect(before, 'balance before top-up').toBe(25_000);

  const input = {
    auth: { token: sarah.token },
    idempotencyKey: randomUUID(),
    body: mtnBody(sarah.phone, topUpAmount),
  };
  const [left, right] = await Promise.all([
    controllers.wallet.topUp(input),
    controllers.wallet.topUp(input),
  ]);
  const failureMessage = `${left.failureMessage}\n---\n${right.failureMessage}`;
  const statuses = [left.status, right.status].sort((first, second) => first - second);
  const replayPair = statuses[0] === 200 && statuses[1] === 201;
  const createPair = statuses[0] === 201 && statuses[1] === 201;
  expect(replayPair || createPair, failureMessage).toBe(true);

  const leftTopUp = topUpView(left.body, failureMessage);
  const rightTopUp = topUpView(right.body, failureMessage);
  expect(nonEmptyString(leftTopUp.id), failureMessage).toBe(true);
  expect(rightTopUp.id, failureMessage).toBe(leftTopUp.id);

  const after = await balanceOf(controllers, sarah.token);
  expect(after, failureMessage).toBe(35_000);
  await expectOneTopUp(controllers, sarah.token, leftTopUp.id);
});

test('TC-TOP-10 invalid JSON body', {
  tag: [lane.stateful, lane.negative, lane.wallet, lane.topups],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const before = await balanceOf(controllers, sarah.token);
  const result = await controllers.wallet.topUp({
    auth: { token: sarah.token },
    idempotencyKey: randomUUID(),
    rawBody: '{amount:10000,',
  });
  expect(result.status, result.failureMessage).toBe(400);
  assertErrorBody(result.body, result.failureMessage);
  expect(errorCode(result.body), result.failureMessage).toBe('INVALID_JSON');

  const after = await balanceOf(controllers, sarah.token);
  expect(after, result.failureMessage).toBe(before);
});

interface SarahWallet {
  readonly token: string;
  readonly phone: string;
  readonly openingBalance: number;
}

const sarahWallet = (actors: Actors): SarahWallet => {
  const { sarah } = actors;
  if (sarah.phone === null || sarah.openingBalance === null) {
    throw new Error('Sarah phone and opening balance are required.');
  }

  return {
    token: sarah.token,
    phone: sarah.phone,
    openingBalance: sarah.openingBalance,
  };
};

const mtnBody = (phone: string, amount: number): TopUpRequest => ({
  amount,
  provider: 'mtn_momo',
  phone,
});

const balanceOf = async (controllers: Controllers, token: string): Promise<number> => {
  const result = await controllers.rider.me({ token });
  expect(result.status, result.failureMessage).toBe(200);
  const balance = walletBalance(result.body, result.failureMessage);
  expect(typeof balance, result.failureMessage).toBe('number');
  return typeof balance === 'number' ? balance : 0;
};

const topUpView = (body: unknown, failureMessage: string): Record<string, unknown> => {
  expect(isRecord(body), failureMessage).toBe(true);
  return isRecord(body) ? body : {};
};

const expectOneTopUp = async (controllers: Controllers, token: string, topUpId: unknown): Promise<void> => {
  const ledger = await controllers.wallet.transactions({ token });
  expect(ledger.status, ledger.failureMessage).toBe(200);
  const rows = dataList(ledger.body, ledger.failureMessage).filter((row) => row.type === 'top_up' && row.reference === topUpId);
  expect(rows, ledger.failureMessage).toHaveLength(1);
};

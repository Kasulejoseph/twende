import { randomUUID } from 'node:crypto';

import { invalidPhones } from '../../data/phones';
import { standardTopUpAmount, topUpAmountCases } from '../../data/top-up-amounts';
import { assertErrorBody, balanceOf, errorCode, mtnBody, nonEmptyString, sarahWallet } from '../../support/common';
import { expect, lane, resetTest, test } from '../../support/fixtures';
import { expectOneTopUp, topUpView } from './top-up';

resetTest('TC-TOP-01 an MTN MoMo top-up increases the rider\'s wallet once', {
  tag: [lane.stateful, lane.smoke, lane.billing, lane.wallet, lane.topups],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const before = await balanceOf(controllers, sarah.token);
  expect(before, 'balance before top-up').toBe(sarah.openingBalance);

  const result = await controllers.wallet.topUp({
    auth: { token: sarah.token },
    idempotencyKey: randomUUID(),
    body: mtnBody(sarah.phone, standardTopUpAmount),
  });
  expect(result.status, result.failureMessage).toBe(201);

  const topUp = topUpView(result.body, result.failureMessage);
  expect(topUp.status, result.failureMessage).toBe('successful');
  expect(topUp.amount, result.failureMessage).toBe(standardTopUpAmount);
  expect(topUp.currency, result.failureMessage).toBe('UGX');
  expect(topUp.wallet_balance_after, result.failureMessage).toBe(before + standardTopUpAmount);

  const after = await balanceOf(controllers, sarah.token);
  expect(after, result.failureMessage).toBe(topUp.wallet_balance_after);
});

resetTest('TC-TOP-02 an Airtel Money top-up increases the rider\'s wallet once', {
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

resetTest('TC-TOP-03 a top-up with an unknown mobile-money provider is rejected', {
  tag: [lane.stateful, lane.negative, lane.wallet, lane.topups],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const result = await controllers.wallet.topUp({
    auth: { token: sarah.token },
    idempotencyKey: randomUUID(),
    rawBody: JSON.stringify({ amount: standardTopUpAmount, provider: 'paypal', phone: sarah.phone }),
  });
  expect(result.status, result.failureMessage).toBe(422);
  assertErrorBody(result.body, result.failureMessage);
  expect(errorCode(result.body), result.failureMessage).toBe('VALIDATION_ERROR');

  const after = await balanceOf(controllers, sarah.token);
  expect(after, result.failureMessage).toBe(sarah.openingBalance);
});

resetTest('TC-TOP-04 a top-up with a malformed phone number is rejected and the wallet stays unchanged', {
  tag: [lane.stateful, lane.negative, lane.boundary, lane.wallet, lane.topups],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const before = await balanceOf(controllers, sarah.token);

  for (const row of invalidPhones) {
    await test.step(row.id, async () => {
      const result = await controllers.wallet.topUp({
        auth: { token: sarah.token },
        idempotencyKey: randomUUID(),
        body: mtnBody(row.phone, standardTopUpAmount),
      });
      expect(result.status, result.failureMessage).toBe(422);
      assertErrorBody(result.body, result.failureMessage);
      expect(errorCode(result.body), result.failureMessage).toBe('VALIDATION_ERROR');

      const after = await balanceOf(controllers, sarah.token);
      expect(after, result.failureMessage).toBe(before);
    });
  }
});

resetTest('TC-TOP-05 the minimum and maximum top-up amounts succeed, and amounts outside that range are rejected', {
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

resetTest('TC-TOP-06 a top-up without an Idempotency-Key is rejected', {
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

resetTest.fixme('TC-TOP-07 replaying the same top-up key and body credits the wallet only once', {
  tag: [lane.stateful, lane.billing, lane.idempotency, lane.wallet, lane.topups, lane.bug],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const before = await balanceOf(controllers, sarah.token);
  const idempotencyKey = randomUUID();
  const body = mtnBody(sarah.phone, standardTopUpAmount);
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
  expect(after, replay.failureMessage).toBe(before + standardTopUpAmount);
  await expectOneTopUp(controllers, sarah.token, createdTopUp.id);
});

resetTest('TC-TOP-08 reusing a top-up key with a different amount is rejected and credits the wallet once', {
  tag: [lane.stateful, lane.negative, lane.idempotency, lane.wallet, lane.topups],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const before = await balanceOf(controllers, sarah.token);
  const idempotencyKey = randomUUID();
  const created = await controllers.wallet.topUp({
    auth: { token: sarah.token },
    idempotencyKey,
    body: mtnBody(sarah.phone, standardTopUpAmount),
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
  expect(after, reused.failureMessage).toBe(before + standardTopUpAmount);
});

resetTest('TC-TOP-09 two simultaneous top-ups with the same key credit the wallet only once', {
  tag: [lane.stateful, lane.concurrency, lane.billing, lane.idempotency, lane.wallet, lane.topups, lane.bug],
}, async ({ actors, controllers }) => {
  const sarah = sarahWallet(actors);
  const before = await balanceOf(controllers, sarah.token);
  expect(before, 'balance before top-up').toBe(25_000);

  const input = {
    auth: { token: sarah.token },
    idempotencyKey: randomUUID(),
    body: mtnBody(sarah.phone, standardTopUpAmount),
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

test('TC-TOP-10 a top-up body that is not valid JSON is rejected', {
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

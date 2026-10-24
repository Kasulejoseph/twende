import { expect } from '@playwright/test';

import type { Controllers } from '../../src/controllers';
import { isRecord } from '../../src/helpers/guards';
import type { Actors } from '../../src/types/actors';
import type { TopUpRequest } from '../../src/types/api';

export const nonEmptyString = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0;

export const recordId = (body: unknown, failureMessage: string): string => {
  expect(isRecord(body), failureMessage).toBe(true);
  const record = isRecord(body) ? body : {};
  expect(nonEmptyString(record.id), failureMessage).toBe(true);
  return typeof record.id === 'string' ? record.id : '';
};

export const dataList = (body: unknown, failureMessage: string): readonly Record<string, unknown>[] => {
  expect(isRecord(body), failureMessage).toBe(true);
  if (!isRecord(body)) {
    return [];
  }

  expect(Array.isArray(body.data), failureMessage).toBe(true);
  if (!Array.isArray(body.data)) {
    return [];
  }

  return body.data.map((item) => {
    expect(isRecord(item), failureMessage).toBe(true);
    return isRecord(item) ? item : {};
  });
};

export const errorCode = (body: unknown): unknown =>
  isRecord(body) && isRecord(body.error) ? body.error.code : undefined;

export interface SarahWallet {
  readonly token: string;
  readonly phone: string;
  readonly openingBalance: number;
}

export const sarahWallet = (actors: Actors): SarahWallet => {
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

export const mtnBody = (phone: string, amount: number): TopUpRequest => ({
  amount,
  provider: 'mtn_momo',
  phone,
});

export const balanceOf = async (controllers: Controllers, token: string): Promise<number> => {
  const result = await controllers.rider.me({ token });
  expect(result.status, result.failureMessage).toBe(200);
  const balance = walletBalance(result.body, result.failureMessage);
  expect(typeof balance, result.failureMessage).toBe('number');
  return typeof balance === 'number' ? balance : 0;
};

export const walletBalance = (body: unknown, failureMessage: string): unknown => {
  expect(isRecord(body), failureMessage).toBe(true);
  const profile = isRecord(body) ? body : {};
  expect(isRecord(profile.wallet), failureMessage).toBe(true);
  const wallet = isRecord(profile.wallet) ? profile.wallet : {};
  return wallet.balance;
};

export const assertErrorBody = (body: unknown, failureMessage: string): void => {
  expect(isRecord(body), failureMessage).toBe(true);
  if (!isRecord(body)) {
    return;
  }

  expect(Object.keys(body), failureMessage).toEqual(['error']);
  expect(isRecord(body.error), failureMessage).toBe(true);
  if (!isRecord(body.error)) {
    return;
  }

  expect(Object.keys(body.error).sort(), failureMessage).toEqual(['code', 'message', 'request_id']);
  expect(nonEmptyString(body.error.code), failureMessage).toBe(true);
  expect(typeof body.error.message, failureMessage).toBe('string');
  expect(nonEmptyString(body.error.request_id), failureMessage).toBe(true);
};

export const tripCharges = async (
  controllers: Controllers,
  token: string,
  tripId: string,
): Promise<readonly Record<string, unknown>[]> => {
  const ledger = await controllers.wallet.transactions({ token });
  expect(ledger.status, ledger.failureMessage).toBe(200);
  return dataList(ledger.body, ledger.failureMessage).filter((row) =>
    row.type === 'trip_charge' && row.reference === tripId);
};

export const expectLedgerIdentity = (body: unknown, failureMessage: string): void => {
  expect(isRecord(body), failureMessage).toBe(true);
  const record = isRecord(body) ? body : {};
  expect(typeof record.opening_balance, failureMessage).toBe('number');
  expect(typeof record.balance, failureMessage).toBe('number');
  const signedSum = dataList(body, failureMessage).reduce((sum, row) => {
    expect(typeof row.amount, failureMessage).toBe('number');
    return sum + (typeof row.amount === 'number' ? row.amount : 0);
  }, 0);
  const opening = typeof record.opening_balance === 'number' ? record.opening_balance : 0;
  const balance = typeof record.balance === 'number' ? record.balance : 0;
  expect(opening + signedSum, failureMessage).toBe(balance);
};

export const errorBody = (body: unknown, failureMessage: string): Record<string, unknown> => {
  expect(isRecord(body), failureMessage).toBe(true);
  if (!isRecord(body)) {
    return {};
  }

  expect(isRecord(body.error), failureMessage).toBe(true);
  if (!isRecord(body.error)) {
    return {};
  }
  return body.error;
};

import { expect } from '@playwright/test';

import { isRecord } from '../../src/helpers/guards';

export const nonEmptyString = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0;

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

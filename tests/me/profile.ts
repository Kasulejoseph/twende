import { expect } from '@playwright/test';

import { isRecord } from '../../src/helpers/guards';
import { walletBalance } from '../../support/common';

export interface RiderView {
  readonly name: unknown;
  readonly phone: unknown;
  readonly balance: unknown;
  readonly currency: unknown;
}

export const riderView = (body: unknown, failureMessage: string): RiderView => {
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

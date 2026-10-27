import { expect } from '@playwright/test';

import type { Controllers } from '../../src/controllers';
import { isRecord } from '../../src/helpers/guards';
import { dataList } from '../../support/common';

export const topUpView = (body: unknown, failureMessage: string): Record<string, unknown> => {
  expect(isRecord(body), failureMessage).toBe(true);
  return isRecord(body) ? body : {};
};

export const expectOneTopUp = async (controllers: Controllers, token: string, topUpId: unknown): Promise<void> => {
  const ledger = await controllers.wallet.transactions({ token });
  expect(ledger.status, ledger.failureMessage).toBe(200);
  const rows = dataList(ledger.body, ledger.failureMessage).filter((row) => row.type === 'top_up' && row.reference === topUpId);
  expect(rows, ledger.failureMessage).toHaveLength(1);
};

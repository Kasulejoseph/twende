import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';

import type { ApiResult } from '../../src/client/api-client';
import type { Controllers } from '../../src/controllers';
import { isRecord } from '../../src/helpers/guards';
import { freshBodaEstimate } from './estimate';

export const tripRecord = (body: unknown, failureMessage: string): Record<string, unknown> => {
  expect(isRecord(body), failureMessage).toBe(true);
  return isRecord(body) ? body : {};
};

export const bookCash = async (controllers: Controllers, token: string): Promise<ApiResult> => {
  const estimate = await freshBodaEstimate(controllers, token);
  const result = await controllers.trips.create({
    auth: { token },
    idempotencyKey: randomUUID(),
    body: { estimate_id: estimate.id, payment_method: 'cash' },
  });
  expect(result.status, result.failureMessage).toBe(201);
  return result;
};

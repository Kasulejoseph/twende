import type { AuthOverride } from '../../src/controllers/auth';
import { isRecord } from '../../src/helpers/guards';
import type { ApiResult } from '../../src/client/api-client';
import type { FareEstimateRequest, ServiceType } from '../../src/types/api';
import { inapplicablePromos, invalidPromoCode } from '../data/promos';
import { assertErrorBody, errorCode, nonEmptyString } from '../support/common';
import { expect, lane, test } from '../support/fixtures';
import { estimateView, fareAmount } from './estimate';

const acacia = { lat: 0.33495, lng: 32.59352 } as const;
const ntinda = { lat: 0.35402, lng: 32.61498 } as const;
const masaka = { lat: -0.36182, lng: 31.79046 } as const;
const fiveMinutesMs = 5 * 60 * 1000;
const expiryToleranceMs = 5_000;

const sarahAuth = (token: string): AuthOverride => ({ token });

const quote = (service: ServiceType, promoCode?: string): FareEstimateRequest => ({
  pickup: acacia,
  dropoff: ntinda,
  service_type: service,
  ...(promoCode === undefined ? {} : { promo_code: promoCode }),
});

test('TC-EST-01 Acacia to Ntinda boda estimate', {
  tag: [lane.stateless, lane.smoke, lane.trips, lane.rider, lane.fareEstimate],
}, async ({ actors, controllers }) => {
  const result = await controllers.estimates.create({
    auth: sarahAuth(actors.sarah.token),
    body: quote('boda'),
  });
  expect(result.status, result.failureMessage).toBe(201);

  const estimate = estimateView(result.body, result.failureMessage);
  expect(nonEmptyString(estimate.id), result.failureMessage).toBe(true);
  expect(typeof estimate.id === 'string' && estimate.id.startsWith('est_'), result.failureMessage).toBe(true);
  expect(estimate.fareAmount, result.failureMessage).toBeGreaterThan(0);
  expect(estimate.fareAmount % 100, result.failureMessage).toBe(0);
  expect(estimate.currency, result.failureMessage).toBe('UGX');
  expect(estimate.distanceKm, result.failureMessage).toBeGreaterThan(0);
  expect(Number.isInteger(estimate.etaMinutes) && estimate.etaMinutes >= 0, result.failureMessage).toBe(true);
  expect(Math.abs(estimate.expiresAt - estimate.createdAt - fiveMinutesMs), result.failureMessage).toBeLessThanOrEqual(expiryToleranceMs);
});

test('TC-EST-02 car and send estimates', {
  tag: [lane.stateless, lane.trips, lane.rider, lane.fareEstimate],
}, async ({ actors, controllers }) => {
  for (const service of ['car', 'send'] as const) {
    await test.step(service, async () => {
      const result = await controllers.estimates.create({
        auth: sarahAuth(actors.sarah.token),
        body: quote(service),
      });
      expect(result.status, result.failureMessage).toBe(201);
      const amount = fareAmount(result.body, result.failureMessage);
      expect(amount, result.failureMessage).toBeGreaterThan(0);
      if (service === 'send') {
        expect(amount % 100, result.failureMessage).toBe(0);
      }
    });
  }
});

test('TC-EST-03 pickup outside Kampala', {
  tag: [lane.stateless, lane.negative, lane.trips, lane.rider, lane.fareEstimate],
}, async ({ actors, controllers }) => {
  const result = await controllers.estimates.create({
    auth: sarahAuth(actors.sarah.token),
    body: {
      pickup: masaka,
      dropoff: ntinda,
      service_type: 'boda',
    },
  });
  expectEstimateError(result, 422, 'OUTSIDE_SERVICE_AREA');
});

test('TC-EST-09 dropoff outside Kampala with pickup in Kampala', {
  tag: [lane.stateless, lane.trips, lane.rider, lane.fareEstimate],
}, async ({ actors, controllers }) => {
  const result = await controllers.estimates.create({
    auth: sarahAuth(actors.sarah.token),
    body: {
      pickup: acacia,
      dropoff: masaka,
      service_type: 'boda',
    },
  });
  expect(result.status, result.failureMessage).toBe(201);
  const amount = fareAmount(result.body, result.failureMessage);
  expect(amount, result.failureMessage).toBeGreaterThan(0);
  expect(amount % 100, result.failureMessage).toBe(0);
  expect(dropoff(result.body, result.failureMessage), result.failureMessage).toMatchObject(masaka);
});

test('TC-EST-04 pickup equals dropoff', {
  tag: [lane.stateless, lane.negative],
}, async ({ actors, controllers }) => {
  const result = await controllers.estimates.create({
    auth: sarahAuth(actors.sarah.token),
    body: {
      pickup: acacia,
      dropoff: acacia,
      service_type: 'boda',
    },
  });
  expectEstimateError(result, 422, 'SAME_LOCATION');
});

test('TC-EST-05 invalid promo', {
  tag: [lane.stateless, lane.negative],
}, async ({ actors, controllers }) => {
  const result = await controllers.estimates.create({
    auth: sarahAuth(actors.sarah.token),
    body: quote('boda', invalidPromoCode),
  });
  expectEstimateError(result, 422, 'INVALID_PROMO');
});

test('TC-EST-06 promo not applicable', {
  tag: [lane.stateless, lane.negative],
}, async ({ actors, controllers }) => {
  for (const row of inapplicablePromos) {
    await test.step(`${row.promo} ${row.service}`, async () => {
      const result = await controllers.estimates.create({
        auth: sarahAuth(actors.sarah.token),
        body: quote(row.service, row.promo),
      });
      expectEstimateError(result, 422, 'PROMO_NOT_APPLICABLE');
    });
  }
});

test('TC-EST-07 body is not valid JSON', {
  tag: [lane.stateless, lane.negative, lane.trips, lane.rider, lane.fareEstimate],
}, async ({ actors, controllers }) => {
  const result = await controllers.estimates.create({
    auth: sarahAuth(actors.sarah.token),
    rawBody: '{pickup:',
  });
  expect(result.status, result.failureMessage).toBe(400);
  assertErrorBody(result.body, result.failureMessage);
});

test('TC-EST-08 missing fields and invalid coordinates', {
  tag: [lane.stateless, lane.negative, lane.boundary, lane.trips, lane.rider, lane.fareEstimate],
}, async ({ actors, controllers }) => {
  const auth = sarahAuth(actors.sarah.token);
  const rows: readonly { readonly name: string; readonly body?: FareEstimateRequest; readonly rawBody?: string }[] = [
    {
      name: 'missing service type',
      rawBody: JSON.stringify({ pickup: acacia, dropoff: ntinda }),
    },
    {
      name: 'latitude 91',
      body: { pickup: { lat: 91, lng: acacia.lng }, dropoff: ntinda, service_type: 'boda' },
    },
    {
      name: 'service type bike',
      rawBody: JSON.stringify({ pickup: acacia, dropoff: ntinda, service_type: 'bike' }),
    },
  ];

  for (const row of rows) {
    await test.step(row.name, async () => {
      const result = await controllers.estimates.create({ auth, body: row.body, rawBody: row.rawBody });
      expectEstimateError(result, 422, 'VALIDATION_ERROR');
    });
  }
});

const dropoff = (body: unknown, failureMessage: string): Record<string, unknown> => {
  expect(isRecord(body), failureMessage).toBe(true);
  const record = isRecord(body) ? body : {};
  expect(isRecord(record.dropoff), failureMessage).toBe(true);
  return isRecord(record.dropoff) ? record.dropoff : {};
};

const expectEstimateError = (result: ApiResult, status: number, code: string): void => {
  expect(result.status, result.failureMessage).toBe(status);
  assertErrorBody(result.body, result.failureMessage);
  expect(errorCode(result.body), result.failureMessage).toBe(code);
};

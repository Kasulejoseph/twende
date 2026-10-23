import type { AuthOverride } from '../src/controllers/auth';
import { assertErrorBody, dataList, nonEmptyString } from './support/common';
import { expect, lane, test } from './support/fixtures';

const ntinda = { id: 'plc_ntinda', lat: 0.35402, lng: 32.61498 } as const;
const ntindaPattern = /ntinda/i;

const invalidKeyRows: readonly { readonly name: string; readonly auth: AuthOverride }[] = [
  { name: 'missing key', auth: { sendCandidateKey: false } },
  { name: 'invalid key', auth: { candidateKey: 'invalid' } },
];

test('TC-PLC-01 list places with no query', {
  tag: [lane.stateless, lane.smoke, lane.places],
}, async ({ controllers }) => {
  const result = await controllers.places.list();
  expect(result.status, result.failureMessage).toBe(200);

  const places = dataList(result.body, result.failureMessage);
  expect(places.length, result.failureMessage).toBeGreaterThan(0);

  for (const place of places) {
    expect(nonEmptyString(place.id), result.failureMessage).toBe(true);
    expect(nonEmptyString(place.name), result.failureMessage).toBe(true);
    expect(nonEmptyString(place.area), result.failureMessage).toBe(true);
    expect(typeof place.lat === 'number' && Number.isFinite(place.lat), result.failureMessage).toBe(true);
    expect(typeof place.lng === 'number' && Number.isFinite(place.lng), result.failureMessage).toBe(true);
  }
});

test('TC-PLC-02 filter by query ntinda', {
  tag: [lane.stateless, lane.places],
}, async ({ controllers }) => {
  const queryOptions = ['ntinda', 'NTINDA', 'NTINDA SHOPPING'];
  const randomQuery = queryOptions[Math.floor(Math.random() * queryOptions.length)];

  const result = await controllers.places.list({ q: randomQuery });
  expect(result.status, result.failureMessage).toBe(200);

  const places = dataList(result.body, result.failureMessage);
  for (const place of places) {
    const name = typeof place.name === 'string' ? place.name : '';
    const area = typeof place.area === 'string' ? place.area : '';
    expect(ntindaPattern.test(name) || ntindaPattern.test(area), result.failureMessage).toBe(true);
  }
  expect(places, result.failureMessage).toEqual(expect.arrayContaining([
    expect.objectContaining({ area: 'Ntinda' }),
  ]));
});

test('TC-PLC-03 full-text case-insensitive search', {
  tag: [lane.stateless, lane.places],
}, async ({ controllers }) => {
  const result = await controllers.places.list({ q: 'NTINDA SHOPPING' });
  expect(result.status, result.failureMessage).toBe(200);
  expect(dataList(result.body, result.failureMessage), result.failureMessage).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: ntinda.id }),
  ]));
});

test('TC-PLC-04 unknown location returns empty list', {
  tag: [lane.stateless, lane.places, lane.negative],
}, async ({ controllers }) => {
  const result = await controllers.places.list({ q: 'zzz_not_a_place' });
  expect(result.status, result.failureMessage).toBe(200);
  expect(dataList(result.body, result.failureMessage), result.failureMessage).toEqual([]);
});

test('TC-PLC-05 missing or invalid candidate key', {
  tag: [lane.stateless, lane.negative, lane.security],
}, async ({ controllers }) => {
  for (const row of invalidKeyRows) {
    await test.step(row.name, async () => {
      const result = await controllers.places.list({ auth: row.auth });
      expect(result.status, result.failureMessage).toBe(401);
      assertErrorBody(result.body, result.failureMessage);
    });
  }
});

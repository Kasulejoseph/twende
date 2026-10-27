import { placesKeyRows } from '../data/auth';
import { ntindaPattern, ntindaPlace, ntindaQueries } from '../data/places';
import { assertErrorBody, dataList, nonEmptyString } from '../support/common';
import { expect, lane, test } from '../support/fixtures';

test('TC-PLC-01 listing places with no search returns the place catalogue', {
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

test('TC-PLC-02 searching for a known place returns only places that match that name', {
  tag: [lane.stateless, lane.places],
}, async ({ controllers }) => {
  const randomQuery = ntindaQueries[Math.floor(Math.random() * ntindaQueries.length)];

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

test('TC-PLC-03 a place search matches the name regardless of letter case', {
  tag: [lane.stateless, lane.places],
}, async ({ controllers }) => {
  const result = await controllers.places.list({ q: 'NTINDA SHOPPING' });
  expect(result.status, result.failureMessage).toBe(200);
  expect(dataList(result.body, result.failureMessage), result.failureMessage).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: ntindaPlace.id }),
  ]));
});

test('TC-PLC-04 searching for an unknown location returns an empty list', {
  tag: [lane.stateless, lane.places, lane.negative],
}, async ({ controllers }) => {
  const result = await controllers.places.list({ q: 'zzz_not_a_place' });
  expect(result.status, result.failureMessage).toBe(200);
  expect(dataList(result.body, result.failureMessage), result.failureMessage).toEqual([]);
});

test('TC-PLC-05 a missing or invalid candidate key cannot list places', {
  tag: [lane.stateless, lane.negative, lane.security],
}, async ({ controllers }) => {
  for (const row of placesKeyRows) {
    await test.step(row.name, async () => {
      const result = await controllers.places.list({ auth: row.auth });
      expect(result.status, result.failureMessage).toBe(401);
      assertErrorBody(result.body, result.failureMessage);
    });
  }
});

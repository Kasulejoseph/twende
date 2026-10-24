import { isRecord } from '../../src/helpers/guards';
import { invalidPagingCases } from '../data/paging';
import { assertErrorBody, dataList, recordId } from '../support/common';
import { expect, lane, resetTest, test } from '../support/fixtures';
import { bookCash } from './trip';

test('TC-LST-01 a rider\'s trip list returns a page of their trips after they book one', {
  tag: [lane.stateful, lane.smoke, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  // Book one trip so the list is not empty.
  await bookCash(controllers, actors.sarah.token);

  const result = await controllers.trips.list({ auth: { token: actors.sarah.token } });
  expect(result.status, result.failureMessage).toBe(200);
  const page = tripPage(result.body, result.failureMessage);
  expect(typeof page.page, result.failureMessage).toBe('number');
  expect(typeof page.pageSize, result.failureMessage).toBe('number');
  expect(page.total, result.failureMessage).toBeGreaterThanOrEqual(page.rows.length);
  expect(page.rows.length, result.failureMessage).toBeGreaterThan(0);
});

resetTest('TC-LST-02 a rider\'s trip list is empty after the sandbox is reset', {
  tag: [lane.stateful, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  const result = await controllers.trips.list({ auth: { token: actors.sarah.token } });
  expect(result.status, result.failureMessage).toBe(200);
  const page = tripPage(result.body, result.failureMessage);
  expect(page.rows, result.failureMessage).toEqual([]);
  expect(page.total, result.failureMessage).toBe(0);
});

resetTest('TC-LST-03 filtering a rider\'s trips by requested hides the trip they cancelled', {
  tag: [lane.stateful, lane.trips, lane.rider],
}, async ({ actors, controllers }) => {
  // Book two trips, then cancel one.
  const requested = await bookCash(controllers, actors.sarah.token);
  const requestedId = recordId(requested.body, requested.failureMessage);
  const toCancel = await bookCash(controllers, actors.sarah.token);
  const cancelledId = recordId(toCancel.body, toCancel.failureMessage);
  const cancelled = await controllers.trips.cancel(cancelledId, {
    auth: { token: actors.sarah.token },
    body: { reason: 'Changed plans' },
  });
  expect(cancelled.status, cancelled.failureMessage).toBe(200);

  const result = await controllers.trips.list({
    auth: { token: actors.sarah.token },
    status: 'requested',
  });
  expect(result.status, result.failureMessage).toBe(200);
  const page = tripPage(result.body, result.failureMessage);
  expect(page.rows.every((row) => row.status === 'requested'), result.failureMessage).toBe(true);
  expect(page.rows, result.failureMessage).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: requestedId }),
  ]));
  expect(page.rows.map((row) => row.id), result.failureMessage).not.toContain(cancelledId);
});

resetTest.fixme('TC-LST-04 the second page of a rider\'s trips returns the trip that was not on the first page', {
  tag: [lane.stateful, lane.trips, lane.rider, lane.bug],
}, async ({ actors, controllers }) => {
  // Two trips, then one row per page.
  await bookCash(controllers, actors.sarah.token);
  await bookCash(controllers, actors.sarah.token);

  const first = await controllers.trips.list({
    auth: { token: actors.sarah.token },
    page: 1,
    page_size: 1,
  });
  expect(first.status, first.failureMessage).toBe(200);
  const firstPage = tripPage(first.body, first.failureMessage);
  expect(firstPage.rows, first.failureMessage).toHaveLength(1);
  expect(firstPage.page, first.failureMessage).toBe(1);
  expect(firstPage.pageSize, first.failureMessage).toBe(1);
  expect(firstPage.total, first.failureMessage).toBeGreaterThanOrEqual(2);

  const second = await controllers.trips.list({
    auth: { token: actors.sarah.token },
    page: 2,
    page_size: 1,
  });
  expect(second.status, second.failureMessage).toBe(200);
  const secondPage = tripPage(second.body, second.failureMessage);
  expect(secondPage.rows, second.failureMessage).toHaveLength(1);
  expect(secondPage.rows[0]?.id, second.failureMessage).not.toBe(firstPage.rows[0]?.id);
});

test('TC-LST-05 filtering trips by an unknown status is rejected', {
  tag: [lane.stateful, lane.negative],
}, async ({ actors, controllers }) => {
  await bookCash(controllers, actors.sarah.token);

  const result = await controllers.trips.list({
    auth: { token: actors.sarah.token },
    status: 'flying',
  });
  expect(result.status, result.failureMessage).toBe(200);
  const page = tripPage(result.body, result.failureMessage);
  expect(page.rows, result.failureMessage).toHaveLength(0);
});

test('TC-LST-06 a page number or page size outside the allowed range is rejected', {
  tag: [lane.stateless, lane.negative, lane.boundary],
}, async ({ actors, controllers }) => {
  for (const row of invalidPagingCases) {
    await test.step(row.id, async () => {
      const result = await controllers.trips.list({
        auth: { token: actors.sarah.token },
        page: row.page,
        page_size: row.page_size,
      });
      expect(result.status, result.failureMessage).toBe(422);
    });
  }
});

test('TC-LST-07 an invalid candidate key cannot list trips', {
  tag: [lane.stateless, lane.negative, lane.security],
}, async ({ actors, controllers }) => {
  const result = await controllers.trips.list({
    auth: { token: actors.sarah.token, candidateKey: 'invalid' },
  });
  expect(result.status, result.failureMessage).toBe(401);
  assertErrorBody(result.body, result.failureMessage);
});

resetTest('TC-LST-08 one rider\'s trip list does not include a trip another rider booked', {
  tag: [lane.stateful, lane.security],
}, async ({ actors, controllers }) => {
  // Sarah books. Brian has no trips of his own.
  const booked = await bookCash(controllers, actors.sarah.token);
  const tripId = recordId(booked.body, booked.failureMessage);
  const result = await controllers.trips.list({ auth: { token: actors.brian.token } });
  expect(result.status, result.failureMessage).toBe(200);
  const page = tripPage(result.body, result.failureMessage);
  expect(page.rows.map((row) => row.id), result.failureMessage).not.toContain(tripId);
});

interface TripPage {
  readonly page: unknown;
  readonly pageSize: unknown;
  readonly total: number;
  readonly rows: readonly Record<string, unknown>[];
}

const tripPage = (body: unknown, failureMessage: string): TripPage => {
  expect(isRecord(body), failureMessage).toBe(true);
  const record = isRecord(body) ? body : {};
  expect(typeof record.total, failureMessage).toBe('number');
  return {
    page: record.page,
    pageSize: record.page_size,
    total: typeof record.total === 'number' ? record.total : 0,
    rows: dataList(body, failureMessage),
  };
};

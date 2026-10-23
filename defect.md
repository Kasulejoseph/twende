# Defects

Observed on 23 October 2026 against `https://staging-twende-backend.safeboda.com/api/qa-sandbox`. Rider is Sarah Nakato (`+256700100231`).

DEF-001 and DEF-002 are the same balance error. After `POST /v1/_reset` her opening balance is 25000 UGX. An idempotent MTN top-up of 10000 is stored twice. The top-up response and the single ledger row still describe one credit.

TC-TOP-08 is not this defect. The same idempotency key with a different amount returns 422 `IDEMPOTENCY_KEY_REUSED` and the wallet increases by 10000 only.

DEF-003 is separate. The second page of `GET /v1/trips` is empty while `total` says those trips exist.

DEF-004 is separate. Brian Okello (`+256700100487`) can read a trip that Sarah booked.

DEF-005 is separate. Sarah can cancel a trip after Joseph Ssemanda has completed it.

## DEF-001 Replay of the same top-up credits the wallet twice

**Title:** Same idempotency key and body returns the original top-up but credits the wallet again

**Description:** `POST /v1/wallet/top-ups` requires `Idempotency-Key`. A second call with that same key and the same body returns 200 and the original top-up. The response `wallet_balance_after` stays 35000, and `GET /v1/wallet/transactions` contains one `top_up` row for that id. `GET /v1/me` and the ledger `balance` are 45000. `opening_balance + sum(data[].amount)` is 35000, which does not equal `balance`.

**Severity:** Critical. The replay creates 10000 UGX that no ledger row accounts for.

**Expected results:**

- First call returns 201.
- Second call returns 200, not 422, with the same top-up id and the same `wallet_balance_after`.
- `GET /v1/me` balance is 35000, an increase of 10000 once.
- The ledger has one `top_up` row whose `reference` is that top-up id.

**Actual results:**

- First call returned 201 for `top_125C9E1DD9D2`, `wallet_balance_after` 35000.
- Second call returned 200 for the same id, `wallet_balance_after` 35000, `created_at` unchanged.
- `GET /v1/me` returned `wallet.balance` 45000.
- The ledger returned `opening_balance` 25000, `balance` 45000, and one row: type `top_up`, amount 10000, `reference` `top_125C9E1DD9D2`, `balance_after` 35000.

**Steps to reproduce:**

1. `POST /v1/_reset` with a valid `X-Candidate-Key`.
2. `GET /v1/me` with Sarah's bearer token. Balance is 25000.
3. `POST /v1/wallet/top-ups` with a new `Idempotency-Key` and body `{ "amount": 10000, "provider": "mtn_momo", "phone": "+256700100231" }`.
4. Repeat that POST with the same key and the same body.
5. `GET /v1/me` and `GET /v1/wallet/transactions`.

Found by TC-TOP-07.

## DEF-002 Concurrent same-key top-ups credit the wallet twice

**Title:** Two parallel top-ups with one idempotency key return one id and credit the wallet twice

**Description:** Two simultaneous `POST /v1/wallet/top-ups` calls with the same idempotency key and the same body return one 201 and one 200 for the same top-up id. Both responses report `wallet_balance_after` 35000. The wallet balance is 45000.

**Severity:** Critical. A duplicate in-flight request creates the same unaccounted 10000 UGX as DEF-001.

**Expected results:**

- The two responses are 201 and 200, or 201 and 201, and both bodies have the same top-up id.
- `GET /v1/me` balance is 35000.
- The ledger has one `top_up` row for that id.

**Actual results:**

- One call returned 201 and the other returned 200.
- Both bodies were `top_8D1B1069FB3E` with `wallet_balance_after` 35000.
- `GET /v1/me` returned `wallet.balance` 45000.

**Steps to reproduce:**

1. `POST /v1/_reset` with a valid `X-Candidate-Key`.
2. `GET /v1/me` with Sarah's bearer token. Balance is 25000.
3. Send two `POST /v1/wallet/top-ups` requests at the same time. Use one `Idempotency-Key` and one body: `{ "amount": 10000, "provider": "mtn_momo", "phone": "+256700100231" }`.
4. `GET /v1/me`.

Found by TC-TOP-09.

## DEF-003 Trip list page 2 is empty while total counts the trips

**Title:** `GET /v1/trips?page=2&page_size=1` returns no rows when two trips exist

**Description:** After a reset, Sarah has two booked trips. `GET /v1/trips?page=1&page_size=1` returns one row and `total` 2. The next page, `page=2&page_size=1`, returns 200 with `data: []` and the same `total` 2. The second trip is counted and cannot be read.

**Severity:** Major. Any list longer than `page_size` drops every trip after the first page.

**Expected results:**

- `page=1&page_size=1` returns 200, `data.length` 1, `page` 1, `page_size` 1, and `total` at least 2.
- `page=2&page_size=1` returns 200 and one row.
- That row's id is different from the id on page 1.

**Actual results:**

- Page 1 returned 200 with one row, `page` 1, `page_size` 1, and `total` 2.
- Page 2 returned 200:

```json
{
  "data": [],
  "page": 2,
  "page_size": 1,
  "total": 2
}
```

**Steps to reproduce:**

1. `POST /v1/_reset` with a valid `X-Candidate-Key`.
2. Book two cash trips for Sarah. For each one, `POST /v1/fare-estimates` for a boda from Acacia Mall (`0.33495, 32.59352`) to Ntinda (`0.35402, 32.61498`), then `POST /v1/trips` with a new `Idempotency-Key` and `{ "estimate_id": "<that estimate>", "payment_method": "cash" }`.
3. `GET /v1/trips?page=1&page_size=1` with Sarah's bearer token.
4. `GET /v1/trips?page=2&page_size=1` with the same token.

Found by TC-LST-04.

## DEF-004 Another rider can read a trip they do not own

**Title:** `GET /v1/trips/{trip_id}` returns Sarah's trip to Brian

**Description:** Sarah books a cash trip. Brian calls `GET /v1/trips/{trip_id}` with that id and his own bearer token. The sandbox returns 200 and the full trip, including pickup and dropoff. The trip is not hidden as not found.

**Severity:** Critical. Any rider who knows a trip id can read another rider's trip.

**Expected results:**

- Status is 404, not 200 and not 403.
- `error.code` is `TRIP_NOT_FOUND`.
- The body is only the error object. It does not include pickup, driver, or phone.

**Actual results:**

- Brian's request returned 200 for `trp_4682A3025A18`.
- The body was Sarah's trip: status `requested`, service `boda`, pickup Acacia Mall (`0.33495, 32.59352`), dropoff Ntinda Shopping Complex (`0.35402, 32.61498`), fare 5200 UGX, `payment_method` `cash`, `driver` null.

**Steps to reproduce:**

1. Book a cash trip for Sarah. `POST /v1/fare-estimates` for a boda from Acacia Mall (`0.33495, 32.59352`) to Ntinda (`0.35402, 32.61498`), then `POST /v1/trips` with a new `Idempotency-Key` and `{ "estimate_id": "<that estimate>", "payment_method": "cash" }`.
2. `GET /v1/trips/{trip_id}` with Brian's bearer token and the id from step 1.

Found by TC-GET-03.

## DEF-005 A completed trip can still be cancelled

**Title:** `POST /v1/trips/{trip_id}/cancel` returns 200 after the driver has completed the trip

**Description:** Sarah books a cash trip. Joseph accepts, arrives, starts, and completes it. Sarah then cancels with an empty body. The sandbox returns 200 and sets the status to `cancelled`. The status history keeps `completed` and appends `cancelled` after it. `cancel_reason` is null.

**Severity:** Major. A completed trip is not final, so a rider can cancel a trip the driver has already finished.

**Expected results:**

- Status is 409.
- `error.code` is `TRIP_COMPLETED`.
- The trip stays `completed`.

**Actual results:**

- Cancel returned 200 for `trp_AFD59AD69C84`.
- `status` was `cancelled` and `cancel_reason` was null.
- `status_history` was `requested`, `accepted`, `arrived`, `in_progress`, `completed`, then `cancelled`.
- The assigned driver was Joseph Ssemanda, plate `UFA 412K`.

**Steps to reproduce:**

1. `POST /v1/_reset` with a valid `X-Candidate-Key`.
2. Book a cash trip for Sarah. `POST /v1/fare-estimates` for a boda from Acacia Mall (`0.33495, 32.59352`) to Ntinda (`0.35402, 32.61498`), then `POST /v1/trips` with a new `Idempotency-Key` and `{ "estimate_id": "<that estimate>", "payment_method": "cash" }`.
3. As Joseph, `POST /v1/driver/trips/{trip_id}/accept`, then `arrive`, `start`, and `complete`.
4. As Sarah, `POST /v1/trips/{trip_id}/cancel` with `{}`.

Found by TC-CAN-05.

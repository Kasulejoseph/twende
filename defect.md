# Defects

Observed on 23 October 2026 against `https://staging-twende-backend.safeboda.com/api/qa-sandbox`. Rider is Sarah Nakato (`+256700100231`), opening balance 25000 UGX after `POST /v1/_reset`. Both defects are the same balance error: an idempotent MTN top-up of 10000 is stored twice. The top-up response and the single ledger row still describe one credit.

TC-TOP-08 is not this defect. The same idempotency key with a different amount returns 422 `IDEMPOTENCY_KEY_REUSED` and the wallet increases by 10000 only.

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

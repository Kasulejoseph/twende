# Twende API tests

Playwright API tests for the Twende QA sandbox. Controllers issue HTTP calls. Specs own the assertions. One candidate key owns the sandbox, so anything that calls `POST /v1/_reset` runs one test at a time.

Scenario specs are not in this bootstrap yet, so `npm test` exits with "No tests found" until they are added.

## Setup

```bash
npm ci
cp .env.example .env
```

Set `CANDIDATE_KEY` in `.env`. Do not commit `.env`. In GitHub Actions the same value belongs in the `CANDIDATE_KEY` secret.

Persona tokens default to the published sandbox fixtures. Override them with `SARAH_TOKEN`, `BRIAN_TOKEN`, `JOSEPH_TOKEN`, `GRACE_TOKEN`, or `DAVID_TOKEN` if needed. `BASE_URL` defaults to the staging sandbox.

## Commands

| Command | What it runs |
| --- | --- |
| `npm test` | Stateless tests in parallel, then stateful and LLM tests with one worker |
| `npm run test:all` | `npm test` plus the five-minute estimate expiry |
| `npm run test:stateless` | `@stateless` only |
| `npm run test:stateful` | `@stateful` with `--workers=1` |
| `npm run test:llm` | `@llm` with `--workers=1` |
| `npm run test:slow` | `@slow` with `--workers=1` |
| `npm run test:smoke` | `@smoke` with `--workers=1` |
| `npx playwright test -g TC-PLC-02` | One case. Add `--workers=1` if the case resets the sandbox |
| `npm run report` | Open the local HTML report |

The config default is one worker. A bare `npx playwright test` therefore cannot run two resetting tests at once. Stateless parallelism is opt-in through `npm run test:stateless` and the CI shard jobs.

## Layout

- `src/client` sets auth headers, redacts credentials in failure text, and fails the test on HTTP 500. Expected 4xx responses are returned to the spec. Playwright owns the base URL, the JSON body, and the failure trace.
- `src/controllers` maps one endpoint group each and does not assert.
- `tests/support/fixtures.ts` injects `api`, `actors`, and `controllers`.
- `tests/data` holds the shared input tables.
- Specs assert with Playwright `expect` and pass `result.diagnostic` as the message.

Tag each spec with exactly one lane from `lane`: `@stateless`, `@stateful`, `@llm`, or `@slow`. `@smoke` may be added beside a lane. Stateless tests must not reset the sandbox or read wallet or trip state.

## CI

`.github/workflows/playwright.yml` shards only the stateless project (`1/2` and `2/2`). Stateful, LLM, and slow jobs share the `twende-sandbox` concurrency group so they queue, including across workflow runs that use the same key. Blob reports are merged into one HTML artifact even when a job fails. Retries are off.

## Results

No suite has been executed yet.

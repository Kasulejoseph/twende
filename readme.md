# Twende API tests

Playwright API tests for the Twende QA sandbox. Controllers issue HTTP calls. Specs own the assertions. One candidate key owns the sandbox, so anything that calls `POST /v1/_reset` runs one test at a time.

`npm test` runs every spec in the `all` project. Lane commands still select `@stateless`, `@stateful`, `@boda-assist`, and `@slow`.

## Setup

```bash
npm ci
cp .env.example .env
```

Set `CANDIDATE_KEY` in `.env`. Do not commit `.env`. In GitHub Actions the same value belongs in the `CANDIDATE_KEY` secret. `.env.example` already has `BASE_URL` and the published persona tokens. CI copies that file before the tests run, and the secret overrides the empty key.

Set `GEMINI_API_KEY` in `.env` for the support-chat instruction judge. In GitHub Actions the same value belongs in the `GEMINI_API_KEY` secret. `GEMINI_MODEL` is optional and defaults to `gemini-3-flash-preview`. `gemini-3.8-flash` returns a deadline error before it answers.

## Commands

| Command | What it runs |
| --- | --- |
| `npm test` | Every spec, one worker, no lane tag filter |
| `npm run test:all` | Same as `npm test` |
| `npm run test:stateless` | `@stateless` only |
| `npm run test:stateful` | `@stateful` with `--workers=1` |
| `npm run test:boda-assist` | `@boda-assist` with `--workers=1` |
| `npm run test:slow` | `@slow` with `--workers=1` |
| `npm run test:smoke` | `@smoke` with `--workers=1` |
| `npx playwright test -g TC-PLC-02` | One case. Add `--workers=1` if the case resets the sandbox |
| `npm run report` | Open the local HTML report |

The config default is one worker. `npm test` uses the `all` project, so lane tags do not select or skip specs. A bare `npx playwright test` runs every project, including `all`, and repeats tagged specs. Stateless parallelism is opt-in through `npm run test:stateless` and the CI shard jobs.

## Layout

- `src/client` sets auth headers, redacts credentials in failure text, and fails the test on HTTP 500. Expected 4xx responses are returned to the spec. Playwright owns the base URL, the JSON body, and the failure trace.
- `src/controllers` maps one endpoint group each and does not assert.
- `support/fixtures.ts` injects `api`, `actors`, and `controllers`.
- Specs hold the test cases. `data` holds the inputs. Area modules next to a spec hold that spec's readers and setup.
- Specs assert with Playwright `expect` and pass `result.failureMessage` as the message.

Tag each spec with exactly one lane from `lane`: `@stateless`, `@stateful`, `@boda-assist`, or `@slow`. `@smoke` may be added beside a lane. Stateless tests must not reset the sandbox or read wallet or trip state.

## CI

`.github/workflows/playwright.yml` shards only the stateless project (`1/2` and `2/2`). Stateful, boda-assist, and slow jobs share the `twende-sandbox` concurrency group. That group queues pending jobs and runs them one at a time, including across workflow runs that use the same key. Blob reports are merged into one HTML artifact even when a job fails, and the workflow still fails when a test fails. That merge writes the job summary and updates one pull request comment. Retries are off.

## Results

No suite has been executed yet.

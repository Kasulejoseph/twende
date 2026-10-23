import type { APIRequestContext, APIResponse } from '@playwright/test';

import { secretValues, type AppConfig } from '../config/env';
import type { AuthOverride } from '../controllers/auth';
import { internalLeakViolations } from '../helpers/leaks';
import { parseJson, safeJson, truncate } from '../helpers/json';
import { ApiError } from './api-error';

export interface ApiCall {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly body?: unknown;
  readonly rawBody?: string;
  readonly auth?: AuthOverride;
  readonly idempotencyKey?: string;
}

export interface ApiResult {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly body: unknown;
  readonly failureMessage: string;
}

type QueryValue = string | number | boolean;

export class ApiClient {
  private readonly secrets: readonly string[];

  constructor(
    private readonly request: APIRequestContext,
    private readonly config: AppConfig,
  ) {
    this.secrets = secretValues(config);
  }

  async send(call: ApiCall): Promise<ApiResult> {
    if (!call.path.startsWith('/')) {
      throw new Error(`API path must start with /. Received ${call.path}`);
    }

    // Playwright resolves a leading slash from the origin and drops the base path.
    const response = await this.request.fetch(call.path.slice(1), {
      method: call.method,
      headers: this.headersFor(call),
      params: definedQuery(call.query),
      data: requestData(call),
    });
    const body = await readBody(response);
    const result = toResult(call, response, body, this.secrets);
    if (result.status >= 500) {
      throw serverError(result, this.secrets);
    }
    return result;
  }

  private headersFor(call: ApiCall): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const auth = call.auth;

    if (auth?.sendCandidateKey !== false) {
      headers['X-Candidate-Key'] = auth?.candidateKey ?? this.config.candidateKey;
    }

    if (auth?.sendAuthorization !== false && auth?.token !== undefined) {
      headers.Authorization = `Bearer ${auth.token}`;
    }

    if (call.idempotencyKey !== undefined) {
      headers['Idempotency-Key'] = call.idempotencyKey;
    }

    if (call.rawBody !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }
}

const requestData = (call: ApiCall): Buffer | unknown => {
  if (call.rawBody === undefined) {
    return call.body;
  }

  // Playwright re-encodes a string when Content-Type is JSON and the text is not valid JSON.
  return Buffer.from(call.rawBody);
};

const definedQuery = (query: ApiCall['query']): Record<string, QueryValue> | undefined => {
  if (query === undefined) {
    return undefined;
  }

  const entries = Object.entries(query).flatMap((entry): ReadonlyArray<readonly [string, QueryValue]> => {
    const [key, value] = entry;
    if (value === undefined) {
      return [];
    }
    return [[key, value]];
  });

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
};

const readBody = async (response: APIResponse): Promise<unknown> => {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }

  try {
    return parseJson(text);
  } catch {
    return text;
  }
};

const toResult = (call: ApiCall, response: APIResponse, body: unknown, secrets: readonly string[]): ApiResult => {
  const url = response.url();
  const status = response.status();
  return {
    method: call.method,
    url,
    status,
    body,
    failureMessage: `${call.method} ${url} -> ${status}\n${truncate(safeJson(body, secrets))}`,
  };
};

const serverError = (result: ApiResult, secrets: readonly string[]): ApiError => {
  const leaks = internalLeakViolations(result.body, secrets);
  const leakNote = leaks.length > 0 ? ` Leak checks failed: ${leaks.join('; ')}.` : '';
  return new ApiError({
    message: `Server error ${result.status} from ${result.method} ${result.url}.${leakNote}\n${result.failureMessage}`,
    status: result.status,
    method: result.method,
    url: result.url,
    body: result.body,
  });
};

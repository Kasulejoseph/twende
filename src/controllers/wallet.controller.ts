import type { ApiClient, ApiResult } from '../client/api-client';
import type { TopUpRequest } from '../types/api';
import type { AuthOverride } from './auth';

export interface TopUpInput {
  readonly auth?: AuthOverride;
  readonly body?: TopUpRequest;
  readonly rawBody?: string;
  readonly idempotencyKey?: string;
}

export class WalletController {
  constructor(private readonly api: ApiClient) {}

  topUp(input: TopUpInput): Promise<ApiResult> {
    return this.api.send({
      method: 'POST',
      path: '/v1/wallet/top-ups',
      auth: input.auth,
      body: input.body,
      rawBody: input.rawBody,
      idempotencyKey: input.idempotencyKey,
    });
  }

  transactions(auth?: AuthOverride): Promise<ApiResult> {
    return this.api.send({
      method: 'GET',
      path: '/v1/wallet/transactions',
      auth,
    });
  }
}

import type { ApiClient, ApiResult } from '../client/api-client';
import type { FareEstimateRequest } from '../types/api';
import type { AuthOverride } from './auth';

export interface CreateEstimateInput {
  readonly auth?: AuthOverride;
  readonly body?: FareEstimateRequest;
  readonly rawBody?: string;
}

export class EstimatesController {
  constructor(private readonly api: ApiClient) {}

  create(input: CreateEstimateInput): Promise<ApiResult> {
    return this.api.send({
      method: 'POST',
      path: '/v1/fare-estimates',
      auth: input.auth,
      body: input.body,
      rawBody: input.rawBody,
    });
  }
}

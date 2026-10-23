import type { ApiClient, ApiResult } from '../client/api-client';
import type { CreateTripRequest, RatingRequest, TripStatus } from '../types/api';
import type { AuthOverride } from './auth';

export interface CreateTripInput {
  readonly auth?: AuthOverride;
  readonly body?: CreateTripRequest;
  readonly rawBody?: string;
  readonly idempotencyKey?: string;
}

export interface ListTripsInput {
  readonly auth?: AuthOverride;
  readonly status?: TripStatus | string;
  readonly page?: number;
  readonly page_size?: number;
}

export interface CancelTripInput {
  readonly auth?: AuthOverride;
  readonly body?: { readonly reason?: string };
  readonly rawBody?: string;
}

export interface RateTripInput {
  readonly auth?: AuthOverride;
  readonly body?: RatingRequest | { readonly comment?: string };
}

export class TripsController {
  constructor(private readonly api: ApiClient) {}

  create(input: CreateTripInput): Promise<ApiResult> {
    return this.api.send({
      method: 'POST',
      path: '/v1/trips',
      auth: input.auth,
      body: input.body,
      rawBody: input.rawBody,
      idempotencyKey: input.idempotencyKey,
    });
  }

  list(input: ListTripsInput = {}): Promise<ApiResult> {
    return this.api.send({
      method: 'GET',
      path: '/v1/trips',
      auth: input.auth,
      query: {
        status: input.status,
        page: input.page,
        page_size: input.page_size,
      },
    });
  }

  get(tripId: string, auth?: AuthOverride): Promise<ApiResult> {
    return this.api.send({
      method: 'GET',
      path: `/v1/trips/${encodeURIComponent(tripId)}`,
      auth,
    });
  }

  cancel(tripId: string, input: CancelTripInput = {}): Promise<ApiResult> {
    return this.api.send({
      method: 'POST',
      path: `/v1/trips/${encodeURIComponent(tripId)}/cancel`,
      auth: input.auth,
      body: input.body,
      rawBody: input.rawBody,
    });
  }

  rate(tripId: string, input: RateTripInput): Promise<ApiResult> {
    return this.api.send({
      method: 'POST',
      path: `/v1/trips/${encodeURIComponent(tripId)}/rating`,
      auth: input.auth,
      body: input.body,
    });
  }
}

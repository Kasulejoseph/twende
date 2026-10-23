import type { ApiClient, ApiResult } from '../client/api-client';
import type { AuthOverride } from './auth';

export interface ListPlacesInput {
  readonly q?: string;
  readonly auth?: AuthOverride;
}

export class PlacesController {
  constructor(private readonly api: ApiClient) {}

  list(input: ListPlacesInput = {}): Promise<ApiResult> {
    return this.api.send({
      method: 'GET',
      path: '/v1/places',
      query: { q: input.q },
      auth: input.auth,
    });
  }
}

import type { ApiClient, ApiResult } from '../client/api-client';
import type { AuthOverride } from './auth';

export class DriverController {
  constructor(private readonly api: ApiClient) {}

  available(auth?: AuthOverride): Promise<ApiResult> {
    return this.api.send({
      method: 'GET',
      path: '/v1/driver/trips/available',
      auth,
    });
  }

  accept(tripId: string, auth?: AuthOverride): Promise<ApiResult> {
    return this.postAction('accept', tripId, auth);
  }

  arrive(tripId: string, auth?: AuthOverride): Promise<ApiResult> {
    return this.postAction('arrive', tripId, auth);
  }

  start(tripId: string, auth?: AuthOverride): Promise<ApiResult> {
    return this.postAction('start', tripId, auth);
  }

  complete(tripId: string, auth?: AuthOverride): Promise<ApiResult> {
    return this.postAction('complete', tripId, auth);
  }

  private postAction(action: 'accept' | 'arrive' | 'start' | 'complete', tripId: string, auth?: AuthOverride): Promise<ApiResult> {
    return this.api.send({
      method: 'POST',
      path: `/v1/driver/trips/${encodeURIComponent(tripId)}/${action}`,
      auth,
    });
  }
}

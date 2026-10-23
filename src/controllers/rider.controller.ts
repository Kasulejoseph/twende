import type { ApiClient, ApiResult } from '../client/api-client';
import type { AuthOverride } from './auth';

export class RiderController {
  constructor(private readonly api: ApiClient) {}

  me(auth?: AuthOverride): Promise<ApiResult> {
    return this.api.send({
      method: 'GET',
      path: '/v1/me',
      auth,
    });
  }
}

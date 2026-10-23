import type { ApiClient, ApiResult } from '../client/api-client';
import type { AuthOverride } from './auth';

export class SandboxController {
  constructor(private readonly api: ApiClient) {}

  reset(auth?: AuthOverride): Promise<ApiResult> {
    return this.api.send({
      method: 'POST',
      path: '/v1/_reset',
      auth,
    });
  }
}

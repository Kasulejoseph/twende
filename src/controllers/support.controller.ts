import type { ApiClient, ApiResult } from '../client/api-client';
import type { ChatRequest } from '../types/api';
import type { AuthOverride } from './auth';

export interface ChatInput {
  readonly auth?: AuthOverride;
  readonly body?: ChatRequest | { readonly trip_id?: string; readonly conversation_id?: string };
  readonly rawBody?: string;
}

export class SupportController {
  constructor(private readonly api: ApiClient) {}

  chat(input: ChatInput): Promise<ApiResult> {
    return this.api.send({
      method: 'POST',
      path: '/v1/support/chat',
      auth: input.auth,
      body: input.body,
      rawBody: input.rawBody,
    });
  }
}

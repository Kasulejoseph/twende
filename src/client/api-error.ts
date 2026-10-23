export interface ApiErrorDetails {
  readonly message: string;
  readonly status: number;
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly method: string;
  readonly url: string;
  readonly body: unknown;

  constructor(details: ApiErrorDetails) {
    super(details.message);
    this.name = 'ApiError';
    this.status = details.status;
    this.method = details.method;
    this.url = details.url;
    this.body = details.body;
  }
}

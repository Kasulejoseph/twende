export const lane = {
  stateless: '@stateless',
  stateful: '@stateful',
  llm: '@llm',
  slow: '@slow',
  smoke: '@smoke',
  places: '@places',
  negative: '@negative',
  security: '@security',
  billing: '@billing',
  rider: '@rider',
  driver: '@driver',
  wallet: '@wallet',
  topups: '@topups',
  boundary: '@boundary',
  idempotency: '@idempotency',
  concurrency: '@concurrency',
  bug: '@bug',
} as const;

export type Lane = (typeof lane)[keyof typeof lane];

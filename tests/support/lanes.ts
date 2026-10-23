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
} as const;

export type Lane = (typeof lane)[keyof typeof lane];

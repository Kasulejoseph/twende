export const lane = {
  stateless: '@stateless',
  stateful: '@stateful',
  llm: '@llm',
  slow: '@slow',
  smoke: '@smoke',
} as const;

export type Lane = (typeof lane)[keyof typeof lane];

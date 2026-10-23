export interface StarBoundaryCase {
  readonly stars: number;
  readonly expectedStatus: 201 | 422;
}

export const starBoundaryCases: readonly StarBoundaryCase[] = [
  { stars: 0, expectedStatus: 422 },
  { stars: 1, expectedStatus: 201 },
  { stars: 5, expectedStatus: 201 },
  { stars: 6, expectedStatus: 422 },
];

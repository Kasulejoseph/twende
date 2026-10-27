export interface InvalidPagingCase {
  readonly id: string;
  readonly page?: number;
  readonly page_size?: number;
}

export const invalidPagingCases: readonly InvalidPagingCase[] = [
  { id: 'page-zero', page: 0 },
  { id: 'page-negative', page: -1 },
  { id: 'page-size-zero', page_size: 0 },
  { id: 'page-size-over-max', page_size: 51 },
];

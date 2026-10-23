export interface InvalidPhoneCase {
  readonly id: string;
  readonly phone: string;
}

export const invalidPhones: readonly InvalidPhoneCase[] = [
  { id: 'local-format', phone: '0700100231' },
  { id: 'wrong-prefix', phone: '+256800100231' },
  { id: 'too-short', phone: '+25670010023' },
  { id: 'too-long', phone: '+2567001002311' },
  { id: 'empty', phone: '' },
];

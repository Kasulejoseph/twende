import type { ServiceType } from '../src/types/api';

export interface InapplicablePromoCase {
  readonly promo: string;
  readonly service: ServiceType;
}

export const inapplicablePromos: readonly InapplicablePromoCase[] = [
  { promo: 'BODA2000', service: 'car' },
  { promo: 'BODA2000', service: 'send' },
  { promo: 'SENDFREE', service: 'boda' },
];

export const invalidPromoCode = 'NOTREAL';

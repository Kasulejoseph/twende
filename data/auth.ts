import type { AuthOverride } from '../src/controllers/auth';

export interface AuthRow {
  readonly name: string;
  readonly auth: AuthOverride;
}

export const placesKeyRows: readonly AuthRow[] = [
  { name: 'missing key', auth: { sendCandidateKey: false } },
  { name: 'invalid key', auth: { candidateKey: 'invalid' } },
];

export const riderProfileRows = (token: string): readonly AuthRow[] => [
  { name: 'missing key', auth: { token, sendCandidateKey: false } },
  { name: 'invalid token', auth: { token: 'invalid' } },
  { name: 'missing authorization', auth: { sendAuthorization: false } },
];

export const ledgerKeyRows = (token: string): readonly AuthRow[] => [
  { name: 'missing key', auth: { token, sendCandidateKey: false } },
  { name: 'invalid key', auth: { token, candidateKey: 'invalid' } },
];

export interface TopUpAmountCase {
  readonly amount: number;
  readonly expectedStatus: 201 | 422;
  readonly creditsWallet: boolean;
}

export const standardTopUpAmount = 10_000;

export const topUpAmountCases: readonly TopUpAmountCase[] = [
  { amount: 499, expectedStatus: 422, creditsWallet: false },
  { amount: 500, expectedStatus: 201, creditsWallet: true },
  { amount: 2_000_000, expectedStatus: 201, creditsWallet: true },
  { amount: 2_000_001, expectedStatus: 422, creditsWallet: false },
];

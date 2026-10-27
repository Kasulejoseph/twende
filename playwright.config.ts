import path from 'path';

import { defineConfig } from '@playwright/test';

const loadLocalEnv = (): void => {
  try {
    process.loadEnvFile(path.resolve(__dirname, '.env'));
  } catch (error: unknown) {
    if (isMissingEnvFile(error)) {
      return;
    }
    throw error;
  }
};

const isMissingEnvFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

const withTrailingSlash = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim().replace(/\/$/, '') ?? '';
  return trimmed.length === 0 ? undefined : `${trimmed}/`;
};

loadLocalEnv();

const baseURL = withTrailingSlash(process.env.BASE_URL);
const blobName = process.env.PLAYWRIGHT_BLOB_NAME ?? 'local';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // One worker unless a script or CI job overrides it. Stateful tests share one sandbox key.
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI
    ? [['list'], ['blob', { fileName: `report-${blobName}.zip` }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'all',
      fullyParallel: false,
      timeout: 8 * 60 * 1000,
    },
    {
      name: 'stateless',
      grep: /@stateless/,
      fullyParallel: true,
    },
    {
      name: 'stateful',
      grep: /@stateful/,
      fullyParallel: false,
    },
    {
      name: 'boda-assist',
      grep: /@boda-assist/,
      fullyParallel: false,
      timeout: 90_000,
    },
    {
      name: 'slow',
      grep: /@slow/,
      fullyParallel: false,
      timeout: 8 * 60 * 1000,
    },
  ],
});

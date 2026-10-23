import path from 'path';

import { defineConfig } from '@playwright/test';

loadLocalEnv();

const baseURL = process.env.BASE_URL?.trim().replace(/\/$/, '');
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
      name: 'llm',
      grep: /@llm/,
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

function loadLocalEnv(): void {
  try {
    process.loadEnvFile(path.resolve(__dirname, '.env'));
  } catch (error: unknown) {
    if (isMissingEnvFile(error)) {
      return;
    }
    throw error;
  }
}

function isMissingEnvFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

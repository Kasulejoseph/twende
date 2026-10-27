import { test as base, expect } from '@playwright/test';

import { ApiClient } from '../src/client/api-client';
import { getConfig } from '../src/config/env';
import { createControllers, type Controllers } from '../src/controllers';
import type { Actors } from '../src/types/actors';

interface FrameworkFixtures {
  api: ApiClient;
  actors: Actors;
  controllers: Controllers;
}

export const test = base.extend<FrameworkFixtures>({
  api: async ({ request }, use) => {
    await use(new ApiClient(request, getConfig()));
  },
  actors: async ({}, use) => {
    await use(getConfig().actors);
  },
  controllers: async ({ api }, use) => {
    await use(createControllers(api));
  },
});

export const resetTest = test.extend<{ resetSandbox: void }>({
  resetSandbox: [async ({ controllers }, use): Promise<void> => {
    const reset = await controllers.sandbox.reset();
    expect(reset.status, reset.failureMessage).toBe(200);
    await use();
  }, { auto: true }],
});

export { expect };
export { lane } from './lanes';

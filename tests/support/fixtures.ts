import { test as base, expect } from '@playwright/test';

import { ApiClient } from '../../src/client/api-client';
import { getConfig } from '../../src/config/env';
import { createControllers, type Controllers } from '../../src/controllers';
import type { Actors } from '../../src/types/actors';
import { TripLifecycle } from '../../src/workflows/trip-lifecycle';

interface FrameworkFixtures {
  api: ApiClient;
  actors: Actors;
  controllers: Controllers;
  lifecycle: TripLifecycle;
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
  lifecycle: async ({ controllers }, use) => {
    await use(new TripLifecycle(controllers));
  },
});

export { expect };
export { lane } from './lanes';

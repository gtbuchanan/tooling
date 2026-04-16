import { beforeEach } from 'vitest';

// eslint-disable-next-line vitest/no-hooks -- Global hook without shared state
beforeEach(({ expect }) => {
  // Using local expect ensures concurrent tests don't interfere with each other
  // eslint-disable-next-line vitest/no-standalone-expect -- Intentionally outside test
  expect.hasAssertions();
});

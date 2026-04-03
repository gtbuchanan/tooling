import { beforeEach } from 'vitest';

// oxlint-disable-next-line vitest/no-hooks -- Global hook without shared state
beforeEach(({ expect }) => {
  // Using local expect ensures concurrent tests don't interfere with each other
  // oxlint-disable-next-line vitest/no-standalone-expect -- Intentionally outside test
  expect.hasAssertions();
});

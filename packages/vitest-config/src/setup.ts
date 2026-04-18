import { beforeEach } from 'vitest';

beforeEach(({ expect }) => {
  // Using local expect ensures concurrent tests don't interfere with each other
  expect.hasAssertions();
});

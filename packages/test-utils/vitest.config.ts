import { configurePackage } from '../vitest-config/src/configure.ts';

/*
 * The `runCommand` tests spawn real child processes: ~170ms each when the
 * suite runs alone, past vitest's 5s default once the rest of `pnpm check`
 * is competing for the same cores. See `eslint-config/vitest.config.ts` for
 * why the bound moves rather than the concurrency, and what that trades away.
 */
export default configurePackage({ testTimeout: 20_000 });

import { configurePackage } from '@gtbuchanan/vitest-config/configure';

/*
 * Each test builds a real ESLint config and lints with it, loading the whole
 * bundled plugin set and starting a TypeScript project service. Alone that is
 * ~0.7s at worst; under a full `pnpm check` — turbo across packages, vitest
 * across files, `concurrent` tests within a file — it lands past vitest's 5s
 * default, so the suite passes in isolation and times out under load.
 *
 * Raise the bound rather than cap concurrency: capping `maxConcurrency`
 * measured no faster, since the suite is dominated by module loading rather
 * than test execution. The higher bound is not free — it is a duration limit,
 * so a genuine regression now has further to travel before it trips. It buys
 * reliability, because a wall-clock limit can't separate a slower test from a
 * busier machine, and at this contention the tight default reported load.
 */
export default configurePackage({ testTimeout: 20_000 });

import { configurePackage } from '../vitest-config/src/configure.ts';

/*
 * Each test lints through a real ESLint instance, which times out under a full
 * `pnpm check`. See "Vitest usage specifics" in AGENTS.md.
 */
export default configurePackage({ testTimeout: 20_000 });

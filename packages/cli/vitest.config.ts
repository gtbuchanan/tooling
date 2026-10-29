import { configurePackage } from '@gtbuchanan/vitest-config/configure';

/*
 * Many tests build workspace fixtures on disk and run sync or task generation
 * over them, which times out under a full `pnpm check`. See "Vitest usage
 * specifics" in AGENTS.md.
 */
export default configurePackage({ testTimeout: 20_000 });

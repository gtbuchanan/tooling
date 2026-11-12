import type { WorkspaceDiscovery } from '#src/core/discovery.js';

/**
 * One mise task, as the generated fragment writes it.
 */
export interface MiseTask {
  readonly description: string;
  readonly run: string;
}

/*
 * mise tasks run outside pnpm, so `node_modules/.bin` is not on PATH and a
 * bare `gtb` won't resolve the way it does in package.json scripts. Resolve
 * gtb per repo shape:
 *   - self-hosted: the `pnpm run gtb` script shim (source, no build needed)
 *   - depends on `@gtbuchanan/cli`: `pnpm exec` finds it in node_modules
 *   - neither (hk-only adopter): bare `gtb` from mise's npm: backend, so no
 *     node_modules/pnpm project is needed — add `npm:@gtbuchanan/cli` to [tools]
 */
const miseTaskPrefix = (
  discovery: Pick<WorkspaceDiscovery, 'dependsOnCli' | 'isSelfHosted'>,
): string => {
  if (discovery.isSelfHosted) {
    return 'pnpm run gtb';
  }

  return discovery.dependsOnCli ? 'pnpm exec gtb' : 'gtb';
};

/**
 * The `hk:all` / `hk:base` mise tasks, keyed by task name, which the mise
 * toolchain writes into its conf.d fragment.
 */
export const hkMiseTasks = (
  discovery: Pick<WorkspaceDiscovery, 'dependsOnCli' | 'isSelfHosted'>,
): Readonly<Record<string, MiseTask>> => {
  const gtb = miseTaskPrefix(discovery);
  return {
    'hk:all': {
      description: 'Run hk across all files (fixes locally, checks in CI)',
      run: `${gtb} hk all`,
    },
    'hk:base': {
      description: 'Run hk on files changed from a base ref (fixes locally, checks in CI)',
      run: `${gtb} hk base`,
    },
  };
};

import type { WorkspaceDiscovery } from '#src/core/discovery.js';

/**
 * One key of a mise config table, with the comment lines the generated file
 * explains it with.
 */
export interface MiseEntry {
  readonly comment: readonly string[];
  readonly key: string;
  readonly value: boolean | string | readonly string[];
}

/**
 * One mise task, as the generated fragment writes it.
 */
export interface MiseTask {
  readonly description: string;
  readonly run: string;
}

/**
 * What the hk toolchain adds to gtb's mise fragment.
 */
export interface HkMiseConfig {
  readonly env: readonly MiseEntry[];
  readonly hooks: readonly MiseEntry[];
  readonly tasks: Readonly<Record<string, MiseTask>>;
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
 * What hk needs from mise, or `undefined` in a repo with no hk config, where
 * none of it would do anything.
 *
 * The install runs as a project `postinstall` hook rather than hk's own
 * tool-level one: `hk install` writes each clone's git config, and a
 * tool-level hook runs only when mise installs hk, once per machine.
 */
export const hkMiseConfig = (
  discovery: Pick<WorkspaceDiscovery, 'dependsOnCli' | 'hkFiles' | 'isSelfHosted'>,
): HkMiseConfig | undefined => {
  if (discovery.hkFiles.length === 0) {
    return undefined;
  }

  const gtb = miseTaskPrefix(discovery);
  return {
    env: [{
      comment: [
        'Has hk wrap each hook step in `mise x`, so the tools [tools] pins resolve',
        'without shell activation.',
      ],
      key: 'HK_MISE',
      value: '1',
    }],
    hooks: [{
      comment: [
        'Runs on every `mise install`, one with nothing to install included, so',
        'each new clone or worktree gets the git hooks.',
      ],
      key: 'postinstall',
      value: 'hk install --mise',
    }],
    tasks: {
      'hk:all': {
        description: 'Run hk across all files (fixes locally, checks in CI)',
        run: `${gtb} hk all`,
      },
      'hk:base': {
        description: 'Run hk on files changed from a base ref (fixes locally, checks in CI)',
        run: `${gtb} hk base`,
      },
    },
  };
};

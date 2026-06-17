import { defineCommand } from 'citty';
import { type RunOptions, run } from '../../lib/process.ts';
import { rootNames } from './names.ts';
import { type RunSyncOptions, runSync } from './sync.ts';

/** Injected side effects for {@link executeVersion}. */
export interface VersionDeps {
  readonly run: (command: string, options?: RunOptions) => Promise<void>;
  readonly sync: (options: RunSyncOptions) => void;
}

/**
 * Applies `changeset version`, then regenerates native manifests via the
 * `manifest` sync scope, so both land in the same changesets version
 * commit/PR. The sync no-ops when the workspace ships no non-npm packages, so
 * this is safe to run unconditionally. Sequenced inside one command because
 * changesets/action runs its `version` input without a shell — a `&&` chain in
 * the workflow gets passed to changesets as bogus positional args ("Too many
 * arguments passed to changesets"), so the chaining has to live here.
 */
export const executeVersion = async ({
  run: runCommand,
  sync,
}: VersionDeps): Promise<void> => {
  await runCommand('pnpm', { args: ['exec', 'changeset', 'version'] });
  sync({ scopes: new Set(['manifest']) });
};

/**
 * `gtb version` — CD's changesets version command: `changeset version`
 * followed by a `manifest`-scoped sync so any regenerated native manifests
 * land in the same version commit/PR. The manifest sync is a no-op for
 * plain-npm workspaces, so CD runs this unconditionally.
 */
export const version = defineCommand({
  meta: {
    description: 'Apply changesets version, then sync native manifests',
    name: rootNames.version,
  },
  run: () => executeVersion({ run, sync: runSync }),
});

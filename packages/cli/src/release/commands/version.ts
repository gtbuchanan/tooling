import { defineCommand } from 'citty';
import { type RunSyncOptions, runSync } from '#src/codegen/commands/sync.js';
import { rootNames } from '#src/core/command-names.js';
import { type RunOptions, run } from '#src/core/process.js';

/**
 * Injected side effects for {@link executeVersion}.
 */
export interface VersionDeps {
  readonly run: (command: string, options?: RunOptions) => Promise<void>;
  readonly sync: (options: RunSyncOptions) => void;
}

/**
 * Applies `changeset version`, then a full sync, so the version-stamped files
 * it regenerates (a `PklProject` today) land in the same changesets version
 * commit/PR. Every other step rewrites what a drift-free `main` already holds,
 * so the sync needs no list of which steps follow the version. Sequenced
 * inside one command because
 * changesets/action runs its `version-script` input without a shell — a `&&`
 * chain in the workflow gets passed to changesets as bogus positional args
 * ("Too many arguments passed to changesets"), so the chaining has to live
 * here.
 *
 * Finally runs `hk fix` over the unstaged files, which are exactly what the
 * first two steps wrote. The changesets changelog generator indents every
 * continuation line of a summary, blank ones included, and `changeset version`
 * formats the result only when it detects a root-installed formatter, so
 * without this a multi-paragraph changeset fails the release PR's own
 * pre-commit check. An unfixable finding fails here instead, in the run that
 * caused it.
 */
export const executeVersion = async ({
  run: runCommand,
  sync,
}: VersionDeps): Promise<void> => {
  await runCommand('pnpm', { args: ['exec', 'changeset', 'version'] });
  sync({});
  await runCommand('hk', { args: ['fix', '--unstaged'] });
};

/**
 * `gtb version` — CD's changesets version command: `changeset version`
 * followed by a full sync so any version-stamped files land in the same
 * version commit/PR, then `hk fix` over what both wrote.
 */
export const version = defineCommand({
  meta: {
    description: 'Apply changesets version, sync, then hk fix',
    name: rootNames.version,
  },
  run: () => executeVersion({ run, sync: runSync }),
});

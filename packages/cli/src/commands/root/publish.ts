import { defineCommand } from 'citty';
import { createLogger } from '../../lib/logger.ts';
import { executePublishPkl } from '../../lib/pkl-release.ts';
import { type RunOptions, capture, run } from '../../lib/process.ts';
import { rootNames } from './names.ts';

/** Injected side effects for {@link executePublish}. */
export interface PublishDeps {
  readonly publishNonNpm: () => Promise<void>;
  readonly run: (command: string, options?: RunOptions) => Promise<void>;
}

/**
 * Publishes every package for the current release: `changeset publish` to the
 * npm registry first (honoring the ambient OIDC trusted-publishing and
 * provenance env that CD sets on the step), then each non-npm channel. Both
 * halves are idempotent — `changeset publish` skips versions already on the
 * registry, and the non-npm channels no-op when the workspace ships no such
 * package — so CD runs this unconditionally.
 */
export const executePublish = async ({
  publishNonNpm,
  run: runCommand,
}: PublishDeps): Promise<void> => {
  await runCommand('pnpm', { args: ['exec', 'changeset', 'publish'] });
  await publishNonNpm();
};

/**
 * `gtb publish` — publishes all packages for the current release: npm via
 * changesets, then every non-npm channel. Channel dispatch for the latter
 * lives in {@link executePublishPkl} (today the Pkl GitHub-release channel; a
 * future channel adds its own `executePublish*`).
 */
export const publish = defineCommand({
  meta: {
    description: 'Publish all packages for the current release (idempotent)',
    name: rootNames.publish,
  },
  run: () =>
    executePublish({
      publishNonNpm: () =>
        executePublishPkl({ capture, cwd: process.cwd(), logger: createLogger(), run }),
      run,
    }),
});

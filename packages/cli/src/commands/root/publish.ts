import { defineCommand } from 'citty';
import { createLogger } from '../../lib/logger.ts';
import { executePublishNpmReleases } from '../../lib/npm-release.ts';
import { executePublishPkl } from '../../lib/pkl-release.ts';
import { type RunOptions, execute, run } from '../../lib/process.ts';
import { rootNames } from './names.ts';

/**
 * Injected side effects for {@link executePublish}.
 */
export interface PublishDeps {
  readonly publishNonNpm: () => Promise<void>;
  readonly releaseNpm: () => Promise<void>;
  readonly run: (command: string, options?: RunOptions) => Promise<void>;
}

/**
 * Publishes every package for the current release: `changeset publish` to the
 * npm registry first (honoring the ambient OIDC trusted-publishing and
 * provenance env that CD sets on the step), then the GitHub releases for the
 * packages it published (which land the release tags — `changeset publish`
 * only creates tags in the local clone), then each non-npm channel. Every
 * step is idempotent — `changeset publish` skips versions already on the
 * registry, and both release channels skip tags that already have a release —
 * so CD runs this unconditionally and a local re-run resumes where a partial
 * failure left off.
 *
 * The channels ship to unrelated destinations, so a failing one must not
 * strand the others: each runs, and their failures surface together at the
 * end. `changeset publish` is the exception — it is the source of the versions
 * the channels release, so nothing follows a failure there.
 */
export const executePublish = async ({
  publishNonNpm,
  releaseNpm,
  run: runCommand,
}: PublishDeps): Promise<void> => {
  await runCommand('pnpm', { args: ['exec', 'changeset', 'publish'] });
  const failures: unknown[] = [];
  for (const channel of [releaseNpm, publishNonNpm]) {
    try {
      await channel();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'one or more release channels failed');
  }
};

/**
 * `gtb publish` — publishes all packages for the current release: npm via
 * changesets (plus per-package GitHub releases/tags), then every non-npm
 * channel. Channel dispatch for the latter lives in {@link executePublishPkl}
 * (today the Pkl GitHub-release channel; a future channel adds its own
 * `executePublish*`).
 */
export const publish = defineCommand({
  meta: {
    description: 'Publish all packages for the current release (idempotent)',
    name: rootNames.publish,
  },
  run: () => {
    const deps = { cwd: process.cwd(), execute, logger: createLogger() };

    return executePublish({
      publishNonNpm: () => executePublishPkl(deps),
      releaseNpm: () => executePublishNpmReleases(deps),
      run,
    });
  },
});

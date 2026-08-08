import { defineCommand } from 'citty';
import { createLogger } from '../../lib/logger.ts';
import { executePublishNpmReleases } from '../../lib/npm-release.ts';
import { executePublishPkl } from '../../lib/pkl-release.ts';
import { type RunOptions, capture, run } from '../../lib/process.ts';
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
 */
export const executePublish = async ({
  publishNonNpm,
  releaseNpm,
  run: runCommand,
}: PublishDeps): Promise<void> => {
  await runCommand('pnpm', { args: ['exec', 'changeset', 'publish'] });
  await releaseNpm();
  await publishNonNpm();
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
    const deps = { capture, cwd: process.cwd(), logger: createLogger(), run };

    return executePublish({
      publishNonNpm: () => executePublishPkl(deps),
      releaseNpm: () => executePublishNpmReleases(deps),
      run,
    });
  },
});

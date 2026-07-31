import { discoverWorkspace } from './discovery.ts';
import {
  type GithubReleaseDeps,
  createGithubRelease,
  releaseExists,
  releaseNotes,
  releaseTag,
  resolveHeadSha,
} from './github-release.ts';
import { readParsedManifest } from './workspace.ts';

/**
 * Creates a GitHub release for every published npm package's current version,
 * idempotently: a tag that already has a release is skipped, so re-running on
 * an unchanged version is a no-op. `changeset publish` creates its release
 * tags only in the local clone and changesets/action (which would push them)
 * is not part of this pipeline — creating the release through the API lands
 * the tag on GitHub without a git push, mirroring the Pkl channel and keeping
 * the whole release reproducible from a local `gtb publish`. No assets: the
 * npm registry hosts the artifact; the release is the tag + notes.
 */
export const executePublishNpmReleases = async (deps: GithubReleaseDeps): Promise<void> => {
  const discovery = discoverWorkspace({ cwd: deps.cwd });
  const packages = discovery.packages.filter(pkg => pkg.isPublished);
  if (packages.length === 0) {
    deps.logger.info('no published npm packages to release');

    return;
  }

  const target = await resolveHeadSha(deps);
  for (const pkg of packages) {
    const { name, version } = readParsedManifest(pkg.dir);
    if (name === undefined || version === undefined) {
      throw new Error(`${pkg.dir}: package.json is missing name or version`);
    }
    const tag = releaseTag(name, version, discovery.isMonorepo);
    if (await releaseExists(deps, tag)) {
      deps.logger.info(`release ${tag} already exists — skipping`);
      continue;
    }
    await createGithubRelease(deps, {
      notes: releaseNotes(pkg.dir, version) ?? tag,
      tag,
      target,
    });
    deps.logger.info(`created release ${tag}`);
  }
};

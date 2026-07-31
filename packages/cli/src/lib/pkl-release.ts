import { readFileSync } from 'node:fs';
import path from 'node:path';
import { discoverWorkspace } from './discovery.ts';
import {
  type GithubReleaseDeps,
  createGithubRelease,
  releaseExists,
  releaseNotes,
  releaseTag,
  resolveHeadSha,
} from './github-release.ts';
import { readPackageName, readPackageVersion } from './pkl-project.ts';

/** Output directory for the packaged Pkl artifacts (mirrors pack:npm). */
export const pklPackDestination = path.join('dist', 'packages', 'pkl');

/**
 * A planned GitHub release for one Pkl package. `tag` mirrors changesets'
 * convention (plain `v<version>` for a single-package repo, unscoped
 * `<name>@<version>` for a monorepo member); the assets are the `pkl project
 * package` output (metadata, zip, and their sha256s), basenamed
 * `<name>@<version>` regardless of repo shape.
 */
export interface PklRelease {
  readonly assets: readonly string[];
  readonly tag: string;
}

/**
 * Derives the release tag + asset paths from the package's own identity
 * (`name`/`version` read from its `PklProject` by the caller). The asset
 * basename `<name>@<version>` matches the filenames `pkl project package`
 * emits — both derive from `PklProject` — so the upload targets the real
 * artifacts.
 */
export const planPklRelease = (
  pkgDir: string,
  name: string,
  version: string,
  isMonorepo: boolean,
): PklRelease => {
  const base = `${name}@${version}`;
  const assetDir = path.join(pkgDir, pklPackDestination);

  // The four files `pkl project package` emits: metadata + its sha256, and the
  // zip + its sha256. The metadata sha256 lets consumers pin `::sha256:`.
  return {
    assets: [base, `${base}.sha256`, `${base}.zip`, `${base}.zip.sha256`].map(file =>
      path.join(assetDir, file),
    ),
    tag: releaseTag(name, version, isMonorepo),
  };
};

/**
 * Publishes every Pkl package in the workspace to a GitHub release,
 * idempotently: a tag that already has a release is skipped, so re-running on
 * an unchanged version is a no-op. Designed to run in CD after `pack` has
 * produced the assets.
 */
export const executePublishPkl = async (deps: GithubReleaseDeps): Promise<void> => {
  const discovery = discoverWorkspace({ cwd: deps.cwd });
  const packages = discovery.packages.filter(pkg => pkg.hasPklPackage);
  if (packages.length === 0) {
    deps.logger.info('no Pkl packages to publish');

    return;
  }

  const target = await resolveHeadSha(deps);
  for (const pkg of packages) {
    const source = readFileSync(path.join(pkg.dir, 'PklProject'), 'utf8');
    const name = readPackageName(source);
    const version = readPackageVersion(source);
    if (name === undefined || version === undefined) {
      throw new Error(`${pkg.dir}: PklProject is missing package.name or package.version`);
    }
    const { assets, tag } = planPklRelease(pkg.dir, name, version, discovery.isMonorepo);
    if (await releaseExists(deps, tag)) {
      deps.logger.info(`release ${tag} already exists — skipping`);
      continue;
    }
    await createGithubRelease(deps, {
      assets,
      notes: releaseNotes(pkg.dir, version) ?? tag,
      tag,
      target,
    });
    deps.logger.info(`created release ${tag}`);
  }
};

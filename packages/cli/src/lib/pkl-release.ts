import { readFileSync } from 'node:fs';
import path from 'node:path';
import { discoverWorkspace } from './discovery.ts';
import type { Logger } from './logger.ts';
import { pklReleaseTag } from './manifest-sync.ts';
import { readPackageName, readPackageVersion } from './pkl-project.ts';
import type { RunOptions } from './process.ts';

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
    tag: pklReleaseTag(name, version, isMonorepo),
  };
};

/**
 * Extracts a version's section from CHANGELOG.md content — the `## <version>`
 * heading's body up to the next `## ` (or EOF) — so the GitHub release notes
 * match what changesets writes for npm packages. Returns undefined when the
 * section is absent or empty.
 */
export const extractChangelogNotes = (
  changelog: string,
  version: string,
): string | undefined => {
  const lines = changelog.split('\n');
  const start = lines.findIndex(line => line.trim() === `## ${version}`);
  if (start === -1) {
    return undefined;
  }
  const after = lines.slice(start + 1);
  const end = after.findIndex(line => line.startsWith('## '));
  const section = (end === -1 ? after : after.slice(0, end)).join('\n').trim();

  return section === '' ? undefined : section;
};

/** Reads the CHANGELOG.md section for the version, if any. */
const releaseNotes = (pkgDir: string, version: string | undefined): string | undefined => {
  if (version === undefined) {
    return undefined;
  }
  try {
    return extractChangelogNotes(readFileSync(path.join(pkgDir, 'CHANGELOG.md'), 'utf8'), version);
  } catch {
    return undefined;
  }
};

/**
 * Side-effecting I/O the publisher depends on. Injected so the orchestration
 * (discover packages, skip-if-exists, create) is unit-testable without
 * spawning gh; the citty wrapper wires the real implementations.
 */
export interface PklReleaseDeps {
  readonly capture: (command: string, args: readonly string[]) => Promise<string>;
  readonly cwd: string;
  readonly logger: Logger;
  readonly run: (command: string, options?: RunOptions) => Promise<void>;
}

/** True when a release already exists for the tag (`gh release view` exits 0). */
const releaseExists = async (deps: PklReleaseDeps, tag: string): Promise<boolean> => {
  try {
    await deps.capture('gh', ['release', 'view', tag]);

    return true;
  } catch {
    return false;
  }
};

/**
 * Publishes every Pkl package in the workspace to a GitHub release,
 * idempotently: a tag that already has a release is skipped, so re-running on
 * an unchanged version is a no-op. Designed to run in CD after `pack` has
 * produced the assets.
 */
export const executePublishPkl = async (deps: PklReleaseDeps): Promise<void> => {
  const discovery = discoverWorkspace({ cwd: deps.cwd });
  const packages = discovery.packages.filter(pkg => pkg.hasPklPackage);
  if (packages.length === 0) {
    deps.logger.info('no Pkl packages to publish');

    return;
  }

  for (const pkg of packages) {
    const source = readFileSync(path.join(pkg.dir, 'PklProject'), 'utf8');
    const name = readPackageName(source) ?? path.basename(pkg.dir);
    const version = readPackageVersion(source) ?? '0.0.0';
    const { assets, tag } = planPklRelease(pkg.dir, name, version, discovery.isMonorepo);
    if (await releaseExists(deps, tag)) {
      deps.logger.info(`release ${tag} already exists — skipping`);
      continue;
    }
    // Mirror changesets' release shape: title = tag, body = the changelog
    // section (falling back to the tag when there's no entry).
    const notes = releaseNotes(pkg.dir, version) ?? tag;
    await deps.run('gh', {
      args: ['release', 'create', tag, '--title', tag, '--notes', notes, ...assets],
    });
    deps.logger.info(`created release ${tag}`);
  }
};

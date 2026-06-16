import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import hostedGitInfo from 'hosted-git-info';
import * as v from 'valibot';
import type { PackageCapabilities, WorkspaceDiscovery } from './discovery.ts';
import { RootManifestSchema } from './manifest.ts';
import { patchPackageBlock } from './pkl-project.ts';
import { readManifest, readParsedManifest } from './workspace.ts';

/**
 * A native package manifest derived from `package.json` — the generic seam
 * for non-npm published packages whose toolchain has its own descriptor
 * (Pkl `PklProject` today; a .NET `.csproj` would slot in the same way).
 * The changeset-managed `package.json` `version` is the single source of
 * truth; `gtb sync` stamps it into each native manifest so the two never
 * drift, and `gtb verify` asserts it.
 */
export interface ManifestFile {
  /** Rendered file content (compared verbatim by verify). */
  readonly content: string;
  /** Absolute path of the manifest file. */
  readonly filePath: string;
}

/** Cross-package context shared by every writer. */
export interface ManifestContext {
  /** Workspace is a monorepo (vs a single root package). */
  readonly isMonorepo: boolean;
  /** Repo URL minus scheme, e.g. `github.com/gtbuchanan/tooling`. */
  readonly repoPath: string;
}

/**
 * Release tag for a Pkl package, mirroring changesets' convention: plain
 * `v<version>` for a single-package (root) repo, `<name>@<version>` for a
 * monorepo member (where the name disambiguates). The asset basename stays
 * `<name>@<version>` either way — pkl derives it from `PklProject`.
 */
export const pklReleaseTag = (
  name: string,
  version: string,
  isMonorepo: boolean,
): string => (isMonorepo ? `${name}@${version}` : `v${version}`);

/**
 * Renders the native manifest for one package "kind". `render` may read the
 * existing file and patch it (e.g. a `.csproj`), but the Pkl writer fully
 * generates a do-not-edit `PklProject`.
 */
export interface ManifestWriter {
  /** True when this writer applies to the package. */
  readonly detect: (pkg: PackageCapabilities) => boolean;
  /** Discriminator for the kind (e.g. `pkl`). */
  readonly kind: string;
  /** Produces the manifest file for the package. */
  readonly render: (pkg: PackageCapabilities, ctx: ManifestContext) => ManifestFile;
}

/** Strips an npm scope: `@gtbuchanan/hk-config` → `hk-config`. */
export const unscopedName = (name: string): string =>
  name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name;

/**
 * Pkl writer — patches an author-owned `PklProject` rather than generating it,
 * since the file legitimately holds author content (`dependencies`,
 * `evaluatorSettings`, package metadata). Sync owns only the three
 * version-derived fields in the `package {}` block (see {@link
 * patchPackageBlock}); `name` and everything else are preserved verbatim.
 * `baseUri` and `packageZipUrl` are written as `\(name)` and
 * `\(name)@\(version)` interpolations respectively — byte-stable, so only the
 * `version` literal changes across releases. A publishable package without a
 * `package {}` block is an error — sync stamps, it does not author.
 */
const pklWriter: ManifestWriter = {
  detect: pkg => pkg.hasPklPackage,
  kind: 'pkl',
  render: (pkg, ctx) => {
    const filePath = path.join(pkg.dir, 'PklProject');
    const { version } = readParsedManifest(pkg.dir);
    if (version === undefined) {
      throw new Error(
        `${path.join(pkg.dir, 'package.json')}: missing "version" for manifest sync`,
      );
    }
    const content = patchPackageBlock(readFileSync(filePath, 'utf8'), {
      isMonorepo: ctx.isMonorepo,
      repoPath: ctx.repoPath,
      version,
    });

    return { content, filePath };
  },
};

/** Registered manifest writers (one per package kind). */
const manifestWriters: readonly ManifestWriter[] = [pklWriter];

/**
 * Resolves the scheme-less repo path (`host/owner/repo`) from the root
 * manifest, parsing the URL with `hosted-git-info` so every Git URL form
 * (https, git+ssh, scp-style `git@`, …) normalizes the same way.
 */
const resolveRepoPath = (rootDir: string): string => {
  const root = v.parse(RootManifestSchema, readManifest(rootDir));
  const info = hostedGitInfo.fromUrl(root.homepage ?? '') ??
    hostedGitInfo.fromUrl(root.repository?.url ?? '');
  if (info === undefined) {
    throw new Error(
      `${path.join(rootDir, 'package.json')}: set homepage or repository.url for manifest sync`,
    );
  }

  return `${info.domain}/${info.user}/${info.project}`;
};

/** Generates every native manifest the workspace's packages require. */
export const generateManifests = (
  discovery: WorkspaceDiscovery,
): readonly ManifestFile[] => {
  const matches = discovery.packages.flatMap(pkg =>
    manifestWriters.filter(writer => writer.detect(pkg)).map(writer => ({ pkg, writer })),
  );
  // Resolve repoPath (and enforce its presence) only when a package actually
  // needs a manifest — a repo with no native package doesn't require homepage.
  if (matches.length === 0) {
    return [];
  }

  const ctx: ManifestContext = {
    isMonorepo: discovery.isMonorepo,
    repoPath: resolveRepoPath(discovery.rootDir),
  };

  return matches.map(({ pkg, writer }) => writer.render(pkg, ctx));
};

/**
 * Drift check for `gtb verify`: each generated manifest must exist and match
 * verbatim (the files are fully owned by sync). Returns drift messages.
 */
export const checkManifests = (
  discovery: WorkspaceDiscovery,
): readonly string[] =>
  generateManifests(discovery).flatMap(({ content, filePath }) => {
    if (!existsSync(filePath)) {
      return [`${filePath}: missing (run gtb sync)`];
    }

    return readFileSync(filePath, 'utf8') === content
      ? []
      : [`${filePath}: out of date (run gtb sync manifest)`];
  });

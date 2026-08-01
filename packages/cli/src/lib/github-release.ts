import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Logger } from './logger.ts';
import type { RunOptions } from './process.ts';

/**
 * Side-effecting I/O the GitHub-release channels depend on. Injected so the
 * orchestration (discover packages, skip-if-exists, create) is unit-testable
 * without spawning gh; the citty wrapper wires the real implementations.
 */
export interface GithubReleaseDeps {
  readonly capture: (command: string, args: readonly string[]) => Promise<string>;
  readonly cwd: string;
  readonly logger: Logger;
  readonly run: (command: string, options?: RunOptions) => Promise<void>;
}

/**
 * Release tag following changesets' own convention by repo shape: plain
 * `v<version>` for a single-package (root) repo, `<name>@<version>` for a
 * monorepo member (where the name disambiguates).
 */
export const releaseTag = (
  name: string,
  version: string,
  isMonorepo: boolean,
): string => (isMonorepo ? `${name}@${version}` : `v${version}`);

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
export const releaseNotes = (
  pkgDir: string,
  version: string | undefined,
): string | undefined => {
  if (version === undefined) {
    return undefined;
  }
  try {
    return extractChangelogNotes(readFileSync(path.join(pkgDir, 'CHANGELOG.md'), 'utf8'), version);
  } catch {
    return undefined;
  }
};

/** True when a release already exists for the tag (`gh release view` exits 0). */
export const releaseExists = async (
  deps: GithubReleaseDeps,
  tag: string,
): Promise<boolean> => {
  try {
    await deps.capture('gh', ['release', 'view', tag]);

    return true;
  } catch {
    return false;
  }
};

/**
 * Resolves the commit a new release's tag should point at: the local HEAD.
 * Passing it explicitly (`--target`) matters for reproducibility — without
 * it, gh targets the *remote default branch* HEAD, which is only coincidentally
 * right when publishing from a fresh CI checkout and silently wrong for a
 * local re-run on an older commit.
 */
export const resolveHeadSha = async (deps: GithubReleaseDeps): Promise<string> => {
  const sha = await deps.capture('git', ['rev-parse', 'HEAD']);

  return sha.trim();
};

/** A planned GitHub release: one tag, its notes, and any uploadable assets. */
export interface GithubReleasePlan {
  readonly assets?: readonly string[];
  readonly notes: string;
  readonly tag: string;
  readonly target: string;
}

/**
 * Creates the release via gh, which also creates the tag server-side at
 * `target` — no git push needed, keeping the whole flow reproducible from a
 * local `gtb publish`. Mirrors changesets' release shape: title = tag, body =
 * the changelog section.
 */
export const createGithubRelease = (
  deps: GithubReleaseDeps,
  plan: GithubReleasePlan,
): Promise<void> =>
  deps.run('gh', {
    args: [
      'release', 'create', plan.tag,
      '--target', plan.target,
      '--title', plan.tag,
      '--notes', plan.notes,
      ...(plan.assets ?? []),
    ],
  });

/**
 * A package pending release: its resolved identity (validated by the channel,
 * which knows its own manifest format) plus any uploadable assets.
 */
export interface PendingRelease {
  readonly assets?: readonly string[];
  readonly dir: string;
  readonly name: string;
  readonly version: string;
}

/**
 * Creates a GitHub release for each pending package, idempotently: a tag that
 * already has a release is skipped, so re-running on an unchanged version is
 * a no-op (and a run that died between channels backfills on the next). The
 * shared loop for every release channel — tag convention, changelog notes,
 * skip-if-exists, HEAD targeting — so channels can't drift apart.
 */
export const publishReleases = async (
  deps: GithubReleaseDeps,
  packages: readonly PendingRelease[],
  isMonorepo: boolean,
): Promise<void> => {
  const target = await resolveHeadSha(deps);
  for (const { assets, dir, name, version } of packages) {
    const tag = releaseTag(name, version, isMonorepo);
    if (await releaseExists(deps, tag)) {
      deps.logger.info(`release ${tag} already exists — skipping`);
      continue;
    }
    await createGithubRelease(deps, {
      ...(assets !== undefined && { assets }),
      notes: releaseNotes(dir, version) ?? tag,
      tag,
      target,
    });
    deps.logger.info(`created release ${tag}`);
  }
};

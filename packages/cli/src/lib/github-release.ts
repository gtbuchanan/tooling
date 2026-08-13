import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import type { Logger } from './logger.ts';
import type { ExecResult } from './process.ts';

/**
 * Side-effecting I/O the GitHub-release channels depend on. Injected so the
 * orchestration (discover packages, skip-if-exists, create) is unit-testable
 * without spawning gh; the citty wrapper wires the real implementations.
 * Commands go through `execute` rather than `run`/`capture` because every
 * decision here turns on *how* gh failed, not merely that it did.
 */
export interface GithubReleaseDeps {
  readonly cwd: string;
  readonly execute: (command: string, args: readonly string[]) => Promise<ExecResult>;
  readonly logger: Logger;
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

/**
 * Reads the CHANGELOG.md section for the version, if any.
 */
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

const ReleaseListSchema = v.array(v.object({ tagName: v.string() }));

/*
 * Well above any plausible release count for one repo — high enough that the
 * listing is effectively complete, and a repo that does outgrow it degrades
 * safely: an unlisted tag is merely attempted, and `createGithubRelease`
 * recognizes the resulting "already exists" as released.
 */
const releaseListLimit = '1000';

/**
 * Every tag that already has a release, read in a single call. One listing
 * beats a `gh release view` per package on both cost and blast radius: a
 * release run checks a tag for every published package, and each extra call
 * is another chance for a transient API failure to be mistaken for "no such
 * release". A failed listing throws rather than reporting an empty set —
 * "the check failed" must never be read as "nothing is released", which
 * would send every package on to a doomed create.
 */
export const listReleaseTags = async (
  deps: GithubReleaseDeps,
): Promise<ReadonlySet<string>> => {
  const { exitCode, stderr, stdout } = await deps.execute('gh', [
    'release', 'list', '--limit', releaseListLimit, '--json', 'tagName',
  ]);
  if (exitCode !== 0) {
    throw new Error(`gh release list failed: ${stderr}`);
  }
  const releases = v.parse(ReleaseListSchema, JSON.parse(stdout));

  return new Set(releases.map(({ tagName }) => tagName));
};

/**
 * Resolves the commit a new release's tag should point at: the local HEAD.
 * Passing it explicitly (`--target`) matters for reproducibility — without
 * it, gh targets the *remote default branch* HEAD, which is only coincidentally
 * right when publishing from a fresh CI checkout and silently wrong for a
 * local re-run on an older commit.
 */
export const resolveHeadSha = async (deps: GithubReleaseDeps): Promise<string> => {
  const { exitCode, stderr, stdout } = await deps.execute('git', ['rev-parse', 'HEAD']);
  if (exitCode !== 0) {
    throw new Error(`git rev-parse HEAD failed: ${stderr}`);
  }

  return stdout;
};

/**
 * A planned GitHub release: one tag, its notes, and any uploadable assets.
 */
export interface GithubReleasePlan {
  readonly assets?: readonly string[];
  readonly notes: string;
  readonly tag: string;
  readonly target: string;
}

/*
 * GitHub's 422 when a release already claims the tag ("Release.tag_name
 * already exists"), or when the tag is reserved by a *deleted* immutable
 * release ("tag_name was used by an immutable release") — a state no listing
 * can report. Anchored on the `tag_name` field so a same-worded failure about
 * something else (an asset of that name, say) still fails the release.
 */
const tagTakenPattern = /tag_name (?:already exists|already_exists|was used)/iv;

/**
 * The outcome of a create: whether this call is what published the release.
 */
export type ReleaseOutcome = 'created' | 'exists';

/**
 * Creates the release via gh, which also creates the tag server-side at
 * `target` — no git push needed, keeping the whole flow reproducible from a
 * local `gtb publish`. Mirrors changesets' release shape: title = tag, body =
 * the changelog section. A tag GitHub reports as already taken resolves to
 * `exists` instead of throwing: that is the idempotent outcome this channel
 * wants, and treating it as failure would turn a benign race with the listing
 * into a failed release run.
 */
export const createGithubRelease = async (
  deps: GithubReleaseDeps,
  plan: GithubReleasePlan,
): Promise<ReleaseOutcome> => {
  const { exitCode, stderr, stdout } = await deps.execute('gh', [
    'release', 'create', plan.tag,
    '--target', plan.target,
    '--title', plan.tag,
    '--notes', plan.notes,
    ...(plan.assets ?? []),
  ]);
  if (exitCode === 0) {
    deps.logger.info(stdout);

    return 'created';
  }
  if (tagTakenPattern.test(stderr)) {
    return 'exists';
  }

  throw new Error(`gh release create ${plan.tag} failed: ${stderr}`);
};

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

const skipMessage = (tag: string): string => `release ${tag} already exists — skipping`;

/**
 * Creates a GitHub release for each pending package, idempotently: a tag that
 * already has a release is skipped, so re-running on an unchanged version is
 * a no-op (and a run that died partway backfills on the next). The shared loop
 * for every release channel — tag convention, changelog notes, skip-if-exists,
 * HEAD targeting — so channels can't drift apart.
 *
 * One package's failure does not strand the rest: each is attempted, and the
 * failures are re-thrown together at the end. The packages are independent
 * releases, so stopping at the first would leave an arbitrary suffix of them
 * unreleased for a reason that had nothing to do with them.
 */
export const publishReleases = async (
  deps: GithubReleaseDeps,
  packages: readonly PendingRelease[],
  isMonorepo: boolean,
): Promise<void> => {
  const released = await listReleaseTags(deps);
  const target = await resolveHeadSha(deps);
  const failures: Error[] = [];
  for (const { assets, dir, name, version } of packages) {
    const tag = releaseTag(name, version, isMonorepo);
    if (released.has(tag)) {
      deps.logger.info(skipMessage(tag));
      continue;
    }
    try {
      const outcome = await createGithubRelease(deps, {
        ...(assets !== undefined && { assets }),
        notes: releaseNotes(dir, version) ?? tag,
        tag,
        target,
      });
      deps.logger.info(outcome === 'created' ? `created release ${tag}` : skipMessage(tag));
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      deps.logger.error(failure.message);
      failures.push(failure);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `failed to create ${String(failures.length)} release(s)`);
  }
};

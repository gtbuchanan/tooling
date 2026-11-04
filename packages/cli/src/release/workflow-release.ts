import path from 'node:path';
import * as v from 'valibot';
import { discoverWorkspace } from '#src/core/discovery.js';
import type { ExecResult } from '#src/core/process.js';
import { type HostedRepository, resolveHostedRepository } from '#src/core/repository.js';
import {
  type GithubReleaseDeps,
  createGithubRelease,
  listReleaseTags,
  releaseNotes,
  resolveHeadSha,
} from '#src/release/github-release.js';
import {
  type Git,
  type TreeEntry,
  gitIn,
  planTreeEntries,
  succeeded,
  treeOf,
  workflowsPackageDir,
} from '#src/release/workflow-tree.js';
import { capabilities } from '#src/toolchains/index.js';

const ShaSchema = v.object({ sha: v.string() });

const RefSchema = v.object({ object: v.object({ sha: v.string(), type: v.string() }) });

type TagRef = v.InferOutput<typeof RefSchema>['object'];

const CommitSchema = v.object({
  parents: v.array(ShaSchema),
  tree: ShaSchema,
});

const CompareSchema = v.object({ status: v.string() });

const RepositorySchema = v.object({ default_branch: v.string() });

const ManifestSchema = v.object({ version: v.optional(v.string()) });

/*
 * How the compare endpoint reports a base that is an ancestor of the head.
 */
const onBranchStatuses = new Set(['ahead', 'identical']);

/**
 * The repository's Git Data API, through gh.
 */
interface GitDataApi {
  /**
   * Requests the endpoint and parses its JSON answer, failing on an error.
   */
  readonly json: (endpoint: string, body?: object) => Promise<unknown>;
  /**
   * Requests the endpoint, POSTing `body` when given, and resolves the
   * outcome rather than failing on it.
   */
  readonly request: (endpoint: string, body?: object) => Promise<ExecResult>;
}

/*
 * gh fills in `{owner}` and `{repo}` from the checkout it runs in, the
 * workspace's, as `gh release` resolves the repository it releases in, so the
 * tag and its release cannot land in different repositories. The manifest's
 * repository names only the references the rewrite pins.
 */
const checkoutRepository = 'repos/{owner}/{repo}';

const gitDataApi = (deps: GithubReleaseDeps): GitDataApi => {
  const request: GitDataApi['request'] = async (endpoint, body) => deps.execute(
    'gh',
    [
      'api',
      ...(body === undefined ? [] : ['--method', 'POST', '--input', '-']),
      endpoint === '' ? checkoutRepository : `${checkoutRepository}/${endpoint}`,
    ],
    { cwd: deps.cwd, ...(body !== undefined && { input: JSON.stringify(body) }) },
  );

  return {
    json: async (endpoint, body) => {
      const method = body === undefined ? 'GET' : 'POST';
      const parsed: unknown = JSON.parse(
        succeeded(await request(endpoint, body), `${method} ${endpoint}`),
      );

      return parsed;
    },
    request,
  };
};

/**
 * What one run knows about the release it is cutting.
 */
interface ReleaseContext {
  readonly api: GitDataApi;
  readonly git: Git;
  readonly head: string;
  readonly repository: HostedRepository;
  readonly tag: string;
  readonly version: string;
}

/**
 * The release tree: `baseTree` with `entries` replaced.
 */
const createTree = async (
  { api }: ReleaseContext,
  baseTree: string,
  entries: readonly TreeEntry[],
): Promise<string> => {
  if (entries.length === 0) {
    return baseTree;
  }
  const created = await api.json('git/trees', { base_tree: baseTree, tree: entries });

  return v.parse(ShaSchema, created).sha;
};

/**
 * The workflows package's version as `commit` holds it.
 */
const committedVersion = async (git: Git, commit: string): Promise<string | undefined> => {
  const manifest = await git(['show', `${commit}:./${workflowsPackageDir}/package.json`]);

  return v.parse(ManifestSchema, JSON.parse(manifest)).version;
};

/**
 * Fetches `commit` when the checkout is too shallow, or too old, to hold it.
 */
const ensureCommit = async (git: Git, commit: string): Promise<void> => {
  try {
    await git(['cat-file', '-t', commit]);
  } catch {
    /*
     * Only a clone that is already shallow fetches shallow: in a full one,
     * `--depth` records a shallow boundary and cuts its history short.
     */
    const isShallow = await git(['rev-parse', '--is-shallow-repository']) === 'true';
    await git(['fetch', '--no-tags', ...(isShallow ? ['--depth=1'] : []), 'origin', commit]);
  }
};

/**
 * The release tree a commit on the default branch gets, if any, for checking a tag cut
 * from it. The commit has to be on the branch as GitHub holds it now, not
 * merely an ancestor of HEAD: a run that started before a newer push is behind
 * the commit the newer run tagged. It also has to hold the version being
 * released.
 */
const plannedTreeFor = async (
  context: ReleaseContext,
  commit: string,
): Promise<string | undefined> => {
  const { api, git, repository, tag } = context;
  const branch = v.parse(RepositorySchema, await api.json('')).default_branch;
  /*
   * Only the status is read, so one commit of the comparison is enough: a
   * parent far behind the branch would otherwise list hundreds with diffs.
   */
  const comparison = await api.json(`compare/${commit}...${branch}?per_page=1`);
  const { status } = v.parse(CompareSchema, comparison);
  if (!onBranchStatuses.has(status)) {
    throw new Error(`tag ${tag} was cut from ${commit}, which is not on ${branch}`);
  }
  await ensureCommit(git, commit);
  /*
   * The tree a commit before the version bump plans is the previous version's
   * workflows, however exactly the tag holds it.
   */
  const version = await committedVersion(git, commit);
  if (version !== context.version) {
    throw new Error(
      `tag ${tag} was cut from ${commit}, which holds version ${String(version)}`,
    );
  }
  const entries = await planTreeEntries(git, commit, repository, tag);
  /*
   * A commit with nothing to pin is released as itself, so no child of it is
   * a release this channel cut.
   */
  return entries.length === 0 ? undefined : createTree(context, await treeOf(git, commit), entries);
};

/**
 * The tag's ref, or nothing when the tag does not exist.
 */
const readTag = async ({ api, tag }: ReleaseContext): Promise<TagRef | undefined> => {
  const result = await api.request(`git/ref/tags/${tag}`);
  if (result.exitCode === 0) {
    return v.parse(RefSchema, JSON.parse(result.stdout)).object;
  }
  if (result.stderr.includes('HTTP 404')) {
    return undefined;
  }

  throw new Error(`GET git/ref/tags/${tag} failed: ${result.stderr}`);
};

/**
 * Refuses an annotated tag, whose ref names a tag object rather than the
 * commit it tags, so no check against a commit could pass it.
 */
const requireLightweight = (tag: string, ref: TagRef): void => {
  if (ref.type !== 'commit') {
    throw new Error(
      `tag ${tag} is annotated, and this channel creates only lightweight tags; ` +
      'delete it or release a new version',
    );
  }
};

/**
 * The commit an existing tag points at, if it is the release this channel
 * would have cut from the tag's own parent. A tag left by a dead run is cut
 * from wherever HEAD stood then, so the plan is recomputed for that parent
 * rather than for the current HEAD. Anything else under the tag is refused.
 */
const verifyTag = async (
  context: ReleaseContext,
  ref: TagRef,
  headPlan: string,
): Promise<string> => {
  const { api, head, tag } = context;
  requireLightweight(tag, ref);
  const commit = v.parse(CommitSchema, await api.json(`git/commits/${ref.sha}`));
  const [parent, ...otherParents] = commit.parents;
  const expected = parent === undefined || otherParents.length > 0
    ? undefined
    : await (parent.sha === head ? headPlan : plannedTreeFor(context, parent.sha));
  if (commit.tree.sha !== expected) {
    throw new Error(
      `tag ${tag} exists but is not a release this channel cut; ` +
      'delete it or release a new version',
    );
  }

  return ref.sha;
};

/**
 * The commit the release tags: one an earlier or concurrent run already
 * tagged, once verified, or a new one cut from HEAD onto `tree`.
 */
const resolveReleaseCommit = async (context: ReleaseContext, tree: string): Promise<string> => {
  const { api, head, tag } = context;
  const existing = await readTag(context);
  if (existing !== undefined) {
    return verifyTag(context, existing, tree);
  }
  const message = `Release ${tag}\n\nCut from ${head}, ` +
    `with this repository's own .github/ references pinned to ${tag}.`;
  const commit = await api.json('git/commits', { message, parents: [head], tree });
  const { sha } = v.parse(ShaSchema, commit);
  const created = await api.request('git/refs', { ref: `refs/tags/${tag}`, sha });
  if (created.exitCode === 0) {
    return sha;
  }
  const raced = created.stderr.includes('Reference already exists')
    ? await readTag(context)
    : undefined;
  if (raced === undefined) {
    throw new Error(`POST git/refs failed: ${created.stderr}`);
  }

  return verifyTag(context, raced, tree);
};

/**
 * HEAD, as the release target when nothing needs pinning. `gh release create`
 * ignores `--target` for a tag that exists, and creates the tag and release
 * together, so no run of this channel leaves the tag behind: one already
 * there and pointing elsewhere is someone else's, and is refused.
 */
const unpinnedTarget = async (context: ReleaseContext): Promise<string> => {
  const { head, tag } = context;
  const existing = await readTag(context);
  if (existing === undefined) {
    return head;
  }
  requireLightweight(tag, existing);
  if (existing.sha !== head) {
    throw new Error(
      `tag ${tag} exists at ${existing.sha} rather than HEAD (${head}); ` +
      'delete it or release a new version',
    );
  }

  return head;
};

/**
 * The commit the release tags: HEAD itself when nothing needs pinning, as
 * every other channel releases it, or else the pinned release commit.
 */
const releaseTarget = async (context: ReleaseContext): Promise<string> => {
  const { git, head, repository, tag } = context;
  const entries = await planTreeEntries(git, head, repository, tag);
  if (entries.length === 0) {
    return unpinnedTarget(context);
  }
  const tree = await createTree(context, await treeOf(git, head), entries);

  return resolveReleaseCommit(context, tree);
};

/**
 * Publishes the workspace's `.github/` package as a `v<version>` release whose
 * tag holds the package with its self-references pinned to that tag.
 *
 * The pinned tree cannot be committed to the default branch: its own CI would
 * then reference a tag that does not exist until CD, which waits on that CI,
 * creates it. So the release commit is a child of HEAD that only the tag
 * reaches, built through GitHub's Git Data API, which signs what it creates
 * where a CI runner has no key to sign with.
 *
 * Idempotent like every release channel: a version with a release is skipped,
 * and a tag a dead or concurrent run left is released, but only once it is
 * shown to hold exactly the tree this channel would have cut from its parent.
 * Anyone able to create the tag could otherwise have any commit released
 * under the version.
 */
export const executePublishWorkflows = async (deps: GithubReleaseDeps): Promise<void> => {
  const discovery = discoverWorkspace({ capabilities, cwd: deps.cwd });
  const packageDir = path.join(discovery.rootDir, workflowsPackageDir);
  const pkg = discovery.packages.find(({ dir }) => dir === packageDir);
  if (pkg === undefined) {
    deps.logger.info('no workflows package to publish');

    return;
  }
  const git = gitIn(deps, discovery.rootDir);
  /*
   * GitHub reads `.github/` only at the repository root, which is also where
   * every self-reference resolves, so a package below it is not one callers
   * can reach.
   */
  const prefix = await git(['rev-parse', '--show-prefix']);
  if (prefix !== '') {
    throw new Error(
      `${prefix}${workflowsPackageDir} is not at the repository root, where GitHub reads it`,
    );
  }
  const head = await resolveHeadSha(deps);
  /*
   * HEAD's version rather than the manifest on disk: the release holds what
   * HEAD holds, so an uncommitted bump would tag the previous content.
   */
  const version = await committedVersion(git, head);
  if (version === undefined) {
    throw new Error(`${path.join(pkg.dir, 'package.json')}: missing "version" at HEAD`);
  }
  const tag = `v${version}`;
  const released = await listReleaseTags(deps);
  if (released.has(tag)) {
    deps.logger.info(`release ${tag} already exists — skipping`);

    return;
  }

  const repository = resolveHostedRepository(discovery.rootDir);
  const api = gitDataApi(deps);
  const target = await releaseTarget({ api, git, head, repository, tag, version });

  const outcome = await createGithubRelease(deps, {
    notes: releaseNotes(pkg.dir, version) ?? tag,
    tag,
    target,
  });
  deps.logger.info(
    outcome === 'created' ? `created release ${tag}` : `release ${tag} already exists — skipping`,
  );
};

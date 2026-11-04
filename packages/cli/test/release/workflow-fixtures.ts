import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import * as build from '@gtbuchanan/test-utils/builders';
import { type ExecResult, type ExecuteOptions, execute } from '#src/core/process.js';
import type { HostedRepository } from '#src/core/repository.js';
import { captureLogger, createTempDir, writeJson } from '#test/helpers.js';
import { commitAll, initRepo, updateRef } from '#test/release/commands/fixtures.js';

const repositoryOf = (): HostedRepository => ({
  domain: 'github.com',
  owner: build.packageName(),
  project: build.packageName(),
});

const slugOf = ({ owner, project }: HostedRepository): string => `${owner}/${project}`;

/**
 * One `gh` invocation the fake answered, with its request body parsed.
 */
interface GhCall {
  readonly args: readonly string[];
  readonly body?: unknown;
  readonly cwd?: string;
}

/**
 * A tag the fake GitHub holds: the commit it points at, and that commit's
 * parent and tree.
 */
interface FakeTag {
  readonly parent: string;
  readonly sha: string;
  readonly tree: string;
  readonly type?: 'commit' | 'tag';
}

/**
 * What the fake GitHub holds before the channel runs.
 */
interface FakeGithubOptions {
  /**
   * What the compare endpoint reports whatever it compares. Without it, the
   * answer comes from the repository's real ancestry.
   */
  readonly ancestry?: 'ahead' | 'diverged';
  /**
   * The commit the default branch points at, when the branch has moved past
   * the checkout's HEAD.
   */
  readonly branchTip?: string;
  /**
   * A tag that exists before the channel looks.
   */
  readonly existingTag?: FakeTag;
  /**
   * A tag a concurrent run creates after the channel looked and before it
   * creates its own.
   */
  readonly racedTag?: FakeTag;
  readonly releasedTags?: readonly string[];
}

/**
 * The sha the fake answers a tree creation with. It derives from the tree the
 * request builds on, so the same plan made twice for one commit gets the same
 * answer, as GitHub's content addressing gives.
 */
export const plannedTreeOf = (baseTree: string): string => `planned-${baseTree}`;

const ok = (stdout: string): ExecResult => ({ exitCode: 0, stderr: '', stdout });

const json = (body: unknown): ExecResult => ok(JSON.stringify(body));

const failure = (stderr: string): ExecResult => ({ exitCode: 1, stderr, stdout: '' });

/**
 * A gh call as the fake routes it: `release <subcommand>`, or the HTTP method
 * and endpoint of a `gh api` call.
 */
const describeCall = (args: readonly string[]): string => {
  if (args[0] === 'release') {
    return `release ${args[1] ?? ''}${args[1] === 'create' ? ' ' : ''}`;
  }
  const endpoint = args.find(arg => arg.startsWith('repos/')) ?? '';

  return `${args.includes('POST') ? 'POST' : 'GET'} ${endpoint}`;
};

const isAncestor = async (root: string, ancestor: string, descendant: string) => {
  const { exitCode } = await execute(
    'git',
    ['-C', root, 'merge-base', '--is-ancestor', ancestor, descendant],
  );

  return exitCode === 0;
};

const localHead = async (root: string): Promise<string> => {
  const { stdout } = await execute('git', ['-C', root, 'rev-parse', 'HEAD']);

  return stdout;
};

/**
 * How `head` relates to `base`, as GitHub's compare endpoint words it.
 */
const ancestryOf = async (root: string, base: string, head: string): Promise<string> => {
  if (base === head) {
    return 'identical';
  }
  if (await isAncestor(root, base, head)) {
    return 'ahead';
  }

  return await isAncestor(root, head, base) ? 'behind' : 'diverged';
};

const baseTreeOf = (body: unknown): string =>
  (typeof body === 'object' && body !== null && 'base_tree' in body
    ? String(body.base_tree)
    : '');

/**
 * A fake `gh` over the endpoints the channel uses, with real `git` for
 * everything else, so the trees it plans are built from a real repository.
 */
export const fakeGithub = (options: FakeGithubOptions = {}) => {
  const calls: GhCall[] = [];
  const createdCommit = faker.git.commitSha();
  const defaultBranch = build.packageName();
  let root = '';
  let tag = options.existingTag;
  const compare = async (endpoint: string): Promise<ExecResult> => {
    if (options.ancestry !== undefined) {
      return json({ status: options.ancestry });
    }
    const marker = '/compare/';
    const [base = '', headRef = ''] = endpoint.slice(endpoint.indexOf(marker) + marker.length)
      .replace(/\?.*$/v, '')
      .split('...', 2);
    const head = headRef === defaultBranch
      ? options.branchTip ?? await localHead(root)
      : headRef;

    return json({ status: await ancestryOf(root, base, head) });
  };
  const tagRef = (): ExecResult => (tag === undefined
    ? failure('gh: Not Found (HTTP 404)')
    : json({ object: { sha: tag.sha, type: tag.type ?? 'commit' } }));
  const createRef = (): ExecResult => {
    if (options.racedTag === undefined) {
      return json({});
    }
    tag = options.racedTag;

    return failure('gh: Reference already exists (HTTP 422)');
  };
  type Route = (body: unknown, endpoint: string) => ExecResult | Promise<ExecResult>;
  const routes: readonly (readonly [RegExp, Route])[] = [
    [/^GET repos\/\{owner\}\/\{repo\}$/v, () => json({ default_branch: defaultBranch })],
    [/^release list$/v, () => json((options.releasedTags ?? []).map(tagName => ({ tagName })))],
    [/^release create /v, () => ok('created')],
    [/^POST .*\/git\/trees$/v, body => json({ sha: plannedTreeOf(baseTreeOf(body)) })],
    [/^POST .*\/git\/commits$/v, () => json({ sha: createdCommit })],
    [/^POST .*\/git\/refs$/v, createRef],
    [/^GET .*\/git\/ref\/tags\//v, tagRef],
    [/^GET .*\/git\/commits\//v, () => json({
      parents: [{ sha: tag?.parent }],
      tree: { sha: tag?.tree },
    })],
    [/^GET .*\/compare\//v, async (_body, endpoint) => compare(endpoint)],
  ];
  const answer = async (args: readonly string[], body: unknown): Promise<ExecResult> => {
    const call = describeCall(args);
    const route = routes.find(([pattern]) => pattern.test(call));

    return route === undefined
      ? failure(`unexpected gh ${args.join(' ')}`)
      : route[1](body, call.slice(call.indexOf(' ') + 1));
  };
  const callsTo = (suffix: string, method = 'POST') => calls.filter(({ args }) =>
    args.some(arg => arg.endsWith(suffix)) && args.includes(method));

  return {
    apiCalls: () => calls.filter(({ args }) => args[0] === 'api'),
    calls,
    callsTo,
    createdCommit,
    deps: (cwd: string) => {
      root = cwd;

      return {
        cwd,
        execute: async (command: string, args: readonly string[], execOptions?: ExecuteOptions) => {
          if (command !== 'gh') {
            return execute(command, args, execOptions);
          }
          const input = execOptions?.input;
          const body: unknown = input === undefined ? undefined : JSON.parse(input);
          const cwd = execOptions?.cwd;
          calls.push({
            args,
            ...(body !== undefined && { body }),
            ...(cwd !== undefined && { cwd }),
          });

          return answer(args, body);
        },
        logger: captureLogger().logger,
      };
    },
    releaseCreates: () => calls.filter(({ args }) => args[0] === 'release' && args[1] === 'create'),
    /**
     * The tag and target of each release created, in order.
     */
    releasedTargets: () => calls
      .filter(({ args }) => args[0] === 'release' && args[1] === 'create')
      .map(({ args }) => [args[2], args[4]]),
  };
};

/**
 * Options for {@link createWorkflowsRepo}.
 */
interface WorkflowsRepoOptions {
  /**
   * Commits a version bump after the release's source commit, so the tag the
   * repository holds is for a version the source commit predates.
   */
  readonly bumped?: boolean;
  /**
   * Adds a file under `.github/` that is not UTF-8, listed ahead of the
   * workflows.
   */
  readonly binary?: boolean;
  /**
   * Starts the self-referencing workflow with a UTF-8 byte order mark.
   */
  readonly bom?: boolean;
  /**
   * Quotes the self-reference in the changelog, as an entry describing a
   * workflow change does.
   */
  readonly changelogReference?: boolean;
  /**
   * Commits once more after the release's source commit, as a push to the
   * default branch does between a run that died and its retry.
   */
  readonly moved?: boolean;
  /**
   * Puts the workspace in {@link nestedWorkspace} below the git root.
   */
  readonly nested?: boolean;
  /**
   * Whether the workflow references the repository's own action.
   */
  readonly selfReferencing?: boolean;
  /**
   * Commits once more but leaves HEAD at the release's source commit, as a run
   * that started before a newer push sees the repository.
   */
  readonly stale?: boolean;
}

/**
 * A UTF-8 byte order mark, as text.
 */
export const byteOrderMark = '\u{FEFF}';

const leadingMark = ({ bom }: WorkflowsRepoOptions): string => (bom === true ? byteOrderMark : '');

/*
 * Whether the repository commits again after the release's source commit.
 */
const doesMoveOn = ({ bumped, moved, stale }: WorkflowsRepoOptions): boolean =>
  bumped === true || moved === true || stale === true;

/**
 * Where a nested workspace sits, relative to the git root.
 */
export const nestedWorkspace = 'workspace';

const treeOf = async (root: string, commit: string): Promise<string> => {
  const { stdout } = await execute('git', ['-C', root, 'log', '-1', '--format=%T', commit]);

  return stdout;
};

/**
 * A committed workspace whose `.github/` package holds one workflow that
 * references the repository's own action, plus one that references nothing.
 */
export const createWorkflowsRepo = async (options: WorkflowsRepoOptions = {}) => {
  const gitRoot = createTempDir();
  const root = options.nested === true ? path.join(gitRoot, nestedWorkspace) : gitRoot;
  mkdirSync(root, { recursive: true });
  const repository = repositoryOf();
  const version = build.semverVersion();
  const notes = faker.lorem.sentence();
  const actionRef = (options.selfReferencing ?? true)
    ? `${slugOf(repository)}/.github/actions/${build.packageName()}`
    : `${build.packageName()}/${build.packageName()}`;
  const pinnedWorkflow = (ref: string): string => [
    'jobs:',
    '  build:',
    '    steps:',
    '      - uses: actions/checkout@v7',
    `      - uses: ${actionRef}@${ref}`,
    '',
  ].join('\n');

  writeJson(root, 'package.json', {
    name: build.packageName(),
    private: true,
    repository: { type: 'git', url: `https://github.com/${slugOf(repository)}.git` },
  });
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - '.github'\n");
  const githubDir = path.join(root, '.github');
  mkdirSync(path.join(githubDir, 'workflows'), { recursive: true });
  const packageName = build.scopedPackageName();
  const quoted = options.changelogReference === true ? `\n\nSee \`${actionRef}@main\`.` : '';
  const writeVersion = (released: string): void => {
    writeJson(githubDir, 'package.json', { name: packageName, private: true, version: released });
    writeFileSync(
      path.join(githubDir, 'CHANGELOG.md'),
      `# Changelog\n\n## ${released}\n\n${notes}${quoted}\n`,
    );
  };
  writeVersion(version);
  writeFileSync(
    path.join(githubDir, 'workflows', 'ci.yml'),
    `${leadingMark(options)}${pinnedWorkflow('main')}`,
  );
  writeFileSync(path.join(githubDir, 'workflows', 'plain.yml'), 'jobs: {}\n');
  if (options.binary === true) {
    writeFileSync(path.join(githubDir, 'logo.png'), Buffer.from([0x89, 0xFF, 0xC3, 0x28, 0x80]));
  }

  await initRepo(gitRoot);
  const cut = await commitAll(gitRoot);
  let later = cut;
  const released = options.bumped === true ? `${version}-next` : version;
  if (doesMoveOn(options)) {
    writeVersion(released);
    writeFileSync(path.join(root, faker.system.commonFileName('txt')), faker.lorem.sentence());
    later = await commitAll(gitRoot, cut);
  }
  const head = options.stale === true ? cut : later;
  await updateRef(gitRoot, 'HEAD', head);

  return {
    cut,
    cutTree: await treeOf(root, cut),
    head,
    headTree: await treeOf(root, head),
    later,
    laterTree: await treeOf(root, later),
    notes,
    pinnedWorkflow,
    root,
    slug: slugOf(repository),
    tag: `v${released}`,
  };
};

export type WorkflowsRepo = Awaited<ReturnType<typeof createWorkflowsRepo>>;

/**
 * A full clone of a workflows repo whose origin has since moved on by one
 * commit the clone has not fetched, as a maintainer's checkout is when a newer
 * CD run has released.
 */
export const createLaggingClone = async () => {
  const origin = await createWorkflowsRepo();
  const clone = createTempDir();
  await execute('git', ['clone', '--quiet', origin.root, clone]);
  writeFileSync(path.join(origin.root, faker.system.commonFileName('txt')), faker.lorem.sentence());
  const later = await commitAll(origin.root, origin.head);
  await updateRef(origin.root, 'HEAD', later);

  return { clone, later, laterTree: await treeOf(origin.root, later), tag: origin.tag };
};

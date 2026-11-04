import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import * as build from '@gtbuchanan/test-utils/builders';
import { it as base, describe } from 'vitest';
import { executePublishWorkflows } from '#src/release/workflow-release.js';
import { createTempDir, writeJson } from '#test/helpers.js';
import { commitAll, updateRef } from '#test/release/commands/fixtures.js';
import {
  type WorkflowsRepo,
  byteOrderMark,
  createLaggingClone,
  createWorkflowsRepo,
  fakeGithub,
  nestedWorkspace,
  plannedTreeOf,
} from '#test/release/workflow-fixtures.js';

/*
 * Each repo is built once per file and shared by the tests that only read
 * it: every build spawns a run of git processes, which stack up under a full
 * parallel check. A test that writes to its repo builds its own.
 */
/* eslint-disable-next-line vitest/consistent-test-it --
   False positive on .extend() factory:
   https://github.com/vitest-dev/eslint-plugin-vitest/issues/884 */
const it = base.extend<{
  movedRepo: WorkflowsRepo;
  repo: WorkflowsRepo;
  unpinnedRepo: WorkflowsRepo;
}>({
  movedRepo: [
    async ({}, use) => use(await createWorkflowsRepo({ moved: true })),
    { scope: 'file' },
  ],
  repo: [async ({}, use) => use(await createWorkflowsRepo()), { scope: 'file' }],
  unpinnedRepo: [
    async ({}, use) => use(await createWorkflowsRepo({ selfReferencing: false })),
    { scope: 'file' },
  ],
});

describe.concurrent(executePublishWorkflows, () => {
  it('builds the release tree from HEAD, pinning self-references', async ({ expect, repo }) => {
    const github = fakeGithub();

    await executePublishWorkflows(github.deps(repo.root));

    expect(github.callsTo('/git/trees').map(({ body }) => body)).toStrictEqual([{
      base_tree: repo.headTree,
      tree: [{
        content: repo.pinnedWorkflow(repo.tag),
        mode: '100644',
        path: '.github/workflows/ci.yml',
        type: 'blob',
      }],
    }]);
  });

  /*
   * The tree is HEAD's, so an uncommitted edit on disk must neither reach the
   * release nor stop it.
   */
  it('pins what HEAD holds, whatever the working tree holds', async ({ expect }) => {
    // Its own repo, since the edit would leak into every test sharing one.
    const repo = await createWorkflowsRepo();
    const github = fakeGithub();
    appendFileSync(path.join(repo.root, '.github', 'workflows', 'ci.yml'), '# edited\n');

    await executePublishWorkflows(github.deps(repo.root));

    expect(github.callsTo('/git/trees')[0]?.body)
      .toHaveProperty(['tree', 0, 'content'], repo.pinnedWorkflow(repo.tag));
  });

  /*
   * git reports each blob's size in bytes, so a file that is not UTF-8 must
   * neither shift the files read after it nor be rewritten as text itself.
   */
  it('pins the workflows past a file that is not UTF-8', async ({ expect }) => {
    const repo = await createWorkflowsRepo({ binary: true });
    const github = fakeGithub();

    await executePublishWorkflows(github.deps(repo.root));

    expect(github.callsTo('/git/trees')[0]?.body).toHaveProperty('tree', [{
      content: repo.pinnedWorkflow(repo.tag),
      mode: '100644',
      path: '.github/workflows/ci.yml',
      type: 'blob',
    }]);
  });

  /*
   * GitHub reads `.github/` only at the repository root, so a self-reference
   * resolves there: pinning one inside a nested workspace's `.github/` would
   * point callers at a tree the release does not hold.
   */
  it('refuses a workflows package below the repository root', async ({ expect }) => {
    const repo = await createWorkflowsRepo({ nested: true });
    const github = fakeGithub();

    await expect(executePublishWorkflows(github.deps(repo.root)))
      .rejects.toThrow(`${nestedWorkspace}/.github`);
    expect(github.apiCalls()).toStrictEqual([]);
    expect(github.releaseCreates()).toStrictEqual([]);
  });

  /*
   * Pinning changes the references and nothing else, so a byte order mark
   * the file starts with survives the rewrite.
   */
  it('keeps the byte order mark of a pinned file', async ({ expect }) => {
    const repo = await createWorkflowsRepo({ bom: true });
    const github = fakeGithub();

    await executePublishWorkflows(github.deps(repo.root));

    expect(github.callsTo('/git/trees')[0]?.body)
      .toHaveProperty(['tree', 0, 'content'], `${byteOrderMark}${repo.pinnedWorkflow(repo.tag)}`);
  });

  /*
   * The changelog records what each version said at the time, so a reference
   * one of its entries quotes stays as written.
   */
  it('leaves the changelog\'s quoted references as written', async ({ expect }) => {
    const repo = await createWorkflowsRepo({ changelogReference: true });
    const github = fakeGithub();

    await executePublishWorkflows(github.deps(repo.root));

    expect(github.callsTo('/git/trees')[0]?.body).toHaveProperty(['tree'], [
      expect.objectContaining({ path: '.github/workflows/ci.yml' }),
    ]);
  });

  /*
   * The release holds HEAD's workflows, so it is HEAD's version: an
   * uncommitted bump on disk would tag the previous version's content.
   */
  it('releases the version HEAD holds, whatever the working tree holds', async ({ expect }) => {
    // Its own repo, since the edit would leak into every test sharing one.
    const repo = await createWorkflowsRepo();
    const github = fakeGithub();
    writeJson(path.join(repo.root, '.github'), 'package.json', {
      name: build.scopedPackageName(),
      private: true,
      version: build.semverVersion(),
    });

    await executePublishWorkflows(github.deps(repo.root));

    expect(github.releaseCreates().map(({ args }) => args[2])).toStrictEqual([repo.tag]);
  });

  it('commits the tree onto HEAD, tags it and releases the tag', async ({ expect, repo }) => {
    const github = fakeGithub();

    await executePublishWorkflows(github.deps(repo.root));

    expect(github.callsTo('/git/commits').map(({ body }) => body)).toStrictEqual([{
      message: `Release ${repo.tag}\n\nCut from ${repo.head}, ` +
        `with this repository's own .github/ references pinned to ${repo.tag}.`,
      parents: [repo.head],
      tree: plannedTreeOf(repo.headTree),
    }]);
    expect(github.callsTo('/git/refs').map(({ body }) => body)).toStrictEqual([
      { ref: `refs/tags/${repo.tag}`, sha: github.createdCommit },
    ]);
    expect(github.releaseCreates().map(({ args }) => args)).toStrictEqual([[
      'release', 'create', repo.tag,
      '--target', github.createdCommit,
      '--title', repo.tag,
      '--notes', repo.notes,
    ]]);
  });

  /*
   * `gh release` creates the release in the repository gh resolves from the
   * checkout, so the tag has to land there too, whatever the manifest names: a
   * fork or a renamed repository would otherwise get one without the other.
   */
  it('addresses the API to the repository gh releases in', async ({ expect, repo }) => {
    const github = fakeGithub();

    await executePublishWorkflows(github.deps(repo.root));

    const endpoints = github.apiCalls().map(({ args }) => args.at(-1) ?? '');

    expect(endpoints).toContain('repos/{owner}/{repo}/git/trees');
    expect(endpoints.filter(endpoint => !/^repos\/\{owner\}\/\{repo\}(?:\/|$)/v.test(endpoint)))
      .toStrictEqual([]);
    expect(github.apiCalls().filter(({ args }) => args.includes('--hostname'))).toStrictEqual([]);
  });

  /*
   * gh resolves the repository from its working directory, so it has to run
   * in the workspace the plan was read from, not wherever the process sits.
   */
  it('runs every gh call in the workspace it releases', async ({ expect, repo }) => {
    const github = fakeGithub();

    await executePublishWorkflows(github.deps(repo.root));

    expect(github.calls.map(({ args, cwd }) => [args[0], args[1], cwd]))
      .toStrictEqual(github.calls.map(({ args }) => [args[0], args[1], repo.root]));
  });

  /*
   * Nothing to pin means the release is HEAD itself, as every other channel
   * releases it: no commit of its own, no tag created ahead of the release.
   */
  it('releases HEAD itself when nothing needs pinning', async ({ expect, unpinnedRepo: repo }) => {
    const github = fakeGithub();

    await executePublishWorkflows(github.deps(repo.root));

    expect(github.apiCalls().filter(({ args }) => args.includes('POST'))).toStrictEqual([]);
    expect(github.releasedTargets()).toStrictEqual([[repo.tag, repo.head]]);
  });

  it('skips a version that already has a release', async ({ expect, repo }) => {
    const github = fakeGithub({ releasedTags: [repo.tag] });

    await executePublishWorkflows(github.deps(repo.root));

    expect(github.calls.map(({ args }) => args.slice(0, 2))).toStrictEqual([['release', 'list']]);
  });

  it('does nothing in a workspace without a .github package', async ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', { name: build.packageName(), private: true });
    const github = fakeGithub();

    await executePublishWorkflows(github.deps(root));

    expect(github.calls).toStrictEqual([]);
  });

  /*
   * `gh release create` ignores `--target` for a tag that exists, so an
   * unpinned release would otherwise go out on whatever commit someone else
   * tagged with the version.
   */
  it('refuses an existing tag off HEAD when nothing needs pinning', async ({
    expect,
    unpinnedRepo: repo,
  }) => {
    const github = fakeGithub({
      existingTag: { parent: repo.head, sha: faker.git.commitSha(), tree: repo.headTree },
    });

    await expect(executePublishWorkflows(github.deps(repo.root))).rejects.toThrow(repo.tag);
    expect(github.releaseCreates()).toStrictEqual([]);
  });

  /*
   * An annotated tag names its tag object rather than a commit, so comparing
   * it against HEAD would report a mismatch that is not the problem.
   */
  it('refuses an annotated tag when nothing needs pinning', async ({
    expect,
    unpinnedRepo: repo,
  }) => {
    const github = fakeGithub({
      existingTag: {
        parent: repo.head,
        sha: faker.git.commitSha(),
        tree: repo.headTree,
        type: 'tag',
      },
    });

    await expect(executePublishWorkflows(github.deps(repo.root))).rejects.toThrow(/annotated/v);
  });

  /*
   * A run that died after creating the tag but before the release leaves the
   * tag behind, and the retry has to release it rather than fail on it.
   */
  it('releases an existing tag that holds the planned tree on HEAD', async ({ expect, repo }) => {
    const tagged = faker.git.commitSha();
    const github = fakeGithub({
      existingTag: { parent: repo.head, sha: tagged, tree: plannedTreeOf(repo.headTree) },
    });

    await executePublishWorkflows(github.deps(repo.root));

    expect(github.callsTo('/git/commits')).toStrictEqual([]);
    expect(github.callsTo('/git/refs')).toStrictEqual([]);
    expect(github.releasedTargets()).toStrictEqual([[repo.tag, tagged]]);
  });

  /*
   * The default branch can move between the run that died and the one that
   * retries, so the tag is checked against the commit it was cut from.
   */
  it('releases a tag cut before the branch moved on', async ({ expect, movedRepo: repo }) => {
    const tagged = faker.git.commitSha();
    const github = fakeGithub({
      existingTag: { parent: repo.cut, sha: tagged, tree: plannedTreeOf(repo.cutTree) },
    });

    await executePublishWorkflows(github.deps(repo.root));

    expect(github.callsTo('/git/refs')).toStrictEqual([]);
    expect(github.releasedTargets()).toStrictEqual([[repo.tag, tagged]]);
  });

  /*
   * Anyone able to create the tag before CD does could otherwise have any
   * commit released under the version: the tag is accepted only when it holds
   * exactly what this channel would have built.
   */
  it('refuses an existing tag whose tree is not the planned one', async ({ expect, repo }) => {
    const github = fakeGithub({
      existingTag: { parent: repo.head, sha: faker.git.commitSha(), tree: faker.git.commitSha() },
    });

    await expect(executePublishWorkflows(github.deps(repo.root))).rejects.toThrow(repo.tag);
    expect(github.releaseCreates()).toStrictEqual([]);
  });

  /*
   * Two CD runs can overlap across a push, and the newer one tags first. The
   * older run's HEAD is then behind the tag's parent, which is still on the
   * branch, so the tag is a valid release rather than a failed run.
   */
  it('releases a tag a newer run cut past this run\'s HEAD', async ({ expect }) => {
    const repo = await createWorkflowsRepo({ stale: true });
    const tagged = faker.git.commitSha();
    const github = fakeGithub({
      branchTip: repo.later,
      existingTag: { parent: repo.later, sha: tagged, tree: plannedTreeOf(repo.laterTree) },
    });

    await executePublishWorkflows(github.deps(repo.root));

    expect(github.releasedTargets()).toStrictEqual([[repo.tag, tagged]]);
  });

  /*
   * The tagged commit is fetched to plan its tree. A shallow fetch into a full
   * clone would record a shallow boundary there and cut its history short.
   */
  it('fetches a missing tag parent without making a full clone shallow', async ({ expect }) => {
    const repo = await createLaggingClone();
    const tagged = faker.git.commitSha();
    const github = fakeGithub({
      ancestry: 'ahead',
      existingTag: { parent: repo.later, sha: tagged, tree: plannedTreeOf(repo.laterTree) },
    });

    await executePublishWorkflows(github.deps(repo.clone));

    expect(github.releasedTargets()).toStrictEqual([[repo.tag, tagged]]);
    expect(existsSync(path.join(repo.clone, '.git', 'shallow'))).toBe(false);
  });

  /*
   * A commit on the branch from before the version bump plans a tree that
   * matches its own tag, but that tree is the previous version's workflows.
   */
  it('refuses a tag cut from a commit that predates the version', async ({ expect }) => {
    const repo = await createWorkflowsRepo({ bumped: true });
    const github = fakeGithub({
      existingTag: {
        parent: repo.cut,
        sha: faker.git.commitSha(),
        tree: plannedTreeOf(repo.cutTree),
      },
    });

    await expect(executePublishWorkflows(github.deps(repo.root))).rejects.toThrow(repo.tag);
    expect(github.releaseCreates()).toStrictEqual([]);
  });

  /*
   * Only the comparison's status is read, and a full comparison of a parent
   * far behind the branch lists hundreds of commits and their diffs.
   */
  it('asks for one commit of the ancestry comparison', async ({ expect, movedRepo: repo }) => {
    const github = fakeGithub({
      existingTag: {
        parent: repo.cut,
        sha: faker.git.commitSha(),
        tree: plannedTreeOf(repo.cutTree),
      },
    });

    await executePublishWorkflows(github.deps(repo.root));

    const compares = github.apiCalls()
      .map(({ args }) => args.at(-1) ?? '')
      .filter(endpoint => endpoint.includes('/compare/'));

    expect(compares).toHaveLength(1);
    expect(compares[0]).toMatch(/\?per_page=1$/v);
  });

  /*
   * A parent with nothing to pin is released as itself, so this channel never
   * cuts a child of it, and a child holding the parent's own tree is not one
   * of its releases, however identical the content.
   */
  it('refuses a child of a parent that had nothing to pin', async ({ expect }) => {
    const repo = await createWorkflowsRepo({ selfReferencing: false });
    writeFileSync(
      path.join(repo.root, '.github', 'workflows', 'self.yml'),
      `jobs:\n  x:\n    uses: ${repo.slug}/.github/workflows/ci.yml@main\n`,
    );
    await updateRef(repo.root, 'HEAD', await commitAll(repo.root, repo.cut));
    const github = fakeGithub({
      existingTag: { parent: repo.cut, sha: faker.git.commitSha(), tree: repo.cutTree },
    });

    await expect(executePublishWorkflows(github.deps(repo.root))).rejects.toThrow(repo.tag);
    expect(github.releaseCreates()).toStrictEqual([]);
  });

  it('refuses a tag cut from a commit off the branch', async ({ expect, movedRepo: repo }) => {
    const github = fakeGithub({
      ancestry: 'diverged',
      existingTag: {
        parent: repo.cut,
        sha: faker.git.commitSha(),
        tree: plannedTreeOf(repo.cutTree),
      },
    });

    await expect(executePublishWorkflows(github.deps(repo.root))).rejects.toThrow(repo.tag);
    expect(github.releaseCreates()).toStrictEqual([]);
  });

  it('refuses an annotated tag, which this channel never creates', async ({ expect, repo }) => {
    const github = fakeGithub({
      existingTag: {
        parent: repo.head,
        sha: faker.git.commitSha(),
        tree: plannedTreeOf(repo.headTree),
        type: 'tag',
      },
    });

    await expect(executePublishWorkflows(github.deps(repo.root))).rejects.toThrow(/annotated/v);
    expect(github.releaseCreates()).toStrictEqual([]);
  });

  /*
   * Two CD runs can both find no tag and both cut a commit; the one whose tag
   * lands second releases the first one's tag once it checks out.
   */
  it('releases the tag a concurrent run created first', async ({ expect, repo }) => {
    const raced = faker.git.commitSha();
    const github = fakeGithub({
      racedTag: { parent: repo.head, sha: raced, tree: plannedTreeOf(repo.headTree) },
    });

    await executePublishWorkflows(github.deps(repo.root));

    expect(github.releasedTargets()).toStrictEqual([[repo.tag, raced]]);
  });
});

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { execute, run } from '#src/core/process.js';
import { readBaseWorkspace } from '#src/release/commands/changeset.js';
import { createTempDir } from '#test/helpers.js';
import {
  catalogOf,
  commitAll,
  depsFor,
  fail,
  initRepo,
  ok,
  updateRef,
} from '#test/release/commands/fixtures.js';

describe.concurrent(readBaseWorkspace, () => {
  it('returns the base revision of the workspace file', async ({ expect }) => {
    const source = catalogOf(build.packageName(), '^1.0.0');
    const deps = depsFor({
      'ls-tree': ok('pnpm-workspace.yaml'),
      'merge-base': ok('abc123'),
      'rev-parse': ok('abc123'),
      'show': ok(source),
    });

    const result = await readBaseWorkspace('origin/main', '/repo', deps);

    expect(result).toBe(source);
  });

  it('treats a base predating the file as having no catalogs', async ({ expect }) => {
    const deps = depsFor({
      'ls-tree': ok(''),
      'merge-base': ok('abc123'),
      'rev-parse': ok('abc123'),
    });

    const result = await readBaseWorkspace('origin/main', '/repo', deps);

    expect(result).toBe('');
  });

  /*
   * The absent-file and unreadable-object cases must not collapse: only the
   * first may answer `''`, or a corrupt base silently reports every catalog
   * entry as newly added.
   */
  it('throws when the historical file lookup itself fails', async ({ expect }) => {
    const deps = depsFor({
      'ls-tree': fail('fatal: not a tree object'),
      'merge-base': ok('abc123'),
      'rev-parse': ok('abc123'),
    });

    await expect(readBaseWorkspace('origin/main', '/repo', deps))
      .rejects.toThrow('not a tree object');
  });

  it('throws naming the base ref when it cannot be resolved', async ({ expect }) => {
    const base = 'origin/nope';
    const deps = depsFor({ 'rev-parse': fail('unknown revision') });

    await expect(readBaseWorkspace(base, '/repo', deps)).rejects.toThrow(base);
  });

  /*
   * Folding a git failure into the empty-base answer would report every
   * catalog entry in the workspace as newly added.
   */
  it('throws rather than reporting an empty catalog when show fails', async ({ expect }) => {
    const deps = depsFor({
      'ls-tree': ok('pnpm-workspace.yaml'),
      'merge-base': ok('abc123'),
      'rev-parse': ok('abc123'),
      'show': fail('corrupt object'),
    });

    await expect(readBaseWorkspace('origin/main', '/repo', deps)).rejects.toThrow('corrupt object');
  });

  /*
   * The head side reads the file under the workspace root, so the base side
   * must too. Resolving from the git top level instead reads a different file,
   * or none, and reports every catalog entry as newly added.
   */
  it('reads the file under a workspace nested below the git root', async ({ expect }) => {
    const repo = createTempDir();
    const workspaceRoot = path.join(repo, 'workspace');
    mkdirSync(workspaceRoot);
    const source = catalogOf(build.packageName(), '^1.0.0');
    writeFileSync(path.join(workspaceRoot, 'pnpm-workspace.yaml'), source);
    await initRepo(repo);
    const commit = await commitAll(repo);
    await updateRef(repo, 'HEAD', commit);

    const result = await readBaseWorkspace(commit, workspaceRoot, { execute, run });

    expect(result).toBe(source.trim());
  });

  /*
   * `changeset status` diffs from the merge base, so the catalog gate must
   * read the base there too. Reading the base's tip instead reports a bump
   * that landed on the base after the fork as this branch reverting it.
   */
  it('reads the file at the fork point, not the base tip', async ({ expect }) => {
    const repo = createTempDir();
    const dependency = build.packageName();
    const workspaceFile = path.join(repo, 'pnpm-workspace.yaml');
    const forked = catalogOf(dependency, '^1.0.0');
    writeFileSync(workspaceFile, forked);
    await initRepo(repo);
    const fork = await commitAll(repo);
    writeFileSync(workspaceFile, catalogOf(dependency, '^2.0.0'));
    await updateRef(repo, 'refs/heads/base', await commitAll(repo, fork));
    writeFileSync(workspaceFile, forked);
    writeFileSync(path.join(repo, 'README.md'), build.packageName());
    await updateRef(repo, 'HEAD', await commitAll(repo, fork));

    const result = await readBaseWorkspace('base', repo, { execute, run });

    expect(result).toBe(forked.trim());
  });

  /*
   * A shallow clone lacks the history linking the base to HEAD. Without a
   * merge base there is no fork point to read, and guessing one misreports.
   */
  it('throws when the base shares no history with HEAD', async ({ expect }) => {
    const base = 'origin/main';
    const source = catalogOf(build.packageName(), '^1.0.0');
    const deps = depsFor({
      'ls-tree': ok('pnpm-workspace.yaml'),
      'merge-base': fail('', 1),
      'rev-parse': ok('abc123'),
      'show': ok(source),
    });

    await expect(readBaseWorkspace(base, '/repo', deps))
      .rejects.toThrow(`no merge base between '${base}' and HEAD`);
  });

  /*
   * Only exit 1 means the two share no history. Anything else (an unborn
   * HEAD, a corrupt object) needs git's own diagnosis, not advice to fetch.
   */
  it('reports git\'s error when merge-base fails for another reason', async ({ expect }) => {
    const stderr = 'fatal: bad object HEAD';
    const deps = depsFor({
      'merge-base': fail(stderr, 128),
      'rev-parse': ok('abc123'),
    });

    await expect(readBaseWorkspace('origin/main', '/repo', deps)).rejects.toThrow(stderr);
  });

  /*
   * The lookups run against the resolved fork point, but the user passed a
   * ref. An error naming only the commit can't be traced back to `--since`.
   */
  it('names both the base ref and its fork point when a lookup fails', async ({ expect }) => {
    const base = 'origin/main';
    const forkPoint = 'abc123';
    const deps = depsFor({
      'ls-tree': fail('fatal: not a tree object'),
      'merge-base': ok(forkPoint),
      'rev-parse': ok(forkPoint),
    });

    await expect(readBaseWorkspace(base, '/repo', deps))
      .rejects.toThrow(`${base} (${forkPoint})`);
  });
});

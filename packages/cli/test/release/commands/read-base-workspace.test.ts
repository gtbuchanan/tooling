import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { execute, run } from '#src/core/process.js';
import { readBaseWorkspace } from '#src/release/commands/changeset.js';
import { createTempDir } from '#test/helpers.js';
import {
  catalogOf,
  depsFor,
  fail,
  ok,
  stagedTree,
} from '#test/release/commands/fixtures.js';

describe.concurrent(readBaseWorkspace, () => {
  it('returns the base revision of the workspace file', async ({ expect }) => {
    const source = catalogOf(build.packageName(), '^1.0.0');
    const deps = depsFor({
      'ls-tree': ok('pnpm-workspace.yaml'),
      'rev-parse': ok('abc123'),
      'show': ok(source),
    });

    const result = await readBaseWorkspace('origin/main', '/repo', deps);

    expect(result).toBe(source);
  });

  it('treats a base predating the file as having no catalogs', async ({ expect }) => {
    const deps = depsFor({
      'ls-tree': ok(''),
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
    const tree = await stagedTree(repo);

    const result = await readBaseWorkspace(tree, workspaceRoot, { execute, run });

    expect(result).toBe(source.trim());
  });
});

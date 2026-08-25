import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { type ExecResult, type RunOptions, execute } from '#src/core/process.js';
import type { CatalogGateDeps } from '#src/release/commands/changeset.js';
import { createTempDir, writeJson } from '#test/helpers.js';

/**
 * A successful command result carrying the given stdout.
 */
export const ok = (stdout: string): ExecResult => ({ exitCode: 0, stderr: '', stdout });

/**
 * A failed command result carrying the given stderr.
 */
export const fail = (stderr: string): ExecResult => ({ exitCode: 1, stderr, stdout: '' });

/**
 * A `pnpm-workspace.yaml` whose default catalog holds one entry.
 */
export const catalogOf = (dependency: string, range: string): string =>
  `packages:\n  - 'packages/*'\ncatalog:\n  ${dependency}: '${range}'\n`;

/**
 * A published package declaring one catalog-backed runtime dependency.
 */
export const publishedConsumer = (packageName: string, dependency: string) => ({
  catalogDependencies: [{ catalog: 'default', name: dependency }],
  isPublished: true,
  name: packageName,
});

/**
 * A `changeset status` that reports a changeset exists.
 */
const statusPasses = (): Promise<void> => Promise.resolve();

/**
 * Builds deps whose `git` responses are keyed by subcommand. Every call is
 * expected to lead with `-C <dir>`, so the subcommand is the third argument.
 */
export const depsFor = (
  responses: Readonly<Record<string, ExecResult>>,
): CatalogGateDeps => ({
  execute: (_command, args) =>
    Promise.resolve(responses[args[2] ?? ''] ?? fail('unexpected call')),
  run: statusPasses,
});

/**
 * Deps that answer `git show` with the given base revision of the workspace.
 */
export const depsShowing = (baseWorkspace: string): CatalogGateDeps =>
  depsFor({
    'ls-tree': ok('pnpm-workspace.yaml'),
    'rev-parse': ok('abc123'),
    'show': ok(baseWorkspace),
  });

const git = async (cwd: string, args: readonly string[]): Promise<string> => {
  const result = await execute('git', ['-C', cwd, ...args]);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }

  return result.stdout;
};

/**
 * Initializes a git repository at `repo`, stages everything under it, and
 * returns the staged tree's id. A tree is a valid base for every read the gate
 * makes, and writing one needs no committer identity and runs no hooks.
 */
export const stagedTree = async (repo: string): Promise<string> => {
  await git(repo, ['init', '--quiet']);
  await git(repo, ['add', '--all']);

  return git(repo, ['write-tree']);
};

/**
 * One recorded `run` invocation.
 */
export interface SpawnedCommand {
  readonly command: string;
  readonly options?: RunOptions;
}

/**
 * Deps that record every git invocation and every spawned command alongside a
 * fixed base revision.
 */
export const recordingDeps = (
  baseWorkspace: string,
): CatalogGateDeps & {
  readonly calls: string[][];
  readonly spawned: SpawnedCommand[];
} => {
  const calls: string[][] = [];
  const spawned: SpawnedCommand[] = [];

  return {
    calls,
    execute: (_command, args) => {
      calls.push([...args]);

      return Promise.resolve(depsShowing(baseWorkspace).execute(_command, args));
    },
    run: (command, options) => {
      spawned.push({ command, ...(options !== undefined && { options }) });

      return Promise.resolve();
    },
    spawned,
  };
};

/**
 * A scaffolded temp monorepo with one catalog-backed published package.
 */
export interface CatalogWorkspace {
  readonly baseWorkspace: string;
  readonly dependency: string;
  readonly packageName: string;
  readonly root: string;
}

/**
 * Scaffolds a temp monorepo whose one published package declares a
 * catalog-backed runtime dependency, with the catalog already re-ranged
 * relative to the returned base revision.
 */
export const createCatalogWorkspace = (): CatalogWorkspace => {
  const root = createTempDir();
  const dependency = build.packageName();
  const packageName = build.scopedPackageName();

  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), catalogOf(dependency, '^2.0.0'));
  writeJson(root, 'package.json', { name: build.packageName(), private: true });

  const pkgDir = path.join(root, 'packages', build.packageName());
  mkdirSync(pkgDir, { recursive: true });
  writeJson(pkgDir, 'package.json', {
    dependencies: { [dependency]: 'catalog:' },
    name: packageName,
    publishConfig: { directory: build.publishDirectory() },
    version: build.semverVersion(),
  });

  const changesetDir = path.join(root, '.changeset');
  mkdirSync(changesetDir, { recursive: true });
  writeJson(changesetDir, 'config.json', { ignore: [] });

  return {
    baseWorkspace: catalogOf(dependency, '^1.0.0'),
    dependency,
    packageName,
    root,
  };
};

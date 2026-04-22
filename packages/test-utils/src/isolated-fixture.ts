import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exec } from './lib/command.ts';
import { pinned, resolveTarballs } from './lib/tarball.ts';

interface IsolatedFixtureOptions {
  readonly depsPackages?: readonly string[];
  readonly hookPackages: readonly string[];
  readonly packageName: string;
}

/**
 * Disposable fixture with separate hook, deps, and project directories
 * joined via `NODE_PATH`. Used for e2e tests that need split dependency contexts.
 */
export interface IsolatedFixture {
  readonly depsDir: string;
  readonly hookDir: string;
  readonly nodePath: string;
  readonly projectDir: string;
  readonly [Symbol.dispose]: () => void;
}

const npmInit = (cwd: string, packages: readonly string[]): void => {
  exec('npm', ['init', '-y'], { cwd });
  exec('npm', ['install', ...packages], { cwd });
};

const createSubdir = (parent: string, name: string): string => {
  const dir = path.join(parent, name);
  mkdirSync(dir);
  return dir;
};

/**
 * Creates an {@link IsolatedFixture} from a tarball. Installs hook and deps
 * packages into separate directories so `NODE_PATH` controls resolution order.
 */
export const createIsolatedFixture = (options: IsolatedFixtureOptions): IsolatedFixture => {
  const tarballs = resolveTarballs(options.packageName);
  const baseDir = mkdtempSync(path.join(tmpdir(), 'e2e-isolated-'));
  const projectDir = mkdtempSync(path.join(tmpdir(), 'e2e-project-'));

  const hookDir = createSubdir(baseDir, 'hook');
  const depsDir = createSubdir(baseDir, 'deps');

  npmInit(hookDir, options.hookPackages.map(pinned));
  npmInit(depsDir, [...tarballs, ...(options.depsPackages ?? []).map(pinned)]);

  const nodePath = [
    path.join(hookDir, 'node_modules'),
    path.join(depsDir, 'node_modules'),
  ].join(path.delimiter);

  return {
    depsDir,
    hookDir,
    nodePath,
    projectDir,
    [Symbol.dispose]() {
      rmSync(baseDir, { force: true, recursive: true });
      rmSync(projectDir, { force: true, recursive: true });
    },
  };
};

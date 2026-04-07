import type { SpawnSyncOptions } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { devNull, tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import crossSpawn from 'cross-spawn';
import { findUpSync } from 'find-up-simple';
import * as v from 'valibot';
import { type TestAPI, it as base } from 'vitest';

const exec = (command: string, args: readonly string[], options: SpawnSyncOptions): void => {
  const result = crossSpawn.sync(command, [...args], { ...options, stdio: 'ignore' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`);
  }
};

const PackageJson = v.object({ version: v.string() });

const require = createRequire(import.meta.url);

/**
 * Resolves a package name to `name@version` using the version currently
 * installed in this project's node_modules. This pins e2e fixture installs
 * to the exact versions tested during development.
 */
export const pinned = (name: string): string => {
  const entryDir = dirname(require.resolve(name));
  const pkgPath = findUpSync('package.json', { cwd: entryDir });
  if (pkgPath === undefined) {
    throw new Error(`Could not find package.json for ${name}`);
  }
  const { version } = v.parse(PackageJson, JSON.parse(readFileSync(pkgPath, 'utf-8')));
  return `${name}@${version}`;
};

/**
 * Matches a single tarball filename from a list of files for the given
 * package name. Pure function — no filesystem access.
 */
export const matchTarball = (files: readonly string[], packageName: string): string => {
  // Tarball names from pnpm pack: gtbuchanan-eslint-config-0.0.0.tgz
  // Convert @gtbuchanan/eslint-config -> gtbuchanan-eslint-config
  const needle = packageName.replace(/^@/v, '').replace(/\//v, '-');
  const pattern = new RegExp(`^${needle}-\\d`, 'v');
  const tarballs = files.filter(
    file => file.endsWith('.tgz') && pattern.test(file),
  );
  const [tgzName] = tarballs;
  if (tarballs.length !== 1 || tgzName === undefined) {
    const count = String(tarballs.length);
    throw new Error(
      `Expected exactly 1 tarball matching "${needle}", found ${count}`,
    );
  }
  return tgzName;
};

const locateTarball = (packageName: string): string => {
  const outDir = process.env['OUTPUT_DIR'] ?? join(process.cwd(), 'dist');
  const packagesDir = join(outDir, 'packages');
  return join(packagesDir, matchTarball(readdirSync(packagesDir), packageName));
};

/** Result of a synchronous child process execution. */
export interface CommandResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * Creates a git environment isolated from user/system config (e.g. GPG signing, hooks).
 * Optionally includes a committer identity for commands that require one.
 */
/** Git environment with isolation properties and optional identity. */
interface GitEnv extends NodeJS.ProcessEnv {
  readonly GIT_AUTHOR_EMAIL?: string;
  readonly GIT_AUTHOR_NAME?: string;
  readonly GIT_COMMITTER_EMAIL?: string;
  readonly GIT_COMMITTER_NAME?: string;
  readonly GIT_CONFIG_GLOBAL: string;
  readonly GIT_CONFIG_NOSYSTEM: string;
}

export const createGitEnv = (identity?: { email: string; name: string }): GitEnv => ({
  ...process.env,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  ...(identity && {
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_AUTHOR_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
  }),
});

/** Spawns a command synchronously, captures stdout/stderr, and returns the result. */
export const runCommand = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptions,
): CommandResult => {
  const result = crossSpawn.sync(command, [...args], {
    ...options,
    encoding: 'utf-8',
    stdio: 'pipe',
  });
  if (result.error) {
    throw result.error;
  }
  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr,
    stdout: result.stdout,
  };
};

// --- Isolated fixture (split hook/deps/project dirs via NODE_PATH) ---

interface IsolatedFixtureOptions {
  readonly depsPackages?: readonly string[];
  readonly hookPackages: readonly string[];
  readonly packageName: string;
  /**
   * Additional workspace package names whose tarballs should be installed
   * alongside the primary package (e.g. unpublished workspace dependencies).
   */
  readonly workspaceDeps?: readonly string[];
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
  const dir = join(parent, name);
  mkdirSync(dir);
  return dir;
};

const resolveTarballs = (
  options: Pick<ProjectFixtureOptions, 'packageName' | 'workspaceDeps'>,
): readonly string[] => [
  locateTarball(options.packageName),
  ...(options.workspaceDeps ?? []).map(locateTarball),
];

/**
 * Creates an {@link IsolatedFixture} from a tarball. Installs hook and deps
 * packages into separate directories so `NODE_PATH` controls resolution order.
 */
export const createIsolatedFixture = (options: IsolatedFixtureOptions): IsolatedFixture => {
  const tarballs = resolveTarballs(options);
  const baseDir = mkdtempSync(join(tmpdir(), 'e2e-isolated-'));
  const projectDir = mkdtempSync(join(tmpdir(), 'e2e-project-'));

  const hookDir = createSubdir(baseDir, 'hook');
  const depsDir = createSubdir(baseDir, 'deps');

  npmInit(hookDir, options.hookPackages.map(pinned));
  npmInit(depsDir, [...tarballs, ...(options.depsPackages ?? []).map(pinned)]);

  const nodePath = [
    join(hookDir, 'node_modules'),
    join(depsDir, 'node_modules'),
  ].join(delimiter);

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

// --- Simple project fixture (single npm install context) ---

interface ProjectFixtureOptions {
  readonly packages?: readonly string[];
  readonly packageName: string;
  /**
   * Additional workspace package names whose tarballs should be installed
   * alongside the primary package (e.g. unpublished workspace dependencies).
   */
  readonly workspaceDeps?: readonly string[];
}

/**
 * Disposable fixture with a single npm project directory.
 * Provides helpers to write files and run local binaries.
 */
export interface ProjectFixture {
  readonly projectDir: string;
  readonly run: (command: string, args: readonly string[]) => CommandResult;
  readonly writeFile: (name: string, content: string) => string;
  readonly [Symbol.dispose]: () => void;
}

/**
 * Creates a {@link ProjectFixture} from a tarball. Initializes an ESM
 * project and installs the package under test plus optional dependencies.
 */
export const createProjectFixture = (
  options: ProjectFixtureOptions,
): ProjectFixture => {
  const tarballs = resolveTarballs(options);
  const projectDir = mkdtempSync(join(tmpdir(), 'e2e-build-'));

  const pinnedPkgs = (options.packages ?? []).map(pinned);
  exec('npm', ['init', '-y', '--init-type', 'module'], { cwd: projectDir });
  exec('npm', ['install', ...tarballs, ...pinnedPkgs], { cwd: projectDir });

  const writeFile = (name: string, content: string): string => {
    const filePath = join(projectDir, name);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
    return filePath;
  };

  const run = (command: string, args: readonly string[]): CommandResult => {
    const binPath = join(projectDir, 'node_modules', '.bin', command);
    return runCommand(binPath, args, { cwd: projectDir });
  };

  return {
    projectDir,
    run,
    writeFile,
    [Symbol.dispose]() {
      rmSync(projectDir, { force: true, recursive: true });
    },
  };
};

/**
 * Extends the base `it` with a file-scoped {@link ProjectFixture} via
 * Vitest's fixture API. The fixture is created once per test file and
 * disposed automatically.
 */
export const extendWithFixture = (
  create: () => ProjectFixture,
): TestAPI<{ fixture: ProjectFixture }> => base.extend<{ fixture: ProjectFixture }>({
  // oxlint-disable-next-line no-empty-pattern -- Vitest fixture requires destructuring
  fixture: [async ({}, use) => {
    using fixture = create();
    await use(fixture);
  }, { scope: 'file' }],
});

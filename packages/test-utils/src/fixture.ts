import type { SpawnOptions, SpawnSyncOptions } from 'node:child_process';
import {
  globSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { devNull, tmpdir } from 'node:os';
import path from 'node:path';
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

const PackageJson = v.object({
  dependencies: v.optional(v.record(v.string(), v.string())),
  name: v.optional(v.string()),
  version: v.string(),
});

type PackageJson = v.InferOutput<typeof PackageJson>;

const require = createRequire(import.meta.url);

/**
 * Resolves a package name to `name@version` using the version currently
 * installed in this project's node_modules. This pins e2e fixture installs
 * to the exact versions tested during development.
 */
export const pinned = (name: string): string => {
  const entryDir = path.dirname(require.resolve(name));
  const pkgPath = findUpSync('package.json', { cwd: entryDir });
  if (pkgPath === undefined) {
    throw new Error(`Could not find package.json for ${name}`);
  }
  const { version } = v.parse(PackageJson, JSON.parse(readFileSync(pkgPath, 'utf8')));
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
  const pattern = new RegExp(String.raw`^${needle}-\d`, 'v');
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

interface TarballEntry {
  readonly dir: string;
  readonly name: string;
}

/*
 * Workspace layout is coupled to the `packages/*` convention documented in
 * AGENTS.md. If the layout ever changes, update both this helper and
 * `buildWorkspaceIndex` — or drive them from `pnpm-workspace.yaml` globs.
 */
const findWorkspaceRoot = (): string => {
  const wsFile = findUpSync('pnpm-workspace.yaml', { cwd: process.cwd() });
  return wsFile === undefined ? process.cwd() : path.dirname(wsFile);
};

/*
 * Workspace state is stable across test fixtures within a single worker.
 * Memoize the derived values so each additional fixture is O(1).
 */
const cache: {
  index?: ReadonlyMap<string, PackageJson>;
  root?: string;
  tarballs?: readonly TarballEntry[];
} = {};

const getWorkspaceRoot = (): string =>
  cache.root ??= findWorkspaceRoot();

const getTarballs = (): readonly TarballEntry[] =>
  cache.tarballs ??= collectTarballs();

const getIndex = (): ReadonlyMap<string, PackageJson> =>
  cache.index ??= buildWorkspaceIndex();

const collectTarballs = (): readonly TarballEntry[] => {
  const wsRoot = getWorkspaceRoot();
  const packDirs = [
    // Monorepo: per-package tarballs
    ...globSync('packages/*/dist/packages/npm', { cwd: wsRoot }),
    // Single-package: root tarballs
    ...globSync('dist/packages/npm', { cwd: wsRoot }),
  ];
  return packDirs.flatMap((packDir) => {
    const abs = path.join(wsRoot, packDir);
    return readdirSync(abs).map(file => ({ dir: abs, name: file }));
  });
};

const locateTarballFrom = (
  entries: readonly TarballEntry[],
  packageName: string,
): string => {
  const name = matchTarball(entries.map(entry => entry.name), packageName);
  const match = entries.find(entry => entry.name === name);
  if (match === undefined) {
    throw new Error(`Tarball ${name} not found`);
  }
  return path.join(match.dir, match.name);
};

/** Result of a child process execution. */
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

/** Spawns a command, captures stdout/stderr, and returns the result. */
export const runCommand = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
): Promise<CommandResult> => new Promise((resolve, reject) => {
  const child = crossSpawn(command, args, {
    ...options,
    stdio: 'pipe',
  });

  let stdout = '';
  let stderr = '';

  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });

  child.on('error', reject);
  child.on('close', (code) => {
    resolve({
      exitCode: code ?? 1,
      stderr,
      stdout,
    });
  });
});

// --- Isolated fixture (split hook/deps/project dirs via NODE_PATH) ---

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

const buildWorkspaceIndex = (): ReadonlyMap<string, PackageJson> => {
  const wsRoot = getWorkspaceRoot();
  const index = new Map<string, PackageJson>();

  for (const pkgJsonPath of globSync('packages/*/package.json', { cwd: wsRoot })) {
    const abs = path.join(wsRoot, pkgJsonPath);
    const pkg = v.parse(PackageJson, JSON.parse(readFileSync(abs, 'utf8')));
    if (pkg.name !== undefined) index.set(pkg.name, pkg);
  }

  return index;
};

/**
 * Recursively collects all transitive `workspace:` dependencies from
 * a package's `dependencies` field. These are co-published workspace
 * packages whose tarballs must be installed alongside the primary package.
 * `devDependencies` and `peerDependencies` are intentionally excluded —
 * they are not co-published.
 */
const resolveWorkspaceDeps = (
  packageName: string,
  index: ReadonlyMap<string, PackageJson>,
  visited = new Set<string>(),
): readonly string[] => {
  if (visited.has(packageName)) return [];
  visited.add(packageName);

  const pkg = index.get(packageName);
  if (pkg === undefined) return [];

  const direct = Object.entries(pkg.dependencies ?? {})
    .filter(([, spec]) => spec.startsWith('workspace:'))
    .map(([name]) => name);

  return [
    ...direct,
    ...direct.flatMap(dep => resolveWorkspaceDeps(dep, index, visited)),
  ];
};

const resolveTarballs = (packageName: string): readonly string[] => {
  const entries = getTarballs();
  const index = getIndex();
  const names = [...new Set([packageName, ...resolveWorkspaceDeps(packageName, index)])];
  return names.map(name => locateTarballFrom(entries, name));
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

// --- Simple project fixture (single npm install context) ---

interface ProjectFixtureOptions {
  readonly packages?: readonly string[];
  readonly packageName: string;
}

/**
 * Disposable fixture with a single npm project directory.
 * Provides helpers to write files and run local binaries.
 */
export interface ProjectFixture {
  readonly projectDir: string;
  readonly run: (command: string, args: readonly string[]) => Promise<CommandResult>;
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
  const tarballs = resolveTarballs(options.packageName);
  const projectDir = mkdtempSync(path.join(tmpdir(), 'e2e-build-'));

  const pinnedPkgs = (options.packages ?? []).map(pinned);
  exec('npm', ['init', '-y', '--init-type', 'module'], { cwd: projectDir });
  exec('npm', ['install', ...tarballs, ...pinnedPkgs], { cwd: projectDir });

  const writeFile = (name: string, content: string): string => {
    const filePath = path.join(projectDir, name);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
    return filePath;
  };

  const run = (command: string, args: readonly string[]): Promise<CommandResult> => {
    const binPath = path.join(projectDir, 'node_modules', '.bin', command);
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

  fixture: [async ({}, use) => {
    using fixture = create();
    await use(fixture);
  }, { scope: 'file' }],
});
